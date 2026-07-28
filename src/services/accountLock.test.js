const { tryAcquireLock, releaseLock, isLocked, LOCK_TTL_MS } = require("./accountLock");

describe("accountLock", () => {
  afterEach(() => {
    releaseLock("bob");
    releaseLock("alice");
  });

  test("acquires a lock on first attempt", () => {
    expect(tryAcquireLock("bob", 1000)).toBe(true);
    expect(isLocked("bob", 1000)).toBe(true);
  });

  test("rejects a second acquire while the first is still held", () => {
    expect(tryAcquireLock("bob", 1000)).toBe(true);
    expect(tryAcquireLock("bob", 1500)).toBe(false);
  });

  test("does not affect a different account's lock", () => {
    expect(tryAcquireLock("bob", 1000)).toBe(true);
    expect(tryAcquireLock("alice", 1000)).toBe(true);
  });

  test("releasing frees the lock immediately", () => {
    tryAcquireLock("bob", 1000);
    releaseLock("bob");
    expect(isLocked("bob", 1000)).toBe(false);
    expect(tryAcquireLock("bob", 1000)).toBe(true);
  });

  test("lock expires after TTL and can be re-acquired", () => {
    tryAcquireLock("bob", 1000);
    expect(isLocked("bob", 1000 + LOCK_TTL_MS - 1)).toBe(true);
    expect(isLocked("bob", 1000 + LOCK_TTL_MS + 1)).toBe(false);
    expect(tryAcquireLock("bob", 1000 + LOCK_TTL_MS + 1)).toBe(true);
  });
});
