const { buildPersonUsageRows } = require("./personUsageBuilder");

describe("buildPersonUsageRows", () => {
  test("builds one row per account with current/avg/peak and device count", () => {
    const accounts = [{ name: "Alice", contact: "@alice" }];
    const getReportedUsageFn = () => ({
      fiveHourPctUsed: 40,
      sevenDayPctUsed: 10,
      devices: { dev1: {}, dev2: {} },
    });
    const getUsageHistoryFn = () => [
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available" },
      { fiveHourPctUsed: 40, sevenDayPctUsed: 1, status: "available" },
    ];

    const rows = buildPersonUsageRows(accounts, getReportedUsageFn, getUsageHistoryFn);

    expect(rows[0]).toMatchObject({
      name: "Alice",
      contact: "@alice",
      deviceCount: 2,
      totalCheckIns: 2,
      currentFiveHourPctUsed: 40,
      currentSevenDayPctUsed: 10,
      avgFiveHourPctUsed: 25,
      maxFiveHourPctUsed: 40,
      exhaustedCount: 0,
    });
  });

  test("counts exhausted check-ins", () => {
    const accounts = [{ name: "Alice", contact: "@alice" }];
    const getReportedUsageFn = () => ({ fiveHourPctUsed: 100, sevenDayPctUsed: 50, devices: {} });
    const getUsageHistoryFn = () => [
      { fiveHourPctUsed: 100, sevenDayPctUsed: 50, status: "exhausted" },
      { fiveHourPctUsed: 10, sevenDayPctUsed: 50, status: "available" },
    ];

    const rows = buildPersonUsageRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].exhaustedCount).toBe(1);
  });

  test("handles an account with no history yet (no reports at all)", () => {
    const accounts = [{ name: "Charlie", contact: "@charlie" }];
    const rows = buildPersonUsageRows(accounts, () => null, () => []);
    expect(rows[0]).toMatchObject({
      name: "Charlie",
      deviceCount: 0,
      totalCheckIns: 0,
      currentFiveHourPctUsed: null,
      currentSevenDayPctUsed: null,
      avgFiveHourPctUsed: null,
      maxFiveHourPctUsed: null,
    });
  });

  test("sorts by current 5hr usage, busiest first", () => {
    const accounts = [{ name: "Alice", contact: "@a" }, { name: "Bob", contact: "@b" }, { name: "Charlie", contact: "@c" }];
    const getReportedUsageFn = (name) => {
      if (name === "Alice") return { fiveHourPctUsed: 20, sevenDayPctUsed: 1, devices: {} };
      if (name === "Bob") return { fiveHourPctUsed: 90, sevenDayPctUsed: 1, devices: {} };
      return null; // Charlie has never reported
    };
    const getUsageHistoryFn = (name) =>
      name === "Charlie" ? [] : [{ fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available" }];

    const rows = buildPersonUsageRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Alice", "Charlie"]);
  });
});
