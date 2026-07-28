const fs = require("fs");
const path = require("path");
const { logger } = require("../utilities/logger");

// Plain gitignored JSON file — consistent with the rest of this project's
// "no DB, hardcoded local config" approach. Holds only a refresh token for
// the relay mailbox (a purpose-built low-stakes mailbox, not anyone's real
// inbox), obtained via a normal one-time personal OAuth consent — no
// Workspace admin / domain-wide delegation involved anywhere in this path.
const TOKEN_FILE_PATH = path.join(__dirname, "relayToken.json");

function saveRefreshToken(refreshToken) {
  fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify({ refreshToken }, null, 2), {
    mode: 0o600,
  });
}

/**
 * @returns {string|null} the stored refresh token, or null if none saved yet
 */
function loadRefreshToken() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE_PATH, "utf-8");
    return JSON.parse(raw).refreshToken || null;
  } catch (err) {
    logger.error("No relay refresh token found yet (relayToken.json missing or invalid).");
    return null;
  }
}

module.exports = { saveRefreshToken, loadRefreshToken, TOKEN_FILE_PATH };
