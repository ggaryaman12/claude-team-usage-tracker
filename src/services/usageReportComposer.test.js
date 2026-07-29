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

  test("infers a window has reset to 0% once its known reset time has passed, even with no fresh report", () => {
    // Exactly the reported scenario: last real report showed 30% used
    // with a reset in 3 hours; nobody used the account since, so no new
    // report ever confirmed the reset -- but the reset time itself has
    // now passed, so the window should read as reset, not stuck at 30%.
    const now = new Date("2026-07-28T23:00:00.000Z").getTime(); // 11 PM
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 30,
      sevenDayPctUsed: 45,
      reportedAt: new Date("2026-07-28T20:00:00.000Z").toISOString(), // reported at 8 PM
      fiveHourResetsAt: "2026-07-28T23:00:00.000Z", // reset was due exactly at 11 PM -- now
      sevenDayResetsAt: "2026-08-02T00:00:00.000Z", // not due yet
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].fiveHourPctUsed).toBe(0);
    expect(results[0].fiveHourWasInferredReset).toBe(true);
    expect(results[0].fiveHourResetLabel).toBeNull(); // no known next-reset time until a fresh report
    // the 7-day window hasn't reset yet -- untouched
    expect(results[0].sevenDayPctUsed).toBe(45);
    expect(results[0].sevenDayWasInferredReset).toBe(false);
    expect(results[0].sevenDayResetLabel).toContain("resets in");
  });

  test("does not infer a reset before the known reset time has actually passed", () => {
    const now = new Date("2026-07-28T22:59:00.000Z").getTime(); // 1 min before reset
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 30,
      sevenDayPctUsed: 45,
      reportedAt: new Date("2026-07-28T20:00:00.000Z").toISOString(),
      fiveHourResetsAt: "2026-07-28T23:00:00.000Z",
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].fiveHourPctUsed).toBe(30);
    expect(results[0].fiveHourWasInferredReset).toBe(false);
    expect(results[0].fiveHourResetLabel).toContain("resets in");
  });

  test("a real fresh report after the reset replaces the inferred 0% with the actual measured value", () => {
    const now = new Date("2026-07-29T00:00:00.000Z").getTime();
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 12, // a real post-reset report came in
      sevenDayPctUsed: 46,
      reportedAt: new Date("2026-07-29T00:00:00.000Z").toISOString(),
      fiveHourResetsAt: "2026-07-29T05:00:00.000Z", // next reset, still in the future
      sevenDayResetsAt: "2026-08-02T00:00:00.000Z",
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].fiveHourPctUsed).toBe(12);
    expect(results[0].fiveHourWasInferredReset).toBe(false);
  });

  test("marks both windows as inferred-reset independently when both have passed their reset time", () => {
    const now = new Date("2026-08-03T00:00:00.000Z").getTime();
    const getReportedUsageFn = jest.fn().mockReturnValue({
      fiveHourPctUsed: 90,
      sevenDayPctUsed: 100,
      reportedAt: new Date("2026-07-28T20:00:00.000Z").toISOString(),
      fiveHourResetsAt: "2026-07-28T23:00:00.000Z",
      sevenDayResetsAt: "2026-08-02T00:00:00.000Z",
    });

    const results = composeUsageResults([accounts[0]], getReportedUsageFn, () => now);

    expect(results[0].fiveHourPctUsed).toBe(0);
    expect(results[0].sevenDayPctUsed).toBe(0);
    expect(results[0].fiveHourWasInferredReset).toBe(true);
    expect(results[0].sevenDayWasInferredReset).toBe(true);
    expect(results[0].status).toBe("available"); // reflects the inferred 0%, not the stale 90%/100%
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
