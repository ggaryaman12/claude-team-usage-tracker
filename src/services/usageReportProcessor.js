const { classifyStatus } = require("./statusClassifier");

/**
 * Validates and stores one usage report POSTed by a person's local Claude
 * Code hook. The hook forwards Anthropic's raw /api/oauth/usage response
 * shape (never a token) plus the real logged-in account's email — this
 * matches that email against a configured account's loginEmail (not a
 * client-asserted account name) so a shared machine attributes usage
 * correctly no matter which account is actually logged in when the hook
 * fires. See installHookScriptBuilder.js for why this matters.
 *
 * @param {{loginEmail?: string, usage?: {five_hour?: {utilization?: number}, seven_day?: {utilization?: number}}}} body
 * @param {Array<{name: string, loginEmail: string}>} accounts
 * @param {Function} saveReportedUsageFn - (accountName, {fiveHourPctUsed, sevenDayPctUsed}) => {ok, errorMessage?}
 * @param {Function} [appendUsageHistoryFn] - optional (accountName, {fiveHourPctUsed, sevenDayPctUsed, status, deviceId}) => {ok, errorMessage?}
 *   Best-effort trend logging, separate from the "latest snapshot" save above — kept optional so
 *   existing callers/tests that only care about the snapshot don't need to know about history.
 * @returns {{ok: boolean, errorMessage?: string}}
 */
function processUsageReport(body, accounts, saveReportedUsageFn, appendUsageHistoryFn) {
  const loginEmail = body && body.loginEmail;
  if (!loginEmail) {
    return { ok: false, errorMessage: "Missing loginEmail." };
  }

  const matchedAccount = accounts.find(
    (a) => a.loginEmail && a.loginEmail.toLowerCase() === loginEmail.toLowerCase()
  );
  if (!matchedAccount) {
    return { ok: false, errorMessage: `No configured account matches loginEmail "${loginEmail}".` };
  }

  const usage = body && body.usage;
  const fiveHourUtil = usage && usage.five_hour && usage.five_hour.utilization;
  const sevenDayUtil = usage && usage.seven_day && usage.seven_day.utilization;

  if (typeof fiveHourUtil !== "number" || typeof sevenDayUtil !== "number") {
    return { ok: false, errorMessage: "Missing or invalid usage.five_hour/seven_day.utilization." };
  }

  // resets_at is optional/best-effort — Anthropic's response shape isn't
  // contractually guaranteed to always include it, and a missing reset
  // time shouldn't block storing the percentages we do have.
  const fiveHourResetsAt = (usage.five_hour && usage.five_hour.resets_at) || null;
  const sevenDayResetsAt = (usage.seven_day && usage.seven_day.resets_at) || null;

  // deviceId/deviceLabel are also best-effort: an older/pre-device-tracking
  // hook script won't send them, and a report shouldn't be rejected just
  // because it predates this feature — it just gets filed under a shared
  // "unknown-device" bucket in reportedUsageStore.js.
  const deviceId = (body && body.deviceId) || null;
  const deviceLabel = (body && body.deviceLabel) || null;

  // `utilization` is already a 0-100 percentage, not a 0-1 fraction —
  // confirmed against a live response. Round only, do not multiply. See
  // claudeUsageFetcher.js's toPercent() for the fuller note on this bug.
  const saveResult = saveReportedUsageFn(matchedAccount.name, {
    fiveHourPctUsed: Math.round(fiveHourUtil),
    sevenDayPctUsed: Math.round(sevenDayUtil),
    fiveHourResetsAt,
    sevenDayResetsAt,
    deviceId,
    deviceLabel,
  });

  if (!saveResult.ok) {
    return { ok: false, errorMessage: saveResult.errorMessage };
  }

  if (typeof appendUsageHistoryFn === "function") {
    appendUsageHistoryFn(matchedAccount.name, {
      fiveHourPctUsed: Math.round(fiveHourUtil),
      sevenDayPctUsed: Math.round(sevenDayUtil),
      status: classifyStatus(Math.round(fiveHourUtil), Math.round(sevenDayUtil)),
      deviceId,
    });
  }

  return { ok: true };
}

module.exports = { processUsageReport };
