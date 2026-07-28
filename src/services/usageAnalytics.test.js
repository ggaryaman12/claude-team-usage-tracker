const { summarizeAccountAnalytics, summarizeTeamAnalytics, SPARKLINE_MAX_POINTS } = require("./usageAnalytics");

const FIXED_NOW = new Date("2026-07-28T08:00:00.000Z").getTime();
const nowFn = () => FIXED_NOW;

describe("summarizeAccountAnalytics", () => {
  test("reports hasHistory:false for an empty/missing history", () => {
    expect(summarizeAccountAnalytics(undefined, nowFn)).toEqual({ hasHistory: false });
    expect(summarizeAccountAnalytics([], nowFn)).toEqual({ hasHistory: false });
  });

  test("computes average and peak 5hr usage", () => {
    const history = [
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: new Date(FIXED_NOW).toISOString() },
      { fiveHourPctUsed: 90, sevenDayPctUsed: 1, status: "low", reportedAt: new Date(FIXED_NOW).toISOString() },
    ];
    const result = summarizeAccountAnalytics(history, nowFn);
    expect(result.avgFiveHourPctUsed).toBe(50);
    expect(result.maxFiveHourPctUsed).toBe(90);
    expect(result.reportCount).toBe(2);
  });

  test("counts how many times the account has actually hit exhausted", () => {
    const history = [
      { fiveHourPctUsed: 100, sevenDayPctUsed: 1, status: "exhausted", reportedAt: new Date(FIXED_NOW).toISOString() },
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: new Date(FIXED_NOW).toISOString() },
      { fiveHourPctUsed: 100, sevenDayPctUsed: 1, status: "exhausted", reportedAt: new Date(FIXED_NOW).toISOString() },
    ];
    expect(summarizeAccountAnalytics(history, nowFn).exhaustedCount).toBe(2);
  });

  test("counts distinct devices ever seen, treating missing deviceId as one shared bucket", () => {
    const history = [
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", deviceId: "a", reportedAt: new Date(FIXED_NOW).toISOString() },
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", deviceId: "b", reportedAt: new Date(FIXED_NOW).toISOString() },
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: new Date(FIXED_NOW).toISOString() },
    ];
    expect(summarizeAccountAnalytics(history, nowFn).distinctDevicesEverSeen).toBe(3);
  });

  test("counts reports within the last 24h separately from total report count", () => {
    const history = [
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: new Date(FIXED_NOW - 48 * 3600 * 1000).toISOString() },
      { fiveHourPctUsed: 10, sevenDayPctUsed: 1, status: "available", reportedAt: new Date(FIXED_NOW - 1 * 3600 * 1000).toISOString() },
    ];
    const result = summarizeAccountAnalytics(history, nowFn);
    expect(result.reportCount).toBe(2);
    expect(result.reportsLast24h).toBe(1);
  });

  test("caps sparkline points at SPARKLINE_MAX_POINTS, keeping the most recent", () => {
    const history = Array.from({ length: SPARKLINE_MAX_POINTS + 10 }, (_, i) => ({
      fiveHourPctUsed: i,
      sevenDayPctUsed: 0,
      status: "available",
      reportedAt: new Date(FIXED_NOW).toISOString(),
    }));
    const result = summarizeAccountAnalytics(history, nowFn);
    expect(result.sparklinePoints).toHaveLength(SPARKLINE_MAX_POINTS);
    expect(result.sparklinePoints[result.sparklinePoints.length - 1]).toBe(history[history.length - 1].fiveHourPctUsed);
  });
});

describe("summarizeTeamAnalytics", () => {
  test("reports hasData:false when nobody has history yet", () => {
    expect(summarizeTeamAnalytics([{ name: "Alice", analytics: { hasHistory: false } }])).toEqual({ hasData: false });
  });

  test("averages avgFiveHourPctUsed across accounts that do have history", () => {
    const perAccountAnalytics = [
      { name: "Alice", analytics: { hasHistory: true, avgFiveHourPctUsed: 40, exhaustedCount: 0, reportCount: 5 } },
      { name: "Bob", analytics: { hasHistory: true, avgFiveHourPctUsed: 60, exhaustedCount: 2, reportCount: 10 } },
      { name: "Charlie", analytics: { hasHistory: false } },
    ];
    const result = summarizeTeamAnalytics(perAccountAnalytics);
    expect(result.hasData).toBe(true);
    expect(result.avgFiveHourPctUsedAcrossTeam).toBe(50);
    expect(result.totalExhaustedEvents).toBe(2);
  });

  test("identifies the account with the most reports as busiest", () => {
    const perAccountAnalytics = [
      { name: "Alice", analytics: { hasHistory: true, avgFiveHourPctUsed: 10, exhaustedCount: 0, reportCount: 5 } },
      { name: "Bob", analytics: { hasHistory: true, avgFiveHourPctUsed: 10, exhaustedCount: 0, reportCount: 50 } },
    ];
    expect(summarizeTeamAnalytics(perAccountAnalytics).busiestAccountName).toBe("Bob");
  });
});
