const { logger } = require("../utilities/logger");
const { GMAIL_READONLY_SCOPE } = require("./gmailRelayWatcher");
const { saveRefreshToken } = require("../config/relayTokenStore");

/**
 * Builds the Google consent URL for the one-time relay-mailbox authorization.
 * Whoever owns the relay mailbox (a purpose-built low-stakes Gmail account,
 * not anyone's real inbox) visits this once and clicks Allow — standard
 * personal OAuth consent, same as granting any third-party app read access
 * to their own mail. No Workspace admin involved.
 *
 * @param {import('google-auth-library').OAuth2Client} oAuth2Client
 * @param {string} state
 * @returns {string}
 */
function buildRelayAuthUrl(oAuth2Client, state) {
  return oAuth2Client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    scope: [GMAIL_READONLY_SCOPE],
    state,
    prompt: "consent",
  });
}

/**
 * Exchanges the OAuth redirect code for tokens and persists the refresh
 * token so the relay watcher can use it on every future request without
 * requiring this consent flow again.
 *
 * @param {import('google-auth-library').OAuth2Client} oAuth2Client
 * @param {string} code
 * @returns {Promise<{ok: boolean, errorMessage?: string}>}
 */
async function completeRelayAuth(oAuth2Client, code) {
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return {
        ok: false,
        errorMessage:
          "Google didn't return a refresh token — this can happen on re-consent. Revoke this app's access at myaccount.google.com/permissions and try the setup link again.",
      };
    }
    saveRefreshToken(tokens.refresh_token);
    return { ok: true };
  } catch (err) {
    logger.error("completeRelayAuth failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

module.exports = { buildRelayAuthUrl, completeRelayAuth };
