const crypto = require("crypto");

// In-memory admin session store — no DB, consistent with the rest of this
// project. A restart requires re-entering the passkey, which is an
// acceptable tradeoff for a low-stakes internal gate rather than pulling
// in a session/store dependency for a single admin user.

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * @param {{ttlMs?: number}} [opts]
 * @returns {{createSession: Function, isValid: Function, destroySession: Function}}
 */
function createSessionStore({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const sessions = new Map(); // token -> expiresAtMs

  /**
   * @param {Function} [nowFn]
   * @returns {string} a new session token
   */
  function createSession(nowFn = Date.now) {
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, nowFn() + ttlMs);
    return token;
  }

  /**
   * @param {string} token
   * @param {Function} [nowFn]
   * @returns {boolean}
   */
  function isValid(token, nowFn = Date.now) {
    if (!token || !sessions.has(token)) {
      return false;
    }
    const expiresAt = sessions.get(token);
    if (nowFn() > expiresAt) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  /**
   * @param {string} token
   */
  function destroySession(token) {
    sessions.delete(token);
  }

  return { createSession, isValid, destroySession };
}

/**
 * Constant-time-ish comparison for the passkey check — avoids a naive
 * `===` timing side-channel on a secret comparison, even though the
 * practical risk here is low for an internal tool.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { createSessionStore, safeCompare, DEFAULT_TTL_MS };
