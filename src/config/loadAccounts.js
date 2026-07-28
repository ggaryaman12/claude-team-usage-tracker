const { logger } = require("../utilities/logger");
const { loadAccountsList } = require("./accountsStore");

/**
 * Loads the accounts config.
 *
 * Resolution order:
 *   1. `accounts.json` (gitignored, managed via accountsStore.js — either
 *      by /add-account or by editing the file directly) — normal path.
 *   2. `CLAUDE_ACCOUNTS_JSON` env var (JSON string) — fallback for
 *      environments where writing a file isn't convenient (e.g. a future
 *      containerized/Cloud Run deploy), only used if the file is empty.
 *
 * Never throws — returns an empty array if neither source has data, so the
 * process still boots and routes just report "No Claude accounts
 * configured." instead of crashing.
 *
 * @returns {Array<{name, contact, loginEmail}>}
 */
function loadAccounts() {
  const fromFile = loadAccountsList();
  if (fromFile.length > 0) {
    return fromFile;
  }

  if (process.env.CLAUDE_ACCOUNTS_JSON) {
    try {
      return JSON.parse(process.env.CLAUDE_ACCOUNTS_JSON);
    } catch (envErr) {
      logger.error("CLAUDE_ACCOUNTS_JSON is set but not valid JSON:", envErr.message);
      return [];
    }
  }

  return fromFile;
}

module.exports = { loadAccounts };
