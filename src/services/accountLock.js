const LOCK_TTL_MS = 2 * 60 * 1000;

// Module-level Map is the entire "database" for this — in-memory only,
// consistent with the no-DB design. Lost on restart, which is fine: a
// restart mid-request just means the requester gets a timeout and retries.
const pendingRequests = new Map();

/**
 * @param {string} accountName
 * @param {number} nowMs - injectable for testing
 * @returns {boolean} true if a lock is currently held for this account
 */
function isLocked(accountName, nowMs = Date.now()) {
  const startedAt = pendingRequests.get(accountName);
  if (startedAt === undefined) {
    return false;
  }
  if (nowMs - startedAt > LOCK_TTL_MS) {
    pendingRequests.delete(accountName);
    return false;
  }
  return true;
}

/**
 * Attempts to acquire the lock for an account.
 * @returns {boolean} true if the lock was acquired, false if already held
 */
function tryAcquireLock(accountName, nowMs = Date.now()) {
  if (isLocked(accountName, nowMs)) {
    return false;
  }
  pendingRequests.set(accountName, nowMs);
  return true;
}

function releaseLock(accountName) {
  pendingRequests.delete(accountName);
}

module.exports = { tryAcquireLock, releaseLock, isLocked, LOCK_TTL_MS };
