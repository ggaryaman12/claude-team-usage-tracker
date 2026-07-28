// Originally built to show live 5hr/7day usage percentages per account, via
// claudeUsageFetcher.js hitting Anthropic's /api/oauth/usage endpoint. That
// endpoint requires OAuth scope `user:profile`, which `claude setup-token`
// (the only practical long-lived credential — see claudeUsageFetcher.js's
// header comment) structurally cannot obtain; confirmed against multiple
// anthropics/claude-code GitHub issues, not fixable in this codebase. So
// this now lists configured accounts with a request-access link for each,
// with no live availability signal — "ask and see" instead of "check first".

/**
 * Builds the Chat message text listing every configured account with a
 * plain (auto-linked by Chat) request-access URL.
 *
 * @param {Array<{name: string, contact: string}>} accounts
 * @param {string} requestBaseUrl - e.g. https://your-domain.example.com/claude-usage-bot/request
 * @returns {string}
 */
function buildUsageReportText(accounts, requestBaseUrl) {
  if (!accounts || accounts.length === 0) {
    return "No Claude accounts configured.";
  }

  const lines = accounts.map((account) => {
    const url = `${requestBaseUrl}?account=${encodeURIComponent(account.name)}`;
    return `• ${account.name} (${account.contact}) — Request access: ${url}`;
  });

  return ["Claude accounts:", ...lines].join("\n");
}

module.exports = { buildUsageReportText };
