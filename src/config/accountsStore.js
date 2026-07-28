const fs = require("fs");
const path = require("path");
const { logger } = require("../utilities/logger");

// Plain gitignored JSON file — consistent with this project's no-DB
// approach. oauthToken is no longer part of the schema: it was only ever
// needed for live usage percentages, a feature dropped after confirming
// `claude setup-token` structurally cannot get the required OAuth scope
// (see usageReportBuilder.js). Only name/contact/loginEmail are used now.
const ACCOUNTS_FILE_PATH = path.join(__dirname, "accounts.json");

/**
 * @returns {Array<{name: string, contact: string, loginEmail: string}>}
 */
function loadAccountsList() {
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logger.error("No accounts.json found yet (or invalid) — returning an empty list.");
    return [];
  }
}

/**
 * Appends a new account, rejecting a duplicate name (case-insensitive).
 * @param {{name: string, contact: string, loginEmail: string}} account
 * @returns {{ok: boolean, errorMessage?: string}}
 */
function addAccount(account) {
  const accounts = loadAccountsList();
  const nameLower = account.name.trim().toLowerCase();

  if (accounts.some((a) => a.name.trim().toLowerCase() === nameLower)) {
    return { ok: false, errorMessage: `An account named "${account.name}" already exists.` };
  }

  accounts.push(account);
  fs.writeFileSync(ACCOUNTS_FILE_PATH, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  return { ok: true };
}

/**
 * Removes an account by name (case-insensitive). Only touches accounts.json
 * — reportedUsage.json / usageHistory.json entries for the removed name are
 * left in place (harmless orphaned data, well under this box's disk caps)
 * rather than risk deleting history someone might want to reference later.
 * @param {string} name
 * @returns {{ok: boolean, errorMessage?: string}}
 */
function removeAccount(name) {
  const accounts = loadAccountsList();
  const nameLower = (name || "").trim().toLowerCase();
  const remaining = accounts.filter((a) => a.name.trim().toLowerCase() !== nameLower);

  if (remaining.length === accounts.length) {
    return { ok: false, errorMessage: `No account named "${name}" is configured.` };
  }

  try {
    fs.writeFileSync(ACCOUNTS_FILE_PATH, JSON.stringify(remaining, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("removeAccount: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

module.exports = { loadAccountsList, addAccount, removeAccount, ACCOUNTS_FILE_PATH };
