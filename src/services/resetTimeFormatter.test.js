const { formatResetTime } = require("./resetTimeFormatter");

const FIXED_NOW = new Date("2026-07-28T08:00:00.000Z").getTime();
const nowFn = () => FIXED_NOW;

describe("formatResetTime", () => {
  test("returns null when resets_at is missing", () => {
    expect(formatResetTime(null, nowFn)).toBeNull();
    expect(formatResetTime(undefined, nowFn)).toBeNull();
    expect(formatResetTime("", nowFn)).toBeNull();
  });

  test("returns null when resets_at doesn't parse as a date", () => {
    expect(formatResetTime("not-a-date", nowFn)).toBeNull();
  });

  test("shows hours and minutes when the reset is over an hour away", () => {
    // FIXED_NOW + 1h12m
    const resetsAt = "2026-07-28T09:12:00.000Z";
    const label = formatResetTime(resetsAt, nowFn);
    expect(label).toContain("resets in 1h 12m");
  });

  test("shows only minutes when under an hour away", () => {
    // FIXED_NOW + 34m
    const resetsAt = "2026-07-28T08:34:00.000Z";
    const label = formatResetTime(resetsAt, nowFn);
    expect(label).toContain("resets in 34m");
    expect(label).not.toContain("0h");
  });

  test("shows days and hours once the reset is more than a day away", () => {
    // FIXED_NOW + 160h24m == 6d 16h24m
    const resetsAt = "2026-08-04T00:24:00.000Z";
    const label = formatResetTime(resetsAt, nowFn);
    expect(label).toContain("resets in 6d 16h");
    expect(label).not.toContain("160h");
  });

  test("adds the weekday to the clock time when more than a day away", () => {
    const resetsAt = "2026-08-04T00:24:00.000Z"; // Tue 05:54 IST
    const label = formatResetTime(resetsAt, nowFn);
    expect(label).toMatch(/Tue/);
  });

  test("includes the IST clock time alongside the countdown", () => {
    // 08:34 UTC == 14:04 IST
    const resetsAt = "2026-07-28T08:34:00.000Z";
    const label = formatResetTime(resetsAt, nowFn);
    expect(label).toMatch(/2:04\s*PM/i);
  });

  test("shows 'resets soon' once the window has already passed", () => {
    const resetsAt = "2026-07-28T07:00:00.000Z"; // 1h before now
    const label = formatResetTime(resetsAt, nowFn);
    expect(label).toContain("resets soon");
  });
});
