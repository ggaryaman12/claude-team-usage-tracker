const { OAuth2Client } = require("google-auth-library");
const { logger } = require("../utilities/logger");

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 90000;
// Matches the "Sign in" button link in Claude's sign-in email HTML, e.g.
// <a href="https://claude.ai/...">Sign in</a>
const SIGNIN_LINK_REGEX = /<a[^>]+href="([^"]+)"[^>]*>\s*Sign in\s*<\/a>/i;

/**
 * Builds a standard OAuth2 client for the relay mailbox using a previously
 * granted refresh token — the relay-mailbox owner authorized this once via
 * a normal "Sign in with Google, click Allow" consent (see
 * services/gmailRelayAuth.js), same as anyone can grant for their own
 * account. No Workspace admin / domain-wide delegation involved.
 *
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} refreshToken
 * @returns {OAuth2Client}
 */
function buildRelayAuthClient(clientId, clientSecret, refreshToken) {
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractHtmlPart(payload) {
  if (!payload) return null;
  if (payload.mimeType === "text/html" && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = extractHtmlPart(part);
      if (found) return found;
    }
  }
  return null;
}

/**
 * @param {object} messageDetail - Gmail API messages.get(format=full) response body
 * @returns {string|null} the sign-in URL, or null if not found in this message
 */
function extractSigninLink(messageDetail) {
  const html = extractHtmlPart(messageDetail.payload);
  if (!html) return null;
  const match = html.match(SIGNIN_LINK_REGEX);
  return match ? match[1] : null;
}

/**
 * Looks up the newest matching sign-in email received after a given time and
 * extracts its link, if any.
 *
 * @param {string} accessToken
 * @param {number} afterEpochSeconds
 * @param {{get: Function}} httpClient
 * @returns {Promise<string|null>}
 */
async function findLatestSigninEmail(accessToken, afterEpochSeconds, httpClient) {
  const query = `from:mail.anthropic.com subject:"secure link to Claude.ai" after:${afterEpochSeconds}`;
  const listResp = await httpClient.get(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: query, maxResults: 5 },
    }
  );

  const messages = listResp.data.messages || [];
  if (messages.length === 0) {
    return null;
  }

  // Gmail lists newest first.
  const detailResp = await httpClient.get(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messages[0].id}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { format: "full" } }
  );

  return extractSigninLink(detailResp.data);
}

/**
 * Polls the relay mailbox for a sign-in email that arrived after the given
 * time, with a bounded timeout. Never throws.
 *
 * @param {object} args
 * @param {OAuth2Client} args.authClient - from buildRelayAuthClient()
 * @param {number} args.afterEpochSeconds
 * @param {{get: Function}} args.httpClient
 * @param {Function} [args.sleepFn] - injectable for fast tests
 * @returns {Promise<{ok: boolean, link?: string, errorMessage?: string}>}
 */
async function waitForSigninLink({ authClient, afterEpochSeconds, httpClient, sleepFn }) {
  const sleep = sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + MAX_WAIT_MS;

  let accessToken;
  try {
    const tokenResponse = await authClient.getAccessToken();
    accessToken = tokenResponse.token;
  } catch (err) {
    logger.error("waitForSigninLink: failed to get access token:", err.message);
    return { ok: false, errorMessage: "Could not authenticate to the relay mailbox." };
  }

  while (Date.now() < deadline) {
    try {
      const link = await findLatestSigninEmail(accessToken, afterEpochSeconds, httpClient);
      if (link) {
        return { ok: true, link };
      }
    } catch (err) {
      logger.error("waitForSigninLink: poll error:", err.message);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return { ok: false, errorMessage: "Timed out waiting for the sign-in email to arrive." };
}

module.exports = {
  buildRelayAuthClient,
  extractSigninLink,
  findLatestSigninEmail,
  waitForSigninLink,
  decodeBase64Url,
  GMAIL_READONLY_SCOPE,
  POLL_INTERVAL_MS,
  MAX_WAIT_MS,
};
