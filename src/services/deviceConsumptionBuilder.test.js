const { buildDeviceConsumptionRows, RECENT_CHECKINS_LIMIT, LIVE_WINDOW_MS } = require("./deviceConsumptionBuilder");

describe("buildDeviceConsumptionRows", () => {
  test("returns an empty array when there's no history anywhere", () => {
    const accounts = [{ name: "Alice" }];
    expect(buildDeviceConsumptionRows(accounts, () => null, () => [])).toEqual([]);
  });

  test("groups a single device's reports for one account into one row", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: { dev1: { deviceLabel: "Alices-Laptop (darwin)" } } });
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 5, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 30, sevenDayPctUsed: 6, status: "available", reportedAt: "2026-07-28T09:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deviceId: "dev1",
      label: "Alices-Laptop (darwin)",
      accountNames: ["Alice"],
      reportCount: 2,
      minFiveHourPctUsed: 10,
      avgFiveHourPctUsed: 20,
      maxFiveHourPctUsed: 30,
      minSevenDayPctUsed: 5,
      avgSevenDayPctUsed: 6,
      maxSevenDayPctUsed: 6,
      lastFiveHourPctUsed: 30,
      lastSevenDayPctUsed: 6,
      lastReportedAt: "2026-07-28T09:00:00.000Z",
      firstReportedAt: "2026-07-28T08:00:00.000Z",
    });
  });

  test("merges the same device across multiple accounts into one row listing both", () => {
    const accounts = [{ name: "Alice" }, { name: "Bob" }];
    const getReportedUsageFn = () => ({
      devices: { shared1: { deviceLabel: "Shared-Laptop (darwin)" } },
    });
    const getUsageHistoryFn = (name) =>
      name === "Alice"
        ? [{ deviceId: "shared1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" }]
        : [{ deviceId: "shared1", fiveHourPctUsed: 50, sevenDayPctUsed: 2, status: "available", reportedAt: "2026-07-28T10:00:00.000Z" }];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountNames).toEqual(["Alice", "Bob"]);
    expect(rows[0].reportCount).toBe(2);
    expect(rows[0].lastFiveHourPctUsed).toBe(50); // the more recent Bob report
  });

  test("falls back to the deviceId as the label when it's missing from the reportedUsage devices map", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "mystery-device", fiveHourPctUsed: 5, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].label).toBe("mystery-device");
  });

  test("buckets entries with no deviceId under 'unknown-device'", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => null;
    const getUsageHistoryFn = () => [
      { fiveHourPctUsed: 5, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].deviceId).toBe("unknown-device");
  });

  test("sorts rows by most-recently-seen device first", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "old-device", fiveHourPctUsed: 5, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T06:00:00.000Z" },
      { deviceId: "new-device", fiveHourPctUsed: 5, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T10:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows.map((r) => r.deviceId)).toEqual(["new-device", "old-device"]);
  });

  test("counts how often a device's reports actually hit low/exhausted vs available", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T06:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 85, sevenDayPctUsed: 1, status: "low", reportedAt: "2026-07-28T07:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 100, sevenDayPctUsed: 1, status: "exhausted", reportedAt: "2026-07-28T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 100, sevenDayPctUsed: 1, status: "exhausted", reportedAt: "2026-07-28T09:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0]).toMatchObject({ availableCount: 1, lowCount: 1, exhaustedCount: 2 });
  });

  test("computes reportsPerDay only once there's a meaningful spread of reports", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    // 4 reports spread over exactly 2 days -> 2/day
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-26T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-27T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-27T20:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].reportsPerDay).toBe(2);
  });

  test("leaves reportsPerDay null for too few reports or too tight a burst", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:30.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].reportsPerDay).toBeNull();
  });

  test("leaves peakHourLabel null when there are fewer than 3 reports", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T09:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].peakHourLabel).toBeNull();
  });

  test("identifies the most common IST hour-of-day across reports", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    // 08:30 UTC == 14:00 IST (2 PM) on all three -- same IST hour bucket
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-26T08:30:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-27T08:45:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:15:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].peakHourLabel).toBe("around 2 PM IST");
  });

  test("returns sparklinePoints in chronological order (oldest first)", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T06:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 50, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 30, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T07:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].sparklinePoints).toEqual([10, 30, 50]);
  });

  test("returns sevenDaySparklinePoints in the same chronological order as the 5hr series", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T06:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 50, sevenDayPctUsed: 3, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 30, sevenDayPctUsed: 2, status: "available", reportedAt: "2026-07-28T07:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].sevenDaySparklinePoints).toEqual([1, 2, 3]);
  });

  test("builds a 24-slot IST hourly distribution", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    // 08:30 UTC == 14:00 IST (hour index 14), twice; 03:30 UTC == 09:00 IST (hour index 9), once
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-26T08:30:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-27T08:45:00.000Z" },
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T03:30:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].hourlyDistribution).toHaveLength(24);
    expect(rows[0].hourlyDistribution[14]).toBe(2);
    expect(rows[0].hourlyDistribution[9]).toBe(1);
    expect(rows[0].hourlyDistribution.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test("caps recentCheckIns at RECENT_CHECKINS_LIMIT, newest first", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const entries = Array.from({ length: RECENT_CHECKINS_LIMIT + 5 }, (_, i) => ({
      deviceId: "dev1",
      fiveHourPctUsed: i,
      sevenDayPctUsed: 0,
      status: "available",
      reportedAt: new Date(2026, 6, 28, 8, i).toISOString(),
    }));
    const getUsageHistoryFn = () => entries;

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn);
    expect(rows[0].recentCheckIns).toHaveLength(RECENT_CHECKINS_LIMIT);
    expect(rows[0].recentCheckIns[0].fiveHourPctUsed).toBe(entries[entries.length - 1].fiveHourPctUsed);
  });

  test("flags isLive when the last report is within LIVE_WINDOW_MS, with lastSeenMinutesAgo", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const now = new Date("2026-07-28T08:10:00.000Z").getTime();
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:05:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn, () => now);
    expect(rows[0].isLive).toBe(true);
    expect(rows[0].lastSeenMinutesAgo).toBe(5);
  });

  test("isLive is false once the last report is older than LIVE_WINDOW_MS", () => {
    const accounts = [{ name: "Alice" }];
    const getReportedUsageFn = () => ({ devices: {} });
    const now = new Date("2026-07-28T08:00:00.000Z").getTime() + LIVE_WINDOW_MS + 60000;
    const getUsageHistoryFn = () => [
      { deviceId: "dev1", fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: "2026-07-28T08:00:00.000Z" },
    ];

    const rows = buildDeviceConsumptionRows(accounts, getReportedUsageFn, getUsageHistoryFn, () => now);
    expect(rows[0].isLive).toBe(false);
  });
});
