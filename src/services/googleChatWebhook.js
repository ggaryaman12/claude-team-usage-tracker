const { logger } = require("../utilities/logger");

/**
 * Posts a message to a Google Chat space via an incoming webhook — the same
 * mechanism the internal repo already uses in production (the standard Google Chat webhook pattern):
 * plain axios POST of {text} to a webhook URL shaped like
 * https://chat.googleapis.com/v1/spaces/<SPACE_ID>/messages?key=...&token=...
 *
 * No OAuth, no service account — the URL itself is the credential. Never
 * throws; logs and returns false on failure so a webhook outage never crashes
 * a caller.
 *
 * @param {string} text - message text (Chat supports plain URLs as clickable links)
 * @param {string} webhookUrl - full incoming-webhook URL
 * @param {{post: Function}} httpClient - axios-compatible client (injected for testing)
 * @returns {Promise<boolean>} true on success
 */
async function postToGoogleChat(text, webhookUrl, httpClient) {
  if (!webhookUrl) {
    logger.error("postToGoogleChat: no webhook URL configured, skipping send.");
    return false;
  }
  try {
    await httpClient.post(
      webhookUrl,
      { text },
      { headers: { "content-type": "application/json" } }
    );
    return true;
  } catch (err) {
    logger.error("postToGoogleChat failed:", err.message);
    return false;
  }
}

/**
 * Posts a pre-built Chat message body (e.g. one with `cardsV2`) as-is —
 * for callers that need more than plain text. Same webhook mechanism and
 * failure handling as postToGoogleChat.
 *
 * @param {object} messageBody - full Chat message body, e.g. {cardsV2: [...]}
 * @param {string} webhookUrl
 * @param {{post: Function}} httpClient
 * @returns {Promise<boolean>} true on success
 */
async function postMessageToGoogleChat(messageBody, webhookUrl, httpClient) {
  if (!webhookUrl) {
    logger.error("postMessageToGoogleChat: no webhook URL configured, skipping send.");
    return false;
  }
  try {
    await httpClient.post(webhookUrl, messageBody, {
      headers: { "content-type": "application/json" },
    });
    return true;
  } catch (err) {
    logger.error("postMessageToGoogleChat failed:", err.message);
    return false;
  }
}

module.exports = { postToGoogleChat, postMessageToGoogleChat };
