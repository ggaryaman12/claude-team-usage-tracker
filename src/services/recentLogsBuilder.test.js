const { buildRecentLogEntries, DEFAULT_LIMIT } = require("./recentLogsBuilder");

describe("buildRecentLogEntries", () => {
  test("flattens history across accounts, tagging each entry with its account name", () => {
    const accounts = [{ name: "Alice" }, { name: "Bob" }];
    const getUsageHistoryFn = (name) =>
      name === "Alice"
        ? [{ fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" }]
        : [{ fiveHourPctUsed: 20, sevenDayPctUsed: 2, status: "available", reportedAt: "2026-07-28T09:00:00.000Z" }];

    const result = buildRecentLogEntries(accounts, getUsageHistoryFn);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.accountName).sort()).toEqual(["Alice", "Bob"]);
  });

  test("sorts newest first across accounts", () => {
    const accounts = [{ name: "Alice" }, { name: "Bob" }];
    const getUsageHistoryFn = (name) =>
      name === "Alice"
        ? [{ fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T06:00:00.000Z" }]
        : [{ fiveHourPctUsed: 20, sevenDayPctUsed: 2, status: "available", reportedAt: "2026-07-28T10:00:00.000Z" }];

    const result = buildRecentLogEntries(accounts, getUsageHistoryFn);

    expect(result[0].accountName).toBe("Bob");
    expect(result[1].accountName).toBe("Alice");
  });

  test("caps output at the given limit", () => {
    const accounts = [{ name: "Alice" }];
    const entries = Array.from({ length: 10 }, (_, i) => ({
      fiveHourPctUsed: i,
      sevenDayPctUsed: 0,
      status: "available",
      reportedAt: new Date(2026, 6, 28, 8, i).toISOString(),
    }));
    const getUsageHistoryFn = () => entries;

    const result = buildRecentLogEntries(accounts, getUsageHistoryFn, 3);
    expect(result).toHaveLength(3);
  });

  test("defaults to DEFAULT_LIMIT when no limit is given", () => {
    const accounts = [{ name: "Alice" }];
    const entries = Array.from({ length: DEFAULT_LIMIT + 20 }, (_, i) => ({
      fiveHourPctUsed: i,
      sevenDayPctUsed: 0,
      status: "available",
      reportedAt: new Date(2026, 6, 28, 8, 0, i).toISOString(),
    }));
    const getUsageHistoryFn = () => entries;

    const result = buildRecentLogEntries(accounts, getUsageHistoryFn);
    expect(result).toHaveLength(DEFAULT_LIMIT);
  });

  test("returns an empty array when there are no accounts or no history", () => {
    expect(buildRecentLogEntries([], () => [])).toEqual([]);
    expect(buildRecentLogEntries([{ name: "Alice" }], () => [])).toEqual([]);
  });
});
