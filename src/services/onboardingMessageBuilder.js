// Single source of truth for the "how to get set up" copy shown on the
// dashboard's Manage tab (and available to post to Chat again if that's
// ever needed) — so both places describe the same install command and
// give the same before/after promise about a token never leaving your
// machine, without drifting out of sync with each other.

/**
 * @param {string} installHookUrl - e.g. https://your-domain.example.com/claude-usage-bot/install-hook.sh
 * @param {string} [dashboardUrl] - e.g. https://your-domain.example.com/claude-usage-bot/dashboard
 * @param {string} [teamPassword] - the shared dashboard password (never hardcoded here — sourced
 *   from TEAM_PASSWORD env at the call site, same discipline as ADMIN_PASSKEY)
 * @returns {string} plain-text onboarding message
 */
function buildOnboardingMessage(installHookUrl, dashboardUrl, teamPassword) {
  const dashboardLine = dashboardUrl
    ? `\n\nFull dashboard: ${dashboardUrl}${teamPassword ? ` (team password: ${teamPassword})` : ""}`
    : "";

  return `Claude usage tracker is live for everyone here.

What it does:
- Posts live 5hr / 7day usage for all our accounts automatically every hour, with progress bars and exact reset times.
- Own account empty and need to borrow spare capacity from a teammate? Use the Request Access button next to their name -- it posts a transparency notice and relays their sign-in link back to you.

One-time setup -- same command for all of us, ~10 sec:
curl -sL "${installHookUrl}" | bash

Hooks into Claude Code's built-in Stop event. Reads usage locally on your own machine and sends only the percentages, reset times, and your account email -- never your token. Correctly attributes reports to whichever account you're actually logged into at the time, so it's still accurate if you switch into a teammate's account.

Safe to re-run anytime, including if you already installed an older version -- it'll pick up the latest script.${dashboardLine}`;
}

module.exports = { buildOnboardingMessage };
