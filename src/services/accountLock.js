// Must stay >= gmailRelayWatcher.js's MAX_WAIT_MS (currently 5 min): a
// request holds this lock for the entire time it's waiting on the relay
// mailbox, and if the lock's TTL is shorter than that wait, it silently
// expires mid-request -- letting a second request for the same account
// start while the first is still in flight, and both then race for the
// same sign-in email.
const LOCK_TTL_MS = 6 * 60 * 1000;

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
