const { createSessionStore, safeCompare } = require("./adminSessionStore");

describe("createSessionStore", () => {
  test("a freshly created session is valid", () => {
    const store = createSessionStore();
    const token = store.createSession();
    expect(store.isValid(token)).toBe(true);
  });

  test("an unknown token is invalid", () => {
    const store = createSessionStore();
    expect(store.isValid("not-a-real-token")).toBe(false);
  });

  test("a missing/empty token is invalid", () => {
    const store = createSessionStore();
    expect(store.isValid(undefined)).toBe(false);
    expect(store.isValid("")).toBe(false);
  });

  test("a session expires after its TTL", () => {
    const store = createSessionStore({ ttlMs: 1000 });
    let now = 1_000_000;
    const token = store.createSession(() => now);

    expect(store.isValid(token, () => now)).toBe(true);
    now += 1001;
    expect(store.isValid(token, () => now)).toBe(false);
  });

  test("destroySession invalidates a token immediately", () => {
    const store = createSessionStore();
    const token = store.createSession();
    store.destroySession(token);
    expect(store.isValid(token)).toBe(false);
  });

  test("each session gets a distinct token", () => {
    const store = createSessionStore();
    const a = store.createSession();
    const b = store.createSession();
    expect(a).not.toBe(b);
  });
});

describe("safeCompare", () => {
  test("returns true for identical strings", () => {
    expect(safeCompare("secret123", "secret123")).toBe(true);
  });

  test("returns false for different strings of the same length", () => {
    expect(safeCompare("secret123", "secret456")).toBe(false);
  });

  test("returns false for different-length strings without throwing", () => {
    expect(safeCompare("short", "a-much-longer-string")).toBe(false);
  });
});
