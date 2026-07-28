const fs = require("fs");
const path = require("path");
const { logger } = require("../utilities/logger");

// Plain gitignored JSON file — the fixed roster of real @example.com
// people allowed to request access to a shared Claude account. Separate
// from accounts.json (which lists only the Claude accounts themselves,
// a subset of the wider team) since anyone on the roster should be able
// to request access even if they don't have a Claude account of their
// own configured yet.
//
// This is a validation layer on /request, not real authentication —
// openLink buttons in Google Chat carry no identity info about who
// clicked (confirmed: Chat's interactive-callback dispatch to this
// server doesn't work, which is exactly why openLink is used instead —
// see server.js's /request route comment). Typing an email and checking
// it against this list at least rejects garbage/made-up input; it does
// not cryptographically prove the typed email belongs to the typer.
const KNOWN_REQUESTERS_FILE_PATH = path.join(__dirname, "knownRequesters.json");

/**
 * @returns {Array<{name: string, email: string}>}
 */
function loadKnownRequesters() {
  try {
    const raw = fs.readFileSync(KNOWN_REQUESTERS_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logger.error("No knownRequesters.json found yet (or invalid) — returning an empty list.");
    return [];
  }
}

/**
 * Case-insensitive exact match against the roster.
 * @param {string} email
 * @returns {{name: string, email: string}|null}
 */
function findKnownRequesterByEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return null;
  const roster = loadKnownRequesters();
  return roster.find((r) => r.email.toLowerCase() === normalized) || null;
}

/**
 * Appends a new roster entry, rejecting a duplicate email (case-insensitive).
 * @param {{name: string, email: string}} requester
 * @returns {{ok: boolean, errorMessage?: string}}
 */
function addKnownRequester(requester) {
  const roster = loadKnownRequesters();
  const emailLower = (requester.email || "").trim().toLowerCase();

  if (!requester.name || !emailLower) {
    return { ok: false, errorMessage: "Both name and email are required." };
  }
  if (roster.some((r) => r.email.toLowerCase() === emailLower)) {
    return { ok: false, errorMessage: `"${requester.email}" is already on the roster.` };
  }

  roster.push({ name: requester.name.trim(), email: requester.email.trim() });
  try {
    fs.writeFileSync(KNOWN_REQUESTERS_FILE_PATH, JSON.stringify(roster, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("addKnownRequester: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

/**
 * Removes a roster entry by email (case-insensitive).
 * @param {string} email
 * @returns {{ok: boolean, errorMessage?: string}}
 */
function removeKnownRequester(email) {
  const roster = loadKnownRequesters();
  const emailLower = (email || "").trim().toLowerCase();
  const remaining = roster.filter((r) => r.email.toLowerCase() !== emailLower);

  if (remaining.length === roster.length) {
    return { ok: false, errorMessage: `No roster entry matches "${email}".` };
  }

  try {
    fs.writeFileSync(KNOWN_REQUESTERS_FILE_PATH, JSON.stringify(remaining, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("removeKnownRequester: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

module.exports = {
  loadKnownRequesters,
  findKnownRequesterByEmail,
  addKnownRequester,
  removeKnownRequester,
  KNOWN_REQUESTERS_FILE_PATH,
};
