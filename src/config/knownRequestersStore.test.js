jest.mock("fs");
const fs = require("fs");
const {
  loadKnownRequesters,
  findKnownRequesterByEmail,
  addKnownRequester,
  removeKnownRequester,
} = require("./knownRequestersStore");

const ROSTER = [
  { name: "Alice Example", email: "alice@example.com" },
  { name: "Bob Example", email: "Bob@example.com" },
];

describe("loadKnownRequesters", () => {
  test("returns the parsed roster when the file exists", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));
    expect(loadKnownRequesters()).toEqual(ROSTER);
  });

  test("returns an empty array when the file is missing", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadKnownRequesters()).toEqual([]);
  });
});

describe("findKnownRequesterByEmail", () => {
  beforeEach(() => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));
  });

  test("finds an exact match", () => {
    expect(findKnownRequesterByEmail("alice@example.com")).toEqual(ROSTER[0]);
  });

  test("matches case-insensitively on both sides", () => {
    expect(findKnownRequesterByEmail("ALICE@example.com")).toEqual(ROSTER[0]);
    expect(findKnownRequesterByEmail("bob@example.com")).toEqual(ROSTER[1]);
  });

  test("trims surrounding whitespace", () => {
    expect(findKnownRequesterByEmail("  alice@example.com  ")).toEqual(ROSTER[0]);
  });

  test("returns null for an email not on the roster", () => {
    expect(findKnownRequesterByEmail("nobody@example.com")).toBeNull();
  });

  test("returns null for empty/missing input", () => {
    expect(findKnownRequesterByEmail("")).toBeNull();
    expect(findKnownRequesterByEmail(undefined)).toBeNull();
  });
});

describe("addKnownRequester", () => {
  beforeEach(() => jest.clearAllMocks());

  test("appends a new entry and writes the file", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));
    fs.writeFileSync.mockImplementation(() => {});

    const result = addKnownRequester({ name: "Charlie Example", email: "charlie@example.com" });

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([
      ...ROSTER,
      { name: "Charlie Example", email: "charlie@example.com" },
    ]);
  });

  test("rejects a duplicate email (case-insensitive), does not write", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));

    const result = addKnownRequester({ name: "Alice Again", email: "ALICE@example.com" });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("ALICE@example.com");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("rejects missing name or email without writing", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));
    expect(addKnownRequester({ name: "", email: "x@example.com" }).ok).toBe(false);
    expect(addKnownRequester({ name: "X", email: "" }).ok).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("works when starting from an empty/missing roster", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    fs.writeFileSync.mockImplementation(() => {});

    const result = addKnownRequester({ name: "Alice", email: "alice@example.com" });

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([{ name: "Alice", email: "alice@example.com" }]);
  });
});

describe("removeKnownRequester", () => {
  beforeEach(() => jest.clearAllMocks());

  test("removes the matching entry (case-insensitive) and writes the rest", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));
    fs.writeFileSync.mockImplementation(() => {});

    const result = removeKnownRequester("BOB@example.com");

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([ROSTER[0]]);
  });

  test("rejects an unknown email without writing", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify(ROSTER));

    const result = removeKnownRequester("nobody@example.com");

    expect(result.ok).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
