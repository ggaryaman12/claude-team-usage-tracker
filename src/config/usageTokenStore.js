const fs = require("fs");
const path = require("path");
const { logger } = require("../utilities/logger");

// Plain gitignored JSON file, keyed by account name — consistent with the
// rest of this project's no-DB approach. Each entry is a short-lived
// `claude login` accessToken pasted in by the account owner (NOT a
// `setup-token`, which lacks the scope this needs — see
// claudeUsageFetcher.js). No expiresAt enforcement here: we just try the
// live API call and let a 401/403 speak for itself as "stale."
const TOKENS_FILE_PATH = path.join(__dirname, "usageTokens.json");

/**
 * @returns {Object<string, {accessToken: string, savedAt: string}>}
 */
function loadUsageTokens() {
  try {
    const raw = fs.readFileSync(TOKENS_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * @param {string} accountName
 * @param {string} accessToken
 * @param {string} savedAtIso - injectable for testing
 */
function saveUsageToken(accountName, accessToken, savedAtIso = new Date().toISOString()) {
  const tokens = loadUsageTokens();
  tokens[accountName] = { accessToken, savedAt: savedAtIso };
  try {
    fs.writeFileSync(TOKENS_FILE_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("saveUsageToken: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

/**
 * @param {string} accountName
 * @returns {{accessToken: string, savedAt: string}|null}
 */
function getUsageToken(accountName) {
  const tokens = loadUsageTokens();
  return tokens[accountName] || null;
}

module.exports = { loadUsageTokens, saveUsageToken, getUsageToken, TOKENS_FILE_PATH };
