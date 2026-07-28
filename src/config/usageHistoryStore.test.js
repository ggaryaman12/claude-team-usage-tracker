jest.mock("fs");
const fs = require("fs");
const {
  loadUsageHistory,
  appendUsageHistory,
  getUsageHistory,
  pruneAllAccountsHistory,
  MAX_ENTRIES_PER_ACCOUNT,
  MAX_AGE_MS,
} = require("./usageHistoryStore");

const FIXED_NOW = new Date("2026-07-28T12:00:00.000Z").getTime();
const nowFn = () => FIXED_NOW;

describe("loadUsageHistory", () => {
  test("returns the parsed object when the file exists", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: [{ fiveHourPctUsed: 10, reportedAt: "x" }] }));
    expect(loadUsageHistory()).toEqual({ Alice: [{ fiveHourPctUsed: 10, reportedAt: "x" }] });
  });

  test("returns an empty object when the file is missing", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadUsageHistory()).toEqual({});
  });
});

describe("appendUsageHistory", () => {
  beforeEach(() => jest.clearAllMocks());

  test("appends a new entry, preserving other accounts and prior entries", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: [{ fiveHourPctUsed: 10, sevenDayPctUsed: 5, status: "available", reportedAt: "t0" }] })
    );
    fs.writeFileSync.mockImplementation(() => {});

    const result = appendUsageHistory("Bob", { fiveHourPctUsed: 40, sevenDayPctUsed: 20, status: "available" }, "t1");

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(written.Alice).toEqual([{ fiveHourPctUsed: 10, sevenDayPctUsed: 5, status: "available", reportedAt: "t0" }]);
    expect(written.Bob).toEqual([{ fiveHourPctUsed: 40, sevenDayPctUsed: 20, status: "available", reportedAt: "t1" }]);
  });

  test("caps history at MAX_ENTRIES_PER_ACCOUNT, dropping the oldest entries first", () => {
    const existing = Array.from({ length: MAX_ENTRIES_PER_ACCOUNT }, (_, i) => ({
      fiveHourPctUsed: i,
      sevenDayPctUsed: 0,
      status: "available",
      reportedAt: `t${i}`,
    }));
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: existing }));
    fs.writeFileSync.mockImplementation(() => {});

    appendUsageHistory("Alice", { fiveHourPctUsed: 999, sevenDayPctUsed: 0, status: "available" }, "newest");

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(written.Alice).toHaveLength(MAX_ENTRIES_PER_ACCOUNT);
    expect(written.Alice[0].reportedAt).toBe("t1"); // oldest (t0) dropped
    expect(written.Alice[written.Alice.length - 1]).toEqual({
      fiveHourPctUsed: 999,
      sevenDayPctUsed: 0,
      status: "available",
      reportedAt: "newest",
    });
  });

  test("drops entries older than MAX_AGE_MS (2 days) on write", () => {
    const tooOld = new Date(FIXED_NOW - MAX_AGE_MS - 60000).toISOString(); // just past 2 days
    const stillFresh = new Date(FIXED_NOW - 60000).toISOString(); // 1 min ago
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        Alice: [
          { fiveHourPctUsed: 1, sevenDayPctUsed: 1, status: "available", reportedAt: tooOld },
          { fiveHourPctUsed: 2, sevenDayPctUsed: 2, status: "available", reportedAt: stillFresh },
        ],
      })
    );
    fs.writeFileSync.mockImplementation(() => {});

    appendUsageHistory("Alice", { fiveHourPctUsed: 3, sevenDayPctUsed: 3, status: "available" }, new Date(FIXED_NOW).toISOString(), nowFn);

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(written.Alice.map((e) => e.fiveHourPctUsed)).toEqual([2, 3]);
  });

  test("keeps entries whose reportedAt can't be parsed as a date, rather than dropping them", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: [{ fiveHourPctUsed: 1, sevenDayPctUsed: 1, status: "available", reportedAt: "not-a-date" }] })
    );
    fs.writeFileSync.mockImplementation(() => {});

    appendUsageHistory("Alice", { fiveHourPctUsed: 2, sevenDayPctUsed: 2, status: "available" }, "also-not-a-date", nowFn);

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(written.Alice).toHaveLength(2);
  });
});

describe("getUsageHistory", () => {
  test("returns the history array for a known account", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: [{ fiveHourPctUsed: 10, reportedAt: "x" }] }));
    expect(getUsageHistory("Alice")).toEqual([{ fiveHourPctUsed: 10, reportedAt: "x" }]);
  });

  test("returns an empty array for an unknown account", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ Alice: [] }));
    expect(getUsageHistory("Nobody")).toEqual([]);
  });

  test("filters out entries older than MAX_AGE_MS at read time too, without needing a write", () => {
    const tooOld = new Date(FIXED_NOW - MAX_AGE_MS - 60000).toISOString();
    const stillFresh = new Date(FIXED_NOW - 60000).toISOString();
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        Alice: [
          { fiveHourPctUsed: 1, sevenDayPctUsed: 1, status: "available", reportedAt: tooOld },
          { fiveHourPctUsed: 2, sevenDayPctUsed: 2, status: "available", reportedAt: stillFresh },
        ],
      })
    );

    const result = getUsageHistory("Alice", nowFn);
    expect(result).toHaveLength(1);
    expect(result[0].fiveHourPctUsed).toBe(2);
  });
});

describe("pruneAllAccountsHistory", () => {
  beforeEach(() => jest.clearAllMocks());

  test("prunes every account's entries and drops accounts left with none", () => {
    const tooOld = new Date(FIXED_NOW - MAX_AGE_MS - 60000).toISOString();
    const stillFresh = new Date(FIXED_NOW - 60000).toISOString();
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        Alice: [{ fiveHourPctUsed: 1, sevenDayPctUsed: 1, status: "available", reportedAt: stillFresh }],
        Bob: [{ fiveHourPctUsed: 2, sevenDayPctUsed: 2, status: "available", reportedAt: tooOld }],
      })
    );
    fs.writeFileSync.mockImplementation(() => {});

    const result = pruneAllAccountsHistory(nowFn);

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(Object.keys(written)).toEqual(["Alice"]);
  });

  test("propagates a write failure", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({}));
    fs.writeFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(pruneAllAccountsHistory(nowFn)).toEqual({ ok: false, errorMessage: "disk full" });
  });
});
