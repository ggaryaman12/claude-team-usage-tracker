jest.mock("fs");
const fs = require("fs");
const { loadAccountsList, addAccount, removeAccount } = require("./accountsStore");

describe("loadAccountsList", () => {
  test("returns the parsed list when the file exists", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]));

    const result = loadAccountsList();

    expect(result).toEqual([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]);
  });

  test("returns an empty array when the file is missing", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(loadAccountsList()).toEqual([]);
  });
});

describe("addAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("appends a new account and writes the file", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]));
    fs.writeFileSync.mockImplementation(() => {});

    const result = addAccount({ name: "Bob", contact: "@bob", loginEmail: "b@x.com" });

    expect(result).toEqual({ ok: true });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([
      { name: "Alice", contact: "@alice", loginEmail: "a@x.com" },
      { name: "Bob", contact: "@bob", loginEmail: "b@x.com" },
    ]);
  });

  test("rejects a duplicate name (case-insensitive), does not write", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]));

    const result = addAccount({ name: "alice", contact: "@alice2", loginEmail: "a2@x.com" });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("alice");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("works when starting from an empty/missing file", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    fs.writeFileSync.mockImplementation(() => {});

    const result = addAccount({ name: "Alice", contact: "@alice", loginEmail: "a@x.com" });

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]);
  });
});

describe("removeAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("removes the matching account and writes the remaining list", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify([
        { name: "Alice", contact: "@alice", loginEmail: "a@x.com" },
        { name: "Bob", contact: "@bob", loginEmail: "b@x.com" },
      ])
    );
    fs.writeFileSync.mockImplementation(() => {});

    const result = removeAccount("Bob");

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]);
  });

  test("matches case-insensitively", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]));
    fs.writeFileSync.mockImplementation(() => {});

    const result = removeAccount("ALICE");

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual([]);
  });

  test("rejects an unknown name without writing", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([{ name: "Alice", contact: "@alice", loginEmail: "a@x.com" }]));

    const result = removeAccount("Nobody");

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("Nobody");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
