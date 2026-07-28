const { composeUsageResults, FRESHNESS_WINDOW_MS } = require("./usageReportComposer");

const accounts = [
  { name: "Alice", contact: "@alice" },
  { name: "Bob", contact: "@bob" },
];

describe("composeUsageResults", () => {
  test("marks an account with no report as hasReport:false", () => {
    const getReportedUsageFn = jest.fn().mockReturnValue(null);
    const results = composeUsageResults(accounts, getReportedUsageFn, () => 2_000_000);
    expect(results[0]).toEqual({ name: "Alice", contact: "@alice", hasReport: false });
  });

  test("marks a recent report (within the freshness window) as fresh", () => {
    const now = 10_000_000;
    const reportedAt = new Date(now - 5 * 60 * 1000).toISOString(); // 5 min ago
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 42,
      sevenDayPctUsed: 61,
      reportedAt,
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0]).toMatchObject({
      name: "Alice",
      hasReport: true,
      isFresh: true,
      ageMinutes: 5,
      fiveHourPctUsed: 42,
      sevenDayPctUsed: 61,
      status: "available",
    });
  });

  test("marks a report older than the freshness window as stale", () => {
    const now = 10_000_000;
    const reportedAt = new Date(now - FRESHNESS_WINDOW_MS - 60_000).toISOString(); // 1 min past the window
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 10,
      sevenDayPctUsed: 10,
      reportedAt,
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].isFresh).toBe(false);
    expect(results[0].ageMinutes).toBe(Math.round((FRESHNESS_WINDOW_MS + 60_000) / 60000));
  });

  test("computes status from the reported percentages", () => {
    const now = 10_000_000;
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 100,
      sevenDayPctUsed: 50,
      reportedAt: new Date(now).toISOString(),
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].status).toBe("exhausted");
  });

  test("formats resets_at for both windows into human labels", () => {
    const now = new Date("2026-07-28T08:00:00.000Z").getTime();
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 40,
      sevenDayPctUsed: 10,
      reportedAt: new Date(now).toISOString(),
      fiveHourResetsAt: "2026-07-28T09:12:00.000Z", // +1h12m
      sevenDayResetsAt: "2026-08-01T00:00:00.000Z",
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].fiveHourResetLabel).toContain("resets in 1h 12m");
    expect(results[0].sevenDayResetLabel).toContain("resets in");
  });

  test("leaves reset labels null when resets_at wasn't reported", () => {
    const now = 10_000_000;
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 40,
      sevenDayPctUsed: 10,
      reportedAt: new Date(now).toISOString(),
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].fiveHourResetLabel).toBeNull();
    expect(results[0].sevenDayResetLabel).toBeNull();
  });

  test("summarizes device activity from the report's devices map", () => {
    const now = new Date("2026-07-28T08:00:00.000Z").getTime();
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 40,
      sevenDayPctUsed: 10,
      reportedAt: new Date(now).toISOString(),
      devices: {
        laptopA: { deviceLabel: "laptop-a", reportedAt: new Date(now - 60000).toISOString() },
        laptopB: { deviceLabel: "laptop-b", reportedAt: new Date(now - 120000).toISOString() },
      },
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].activeCount).toBe(2);
    expect(results[0].devices).toHaveLength(2);
  });

  test("looks up each account independently, preserving order", () => {
    const now = 10_000_000;
    const getReportedUsageFn = jest.fn((name) =>
      name === "Alice"
        ? { fiveHourPctUsed: 1, sevenDayPctUsed: 1, reportedAt: new Date(now).toISOString() }
        : null
    );

    const results = composeUsageResults(accounts, getReportedUsageFn, () => now);

    expect(results[0].hasReport).toBe(true);
    expect(results[1]).toEqual({ name: "Bob", contact: "@bob", hasReport: false });
  });
});
