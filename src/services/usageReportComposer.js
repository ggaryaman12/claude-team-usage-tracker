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

/**
 * Combines the account list with whatever usage each account's local hook
 * has last reported, adding a freshness flag.
 *
 * @param {Array<{name: string, contact: string}>} accounts
 * @param {Function} getReportedUsageFn - (accountName) => report|null
 * @param {Function} [nowFn] - injectable for testing
 * @returns {Array} one entry per account: {name, contact, hasReport: false}
 *   or {name, contact, hasReport: true, isFresh, ageMinutes,
 *   fiveHourPctUsed, sevenDayPctUsed, status}
 */
function composeUsageResults(accounts, getReportedUsageFn, nowFn = Date.now) {
  return accounts.map((account) => {
    const report = getReportedUsageFn(account.name);
    if (!report) {
      return { name: account.name, contact: account.contact, hasReport: false };
    }

    const ageMs = nowFn() - new Date(report.reportedAt).getTime();
    const ageMinutes = Math.max(0, Math.round(ageMs / 60000));

    return {
      name: account.name,
      contact: account.contact,
      hasReport: true,
      isFresh: ageMs <= FRESHNESS_WINDOW_MS,
      ageMinutes,
      fiveHourPctUsed: report.fiveHourPctUsed,
      sevenDayPctUsed: report.sevenDayPctUsed,
      fiveHourResetLabel: formatResetTime(report.fiveHourResetsAt, nowFn),
      sevenDayResetLabel: formatResetTime(report.sevenDayResetsAt, nowFn),
      status: classifyStatus(report.fiveHourPctUsed, report.sevenDayPctUsed),
      ...summarizeDeviceActivity(report.devices, nowFn),
    };
  });
}

module.exports = { composeUsageResults, FRESHNESS_WINDOW_MS };
