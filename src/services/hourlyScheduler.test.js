const { msUntilNextTopOfHour } = require("./hourlyScheduler");

// All fixtures below are given in UTC but chosen to land on specific IST
// (UTC+5:30) wall-clock times, since that's the timezone this function
// targets regardless of the host machine's own system timezone.

describe("msUntilNextTopOfHour", () => {
  test("returns exactly 1 hour when called precisely at an IST top of the hour", () => {
    // 2026-07-28T09:30:00Z == 2026-07-28 15:00:00 IST
    const nowFn = () => new Date("2026-07-28T09:30:00.000Z").getTime();
    expect(msUntilNextTopOfHour(nowFn)).toBe(60 * 60 * 1000);
  });

  test("returns the remaining minutes when called mid-hour (IST)", () => {
    // 2026-07-28T09:42:00Z == 2026-07-28 15:12:00 IST -> next boundary 16:00 IST
    const nowFn = () => new Date("2026-07-28T09:42:00.000Z").getTime();
    expect(msUntilNextTopOfHour(nowFn)).toBe(48 * 60 * 1000);
  });

  test("returns a small delay when called just before an IST top of the hour", () => {
    // 2026-07-28T10:29:30Z == 2026-07-28 15:59:30 IST -> next boundary 16:00 IST
    const nowFn = () => new Date("2026-07-28T10:29:30.000Z").getTime();
    expect(msUntilNextTopOfHour(nowFn)).toBe(30 * 1000);
  });

  test("rolls over correctly across an IST day boundary (23:xx -> 00:00 IST)", () => {
    // 2026-07-28T18:15:00Z == 2026-07-28 23:45:00 IST -> next boundary 00:00 IST (29th)
    const nowFn = () => new Date("2026-07-28T18:15:00.000Z").getTime();
    expect(msUntilNextTopOfHour(nowFn)).toBe(15 * 60 * 1000);
  });

  test("is independent of the host process's own system timezone (pure UTC-offset math)", () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      // 2026-07-28T09:30:00Z == 15:00:00 IST regardless of process.env.TZ,
      // since the implementation never reads the host's local timezone.
      const nowFn = () => new Date("2026-07-28T09:30:00.000Z").getTime();
      expect(msUntilNextTopOfHour(nowFn)).toBe(60 * 60 * 1000);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  test("always returns a positive delay, never zero or negative", () => {
    for (const iso of ["2026-07-28T00:00:00.000Z", "2026-07-28T12:00:00.001Z", "2026-07-28T09:30:45.500Z"]) {
      const delay = msUntilNextTopOfHour(() => new Date(iso).getTime());
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(60 * 60 * 1000);
    }
  });
});
