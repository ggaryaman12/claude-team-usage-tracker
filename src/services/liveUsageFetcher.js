const { fetchAccountUsage } = require("./claudeUsageFetcher");

/**
 * Fetches live usage for every account that has a saved usage token,
 * skipping (with an explicit hasUsageToken:false marker) accounts that
 * don't. Reuses claudeUsageFetcher's fetchAccountUsage (already sends the
 * required anthropic-beta: oauth-2025-04-20 header) — the only difference
 * from the dropped `setup-token` approach is where the token comes from: a
 * short-lived `claude login` accessToken pasted in via /add-usage-token,
 * which does carry the `user:profile` scope this endpoint needs.
 *
 * @param {Array<{name: string, contact: string}>} accounts
 * @param {Object<string, {accessToken: string, savedAt: string}>} tokensByName
 * @param {{get: Function}} httpClient
 * @returns {Promise<Array>} one result per account, same order as input.
 *   Each result is either {name, contact, hasUsageToken: false} or the
 *   AccountUsageResult shape from claudeUsageFetcher.js, with
 *   hasUsageToken: true added.
 */
async function fetchUsageForAccounts(accounts, tokensByName, httpClient) {
  return Promise.all(
    accounts.map(async (account) => {
      const tokenEntry = tokensByName[account.name];
      if (!tokenEntry) {
        return { name: account.name, contact: account.contact, hasUsageToken: false };
      }

      const usage = await fetchAccountUsage(
        { name: account.name, contact: account.contact, oauthToken: tokenEntry.accessToken },
        httpClient
      );
      return { ...usage, hasUsageToken: true };
    })
  );
}

module.exports = { fetchUsageForAccounts };
