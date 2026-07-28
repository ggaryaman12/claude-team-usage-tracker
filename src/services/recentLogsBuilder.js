// Flattens per-account usage history (see usageHistoryStore.js) into one
// chronological feed across every account, for the dashboard's Logs tab —
// "who reported what, from where, and when" as a single timeline instead
// of having to open each account's card separately.

const DEFAULT_LIMIT = 200;

/**
 * @param {Array<{name: string}>} accounts
 * @param {Function} getUsageHistoryFn - (accountName) => Array<{fiveHourPctUsed, sevenDayPctUsed, status, deviceId, reportedAt}>
 * @param {number} [limit]
 * @returns {Array<{accountName: string, fiveHourPctUsed: number, sevenDayPctUsed: number, status: string, deviceId?: string, reportedAt: string}>}
 *   newest first, capped at `limit`
 */
function buildRecentLogEntries(accounts, getUsageHistoryFn, limit = DEFAULT_LIMIT) {
  const flattened = accounts.flatMap((account) =>
    getUsageHistoryFn(account.name).map((entry) => ({ ...entry, accountName: account.name }))
  );

  flattened.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());

  return flattened.slice(0, limit);
}

module.exports = { buildRecentLogEntries, DEFAULT_LIMIT };
