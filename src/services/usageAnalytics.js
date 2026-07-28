// Turns raw per-account history (see usageHistoryStore.js) into the
// "detailed analytics" numbers the dashboard shows: trend, average/peak
// usage, how often an account has actually run dry, and how many distinct
// devices have ever reported for it (a longer-horizon view than
// deviceActivity.js's "active right now" signal).

const SPARKLINE_MAX_POINTS = 24;
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // "today" for the reports-count stat

/**
 * @param {Array<{fiveHourPctUsed:number, sevenDayPctUsed:number, status:string, deviceId?:string, reportedAt:string}>} history
 * @param {Function} [nowFn] - injectable for testing
 * @returns {{hasHistory:false}|{hasHistory:true, reportCount:number, avgFiveHourPctUsed:number,
 *   maxFiveHourPctUsed:number, exhaustedCount:number, distinctDevicesEverSeen:number,
 *   reportsLast24h:number, sparklinePoints:number[]}}
 */
function summarizeAccountAnalytics(history, nowFn = Date.now) {
  if (!history || history.length === 0) {
    return { hasHistory: false };
  }

  const fiveHourValues = history.map((h) => h.fiveHourPctUsed);
  const avgFiveHourPctUsed = Math.round(
    fiveHourValues.reduce((sum, v) => sum + v, 0) / fiveHourValues.length
  );
  const maxFiveHourPctUsed = Math.max(...fiveHourValues);
  const exhaustedCount = history.filter((h) => h.status === "exhausted").length;
  const distinctDevicesEverSeen = new Set(history.map((h) => h.deviceId || "unknown-device")).size;
  const reportsLast24h = history.filter(
    (h) => nowFn() - new Date(h.reportedAt).getTime() <= RECENT_WINDOW_MS
  ).length;

  return {
    hasHistory: true,
    reportCount: history.length,
    avgFiveHourPctUsed,
    maxFiveHourPctUsed,
    exhaustedCount,
    distinctDevicesEverSeen,
    reportsLast24h,
    sparklinePoints: fiveHourValues.slice(-SPARKLINE_MAX_POINTS),
  };
}

/**
 * @param {Array<{name: string, analytics: ReturnType<typeof summarizeAccountAnalytics>}>} perAccountAnalytics
 * @returns {{hasData:false}|{hasData:true, avgFiveHourPctUsedAcrossTeam:number,
 *   totalExhaustedEvents:number, busiestAccountName:string|null}}
 */
function summarizeTeamAnalytics(perAccountAnalytics) {
  const withHistory = perAccountAnalytics.filter((a) => a.analytics && a.analytics.hasHistory);
  if (withHistory.length === 0) {
    return { hasData: false };
  }

  const avgFiveHourPctUsedAcrossTeam = Math.round(
    withHistory.reduce((sum, a) => sum + a.analytics.avgFiveHourPctUsed, 0) / withHistory.length
  );
  const totalExhaustedEvents = withHistory.reduce((sum, a) => sum + a.analytics.exhaustedCount, 0);
  const busiest = withHistory.slice().sort((a, b) => b.analytics.reportCount - a.analytics.reportCount)[0];

  return {
    hasData: true,
    avgFiveHourPctUsedAcrossTeam,
    totalExhaustedEvents,
    busiestAccountName: busiest ? busiest.name : null,
  };
}

module.exports = { summarizeAccountAnalytics, summarizeTeamAnalytics, SPARKLINE_MAX_POINTS };
