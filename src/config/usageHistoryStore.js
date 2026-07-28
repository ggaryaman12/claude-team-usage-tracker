const fs = require("fs");
const path = require("path");
const { logger } = require("../utilities/logger");

// Plain gitignored JSON file, keyed by account name — a bounded time series
// of past reports, separate from reportedUsageStore.js's "latest snapshot"
// file. This is what makes trend analytics possible (usage over time, peak
// hours, how often an account runs dry) instead of only ever seeing the
// most recent number.
//
// Two independent bounds keep this file small regardless of how often the
// Stop hook fires — important since this box has explicit memory/disk
// caps (see the systemd unit's MemoryHigh/MemoryMax):
//   - MAX_ENTRIES_PER_ACCOUNT: a hard count cap, applied on every write.
//   - MAX_AGE_MS: entries older than 2 days are dropped — old per-report
//     log lines aren't useful once the trend/analytics window has moved
//     past them, so there's no reason to keep paying disk/memory for them.
// Entries with an unparseable reportedAt are kept rather than dropped —
// we'd rather retain a record we can't date than silently lose data.
const HISTORY_FILE_PATH = path.join(__dirname, "usageHistory.json");
const MAX_ENTRIES_PER_ACCOUNT = 300;
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

function pruneEntries(list, nowFn) {
  const now = nowFn();
  return list
    .filter((entry) => {
      const ageMs = now - new Date(entry.reportedAt).getTime();
      return Number.isNaN(ageMs) || ageMs <= MAX_AGE_MS;
    })
    .slice(-MAX_ENTRIES_PER_ACCOUNT);
}

function loadUsageHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * @param {string} accountName
 * @param {{fiveHourPctUsed: number, sevenDayPctUsed: number, status: string, deviceId?: string}} entry
 * @param {string} reportedAtIso - injectable for testing
 * @param {Function} [nowFn] - injectable for testing; used for age-based pruning
 */
function appendUsageHistory(accountName, entry, reportedAtIso = new Date().toISOString(), nowFn = Date.now) {
  const history = loadUsageHistory();
  const list = history[accountName] || [];
  list.push({ ...entry, reportedAt: reportedAtIso });
  history[accountName] = pruneEntries(list, nowFn);

  try {
    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("appendUsageHistory: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

/**
 * @param {string} accountName
 * @param {Function} [nowFn] - injectable for testing
 * @returns {Array<{fiveHourPctUsed: number, sevenDayPctUsed: number, status: string, deviceId?: string, reportedAt: string}>}
 */
function getUsageHistory(accountName, nowFn = Date.now) {
  const history = loadUsageHistory();
  return pruneEntries(history[accountName] || [], nowFn);
}

/**
 * Sweeps every account's history, dropping entries older than MAX_AGE_MS
 * (and anything beyond MAX_ENTRIES_PER_ACCOUNT) and persists the result —
 * unlike getUsageHistory's read-time filtering, this actually shrinks the
 * file on disk. Meant to be called periodically (see server.js's hourly
 * timer) so an account that's stopped reporting doesn't leave its old
 * entries sitting on disk forever.
 * @param {Function} [nowFn] - injectable for testing
 * @returns {{ok: boolean, errorMessage?: string}}
 */
function pruneAllAccountsHistory(nowFn = Date.now) {
  const history = loadUsageHistory();
  const pruned = {};
  for (const [accountName, list] of Object.entries(history)) {
    const keep = pruneEntries(list, nowFn);
    if (keep.length > 0) {
      pruned[accountName] = keep;
    }
  }

  try {
    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(pruned), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("pruneAllAccountsHistory: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

module.exports = {
  loadUsageHistory,
  appendUsageHistory,
  getUsageHistory,
  pruneAllAccountsHistory,
  HISTORY_FILE_PATH,
  MAX_ENTRIES_PER_ACCOUNT,
  MAX_AGE_MS,
};
