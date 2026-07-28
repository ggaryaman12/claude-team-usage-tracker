const { logger } = require("../utilities/logger");

const SETTINGS_SCOPE = "https://www.googleapis.com/auth/gmail.settings.basic";
// Gmail splits its settings scopes: gmail.settings.basic covers filters and
// general settings, but forwarding addresses (and POP/IMAP, delegates) are
// treated as more sensitive and need this separate scope. Confirmed after a
// live 403 on forwardingAddresses.create with only .basic requested.
const SETTINGS_SHARING_SCOPE = "https://www.googleapis.com/auth/gmail.settings.sharing";
const FILTER_CRITERIA_FROM = "mail.anthropic.com";

function logErrorWithBody(prefix, err) {
  if (err.response) {
    logger.error(`${prefix}: HTTP ${err.response.status} —`, JSON.stringify(err.response.data));
  } else {
    logger.error(`${prefix}:`, err.message);
  }
}

/**
 * Builds the Google consent URL for the one-click filter-setup flow.
 * @param {import('google-auth-library').OAuth2Client} oAuth2Client
 * @param {string} state - opaque value round-tripped through the redirect (e.g. a nonce)
 * @returns {string}
 */
function buildAuthUrl(oAuth2Client, state) {
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [SETTINGS_SCOPE, SETTINGS_SHARING_SCOPE],
    state,
    prompt: "consent",
  });
}

/**
 * After the user approves the consent screen and Google redirects back with
 * a `code`, this exchanges it for a token and sets up forwarding + the
 * filter on *their* mailbox (the mailbox they just authenticated as).
 *
 * Gmail requires the forwarding target to be a verified forwarding address
 * on the user's own account before a forward-action filter can be created —
 * that verification is a one-time confirmation-email click on the relay
 * mailbox (claude-relay@...), unavoidable regardless of automation, done
 * once per new person. This function requests it if not already done, and
 * only creates the filter once it's already verified — callers should tell
 * the user to re-run the setup link after the relay-mailbox admin approves
 * the confirmation email.
 *
 * @param {import('google-auth-library').OAuth2Client} oAuth2Client - must already have clientId/clientSecret/redirectUri set
 * @param {string} code - the authorization code from the OAuth redirect
 * @param {string} relayEmail - the forwarding target, e.g. claude-relay@example.com
 * @param {{get: Function, post: Function}} httpClient
 * @returns {Promise<{ok: boolean, stage?: string, message?: string, errorMessage?: string}>}
 */
async function setupForwardingFilter(oAuth2Client, code, relayEmail, httpClient) {
  let accessToken;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    accessToken = tokens.access_token;
  } catch (err) {
    logger.error("setupForwardingFilter: token exchange failed:", err.message);
    return { ok: false, stage: "auth", errorMessage: err.message };
  }

  const headers = { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

  let verificationStatus;
  try {
    const createResp = await httpClient.post(
      "https://gmail.googleapis.com/gmail/v1/users/me/settings/forwardingAddresses",
      { forwardingEmail: relayEmail },
      { headers }
    );
    verificationStatus = createResp.data.verificationStatus;
  } catch (createErr) {
    // Log the create failure itself — previously only the fallback lookup's
    // error was logged, which hid the actual reason create failed (a real
    // gap: found live when a create failure turned out not to be "already
    // exists" at all, and the fallback lookup's own 404 was all we could see).
    logErrorWithBody("setupForwardingFilter: forwardingAddresses.create failed", createErr);
    // Already requested previously — look up its current status instead of failing.
    try {
      const getResp = await httpClient.get(
        `https://gmail.googleapis.com/gmail/v1/users/me/settings/forwardingAddresses/${encodeURIComponent(relayEmail)}`,
        { headers }
      );
      verificationStatus = getResp.data.verificationStatus;
    } catch (lookupErr) {
      logErrorWithBody("setupForwardingFilter: forwarding address step failed", lookupErr);
      return { ok: false, stage: "forwarding-address", errorMessage: lookupErr.message };
    }
  }

  if (verificationStatus !== "accepted") {
    return {
      ok: false,
      stage: "pending-verification",
      message: `Forwarding requested. An admin needs to approve the one-time confirmation email Gmail just sent to ${relayEmail}, then you should run this setup link again to finish creating the filter.`,
    };
  }

  try {
    await httpClient.post(
      "https://gmail.googleapis.com/gmail/v1/users/me/settings/filters",
      {
        criteria: { from: FILTER_CRITERIA_FROM },
        action: { forward: relayEmail },
      },
      { headers }
    );
  } catch (filterErr) {
    logErrorWithBody("setupForwardingFilter: filter creation failed", filterErr);
    return { ok: false, stage: "filter", errorMessage: filterErr.message };
  }

  return { ok: true };
}

module.exports = { buildAuthUrl, setupForwardingFilter, SETTINGS_SCOPE, FILTER_CRITERIA_FROM };
