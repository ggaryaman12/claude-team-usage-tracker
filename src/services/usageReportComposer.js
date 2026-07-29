const { classifyStatus } = require("./statusClassifier");
const { formatResetTime } = require("./resetTimeFormatter");
const { summarizeDeviceActivity } = require("./deviceActivity");

// A report older than this is shown as "stale" rather than a trusted
// current number — someone who hasn't touched Claude Code in a while has
// an unknown current state, not necessarily the state they last reported.
// Matches the hourly auto-push cadence (server.js) and the device-activity
// window (deviceActivity.js) — a report from just before the last push
// shouldn't read as stale for most of the hour until the next one.
const FRESHNESS_WINDOW_MS = 60 * 60 * 1000;

// The last report we got told us exactly when a usage window resets
// (fiveHourResetsAt / sevenDayResetsAt come straight from Anthropic). If
// that timestamp has already passed by the time someone's looking at the
// dashboard, the window HAS reset — even if nobody has used the account
// since and no fresh report has confirmed it. Showing the old stale
// percentage forever (e.g. "88% used" for hours after it actually reset
// back to 0%) is actively misleading, so this infers the reset from time
// alone rather than waiting for a hit that may never come. It's clearly
// flagged as inferred (not measured) wherever it's shown, and the moment
// a real report comes in, that replaces it with a real number as normal.
function applyInferredReset(pctUsed, resetsAtIso, nowFn) {
  if (!resetsAtIso) {
    return { pctUsed, wasInferredReset: false, resetLabel: null };
  }
  const resetMs = new Date(resetsAtIso).getTime();
  if (Number.isNaN(resetMs)) {
    return { pctUsed, wasInferredReset: false, resetLabel: formatResetTime(resetsAtIso, nowFn) };
  }
  if (nowFn() >= resetMs) {
    // The window has passed its known reset time. We don't know the NEXT
    // reset time until a fresh report tells us, so there's no countdown
    // to show — just the inferred 0%.
    return { pctUsed: 0, wasInferredReset: true, resetLabel: null };
  }
  return { pctUsed, wasInferredReset: false, resetLabel: formatResetTime(resetsAtIso, nowFn) };
}

/**
 * Combines the account list with whatever usage each account's local hook
 * has last reported, adding a freshness flag.
 *
 * @param {Array<{name: string, contact: string}>} accounts
 * @param {Function} getReportedUsageFn - (accountName) => report|null
 * @param {Function} [nowFn] - injectable for testing
 * @returns {Array} one entry per account: {name, contact, hasReport: false}
 *   or {name, contact, hasReport: true, isFresh, ageMinutes,
 *   fiveHourPctUsed, sevenDayPctUsed, fiveHourWasInferredReset,
 *   sevenDayWasInferredReset, status}
 */
function composeUsageResults(accounts, getReportedUsageFn, nowFn = Date.now) {
  return accounts.map((account) => {
    const report = getReportedUsageFn(account.name);
    if (!report) {
      return { name: account.name, contact: account.contact, hasReport: false };
    }

    const ageMs = nowFn() - new Date(report.reportedAt).getTime();
    const ageMinutes = Math.max(0, Math.round(ageMs / 60000));

    const fiveHour = applyInferredReset(report.fiveHourPctUsed, report.fiveHourResetsAt, nowFn);
    const sevenDay = applyInferredReset(report.sevenDayPctUsed, report.sevenDayResetsAt, nowFn);

    return {
      name: account.name,
      contact: account.contact,
      hasReport: true,
      isFresh: ageMs <= FRESHNESS_WINDOW_MS,
      ageMinutes,
      fiveHourPctUsed: fiveHour.pctUsed,
      sevenDayPctUsed: sevenDay.pctUsed,
      fiveHourWasInferredReset: fiveHour.wasInferredReset,
      sevenDayWasInferredReset: sevenDay.wasInferredReset,
      fiveHourResetLabel: fiveHour.resetLabel,
      sevenDayResetLabel: sevenDay.resetLabel,
      status: classifyStatus(fiveHour.pctUsed, sevenDay.pctUsed),
      ...summarizeDeviceActivity(report.devices, nowFn),
    };
  });
}

module.exports = { composeUsageResults, FRESHNESS_WINDOW_MS };
