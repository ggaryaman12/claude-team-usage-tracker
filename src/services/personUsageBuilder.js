// Per-person usage rollup for the admin devices page — answers "who is
// using Claude how much" directly, since deviceConsumptionBuilder.js's
// device-grouped rows answer a different question ("which machine").
// Sourced from the same data (reportedUsage's latest snapshot + full
// history per account), just aggregated the other way.

/**
 * @param {Array<{name: string, contact: string}>} accounts
 * @param {Function} getReportedUsageFn - (accountName) => {fiveHourPctUsed, sevenDayPctUsed, devices?: Object}|null
 * @param {Function} getUsageHistoryFn - (accountName) => Array<{fiveHourPctUsed:number, sevenDayPctUsed:number, status?:string}>
 * @returns {Array<{name:string, contact:string, deviceCount:number, totalCheckIns:number,
 *   currentFiveHourPctUsed:number|null, currentSevenDayPctUsed:number|null,
 *   avgFiveHourPctUsed:number|null, maxFiveHourPctUsed:number|null, exhaustedCount:number}>}
 *   sorted by current 5hr usage, busiest first (nulls last)
 */
function buildPersonUsageRows(accounts, getReportedUsageFn, getUsageHistoryFn) {
  const rows = accounts.map((account) => {
    const report = getReportedUsageFn(account.name);
    const history = getUsageHistoryFn(account.name) || [];
    const deviceCount = report && report.devices ? Object.keys(report.devices).length : 0;

    if (history.length === 0) {
      return {
        name: account.name,
        contact: account.contact,
        deviceCount,
        totalCheckIns: 0,
        currentFiveHourPctUsed: report ? report.fiveHourPctUsed : null,
        currentSevenDayPctUsed: report ? report.sevenDayPctUsed : null,
        avgFiveHourPctUsed: null,
        maxFiveHourPctUsed: null,
        exhaustedCount: 0,
      };
    }

    const fiveHourValues = history.map((h) => h.fiveHourPctUsed);
    const exhaustedCount = history.filter((h) => h.status === "exhausted").length;

    return {
      name: account.name,
      contact: account.contact,
      deviceCount,
      totalCheckIns: history.length,
      currentFiveHourPctUsed: report ? report.fiveHourPctUsed : null,
      currentSevenDayPctUsed: report ? report.sevenDayPctUsed : null,
      avgFiveHourPctUsed: Math.round(fiveHourValues.reduce((sum, v) => sum + v, 0) / fiveHourValues.length),
      maxFiveHourPctUsed: Math.max(...fiveHourValues),
      exhaustedCount,
    };
  });

  rows.sort((a, b) => (b.currentFiveHourPctUsed ?? -1) - (a.currentFiveHourPctUsed ?? -1));
  return rows;
}

module.exports = { buildPersonUsageRows };
