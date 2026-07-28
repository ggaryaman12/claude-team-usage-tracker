jest.mock("fs");
const fs = require("fs");
const { loadUsageTokens, saveUsageToken, getUsageToken } = require("./usageTokenStore");

describe("loadUsageTokens", () => {
  test("returns the parsed object when the file exists", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: { accessToken: "tok", savedAt: "2026-01-01T00:00:00Z" } }));
    expect(loadUsageTokens()).toEqual({ Alice: { accessToken: "tok", savedAt: "2026-01-01T00:00:00Z" } });
  });

  test("returns an empty object when the file is missing", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadUsageTokens()).toEqual({});
  });
});

describe("saveUsageToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("adds a new entry, preserving existing ones", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: { accessToken: "old", savedAt: "x" } }));
    fs.writeFileSync.mockImplementation(() => {});

    const result = saveUsageToken("Bob", "tok-bob", "2026-02-01T00:00:00Z");

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual({
      Alice: { accessToken: "old", savedAt: "x" },
      Bob: { accessToken: "tok-bob", savedAt: "2026-02-01T00:00:00Z" },
    });
  });

  test("overwrites an existing entry for the same account", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: { accessToken: "old", savedAt: "x" } }));
    fs.writeFileSync.mockImplementation(() => {});

    saveUsageToken("Alice", "new-tok", "2026-03-01T00:00:00Z");

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual({
      Alice: { accessToken: "new-tok", savedAt: "2026-03-01T00:00:00Z" },
    });
  });
});

describe("getUsageToken", () => {
  test("returns the entry for a known account", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: { accessToken: "tok", savedAt: "x" } }));
    expect(getUsageToken("Alice")).toEqual({ accessToken: "tok", savedAt: "x" });
  });

  test("returns null for an unknown account", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: { accessToken: "tok", savedAt: "x" } }));
    expect(getUsageToken("Nobody")).toBeNull();
  });
});
