// Cross-account view of "which physical device is consuming how much
// Claude usage" — grouped by deviceId rather than by account, so a device
// that's been used to log into more than one shared account shows up as
// one row with every account it's touched, not scattered across each
// account's own card. Feeds the passkey-gated admin devices page, kept
// deliberately separate from the public /dashboard (see server.js).
//
// Enriched beyond a single latest-percentage snapshot using only fields
// already collected (no changes to the report-usage hook itself): min/avg/
// peak for both usage windows, how often that device's reports actually
// hit "low"/"exhausted", a 24-hour IST activity distribution (not just a
// single peak-hour label), a recent raw check-in log, and 5hr/7day
// sparkline series — all computed purely from existing reportedAt/status/
// percentage fields.

const { IST_OFFSET_MS } = require("./hourlyScheduler");

const RECENT_CHECKINS_LIMIT = 12;
const LIVE_WINDOW_MS = 15 * 60 * 1000;

function istHourOfDay(reportedAtIso) {
  const ms = new Date(reportedAtIso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + IST_OFFSET_MS).getUTCHours();
}

function formatHourLabel(hour) {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

function buildHourlyDistribution(entries) {
  const counts = new Array(24).fill(0);
  entries.forEach((entry) => {
    const hour = istHourOfDay(entry.reportedAt);
    if (hour !== null) counts[hour] += 1;
  });
  return counts;
}

function computePeakHourLabel(entries, hourlyDistribution) {
  if (entries.length < 3) {
    return null; // too little data for a meaningful pattern
  }
  const maxCount = Math.max(...hourlyDistribution);
  if (maxCount === 0) return null;
  const peakHour = hourlyDistribution.indexOf(maxCount);
  return `around ${formatHourLabel(peakHour)} IST`;
}

function average(values) {
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * @param {Array<{name: string}>} accounts
 * @param {Function} getReportedUsageFn - (accountName) => {devices?: Object<string,{deviceLabel?:string}>}|null
 * @param {Function} getUsageHistoryFn - (accountName) => Array<{deviceId?:string, fiveHourPctUsed:number, sevenDayPctUsed:number, status?:string, reportedAt:string}>
 * @param {Function} [nowFn] - injectable for testing
 * @returns {Array<Object>} newest-last-seen first; see inline fields
 */
function buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn, nowFn = Date.now) {
  const labelById = {};
  accounts.forEach((account) => {
    const report = getReportedUsageFn(account.name);
    const devices = (report && report.devices) || {};
    Object.entries(devices).forEach(([deviceId, device]) => {
      if (!labelById[deviceId]) {
        labelById[deviceId] = device.deviceLabel || deviceId;
      }
    });
  });

  const groups = {};
  accounts.forEach((account) => {
    const history = getUsageHistoryFn(account.name) || [];
    history.forEach((entry) => {
      const deviceId = entry.deviceId || "unknown-device";
      if (!groups[deviceId]) {
        groups[deviceId] = { deviceId, accountNames: new Set(), entries: [] };
      }
      groups[deviceId].accountNames.add(account.name);
      groups[deviceId].entries.push(entry);
    });
  });

  const rows = Object.values(groups).map((group) => {
    const sorted = group.entries
      .slice()
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
    const latest = sorted[0];
    const earliest = sorted[sorted.length - 1];

    const fiveHourValues = group.entries.map((e) => e.fiveHourPctUsed);
    const sevenDayValues = group.entries.map((e) => e.sevenDayPctUsed);

    const exhaustedCount = group.entries.filter((e) => e.status === "exhausted").length;
    const lowCount = group.entries.filter((e) => e.status === "low").length;
    const availableCount = group.entries.length - exhaustedCount - lowCount;

    const spanMs = new Date(latest.reportedAt).getTime() - new Date(earliest.reportedAt).getTime();
    const spanDays = spanMs / (24 * 60 * 60 * 1000);
    // Extrapolating a handful of check-ins from a couple hours' span up to
    // a "per day" rate produces absurd numbers (4 reports in 1h50m looked
    // like "51/day") — require at least 12 hours of real span before
    // showing a rate at all, so it's actually representative rather than
    // a burst multiplied up.
    const MIN_SPAN_DAYS_FOR_RATE = 0.5; // 12 hours
    const reportsPerDay =
      group.entries.length >= 3 && spanDays >= MIN_SPAN_DAYS_FOR_RATE
        ? Math.round(group.entries.length / spanDays)
        : null;

    const hourlyDistribution = buildHourlyDistribution(group.entries);
    const chronological = sorted.slice().reverse();
    const lastSeenMinutesAgo = Math.max(0, Math.round((nowFn() - new Date(latest.reportedAt).getTime()) / 60000));

    return {
      deviceId: group.deviceId,
      label: labelById[group.deviceId] || group.deviceId,
      accountNames: Array.from(group.accountNames).sort(),
      reportCount: group.entries.length,
      minFiveHourPctUsed: Math.min(...fiveHourValues),
      avgFiveHourPctUsed: average(fiveHourValues),
      maxFiveHourPctUsed: Math.max(...fiveHourValues),
      minSevenDayPctUsed: Math.min(...sevenDayValues),
      avgSevenDayPctUsed: average(sevenDayValues),
      maxSevenDayPctUsed: Math.max(...sevenDayValues),
      lastFiveHourPctUsed: latest.fiveHourPctUsed,
      lastSevenDayPctUsed: latest.sevenDayPctUsed,
      lastReportedAt: latest.reportedAt,
      lastSeenMinutesAgo,
      isLive: nowFn() - new Date(latest.reportedAt).getTime() <= LIVE_WINDOW_MS,
      firstReportedAt: earliest.reportedAt,
      exhaustedCount,
      lowCount,
      availableCount,
      reportsPerDay,
      peakHourLabel: computePeakHourLabel(group.entries, hourlyDistribution),
      hourlyDistribution,
      sparklinePoints: chronological.map((e) => e.fiveHourPctUsed),
      sevenDaySparklinePoints: chronological.map((e) => e.sevenDayPctUsed),
      recentCheckIns: sorted.slice(0, RECENT_CHECKINS_LIMIT),
    };
  });

  rows.sort((a, b) => new Date(b.lastReportedAt).getTime() - new Date(a.lastReportedAt).getTime());
  return rows;
}

module.exports = { buildDeviceConsumptionRows, RECENT_CHECKINS_LIMIT, LIVE_WINDOW_MS };
