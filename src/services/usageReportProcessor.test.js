const { processUsageReport } = require("./usageReportProcessor");

const accounts = [
  { name: "Alice", contact: "@alice", loginEmail: "alice@example.com" },
  { name: "Bob", contact: "@bob", loginEmail: "bob@example.com" },
];

describe("processUsageReport", () => {
  test("stores a valid report under the account matching loginEmail", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "alice@example.com",
      usage: {
        five_hour: { utilization: 42 },
        seven_day: { utilization: 61 },
      },
    };

    const result = processUsageReport(body, accounts, saveReportedUsageFn);

    expect(result).toEqual({ ok: true });
    expect(saveReportedUsageFn).toHaveBeenCalledWith("Alice", {
      fiveHourPctUsed: 42,
      sevenDayPctUsed: 61,
      fiveHourResetsAt: null,
      sevenDayResetsAt: null,
      deviceId: null,
      deviceLabel: null,
    });
  });

  test("passes through deviceId/deviceLabel when the hook sends them", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "alice@example.com",
      deviceId: "abc123",
      deviceLabel: "Alices-MacBook-Air (darwin)",
      usage: {
        five_hour: { utilization: 42 },
        seven_day: { utilization: 61 },
      },
    };

    processUsageReport(body, accounts, saveReportedUsageFn);

    expect(saveReportedUsageFn).toHaveBeenCalledWith("Alice", {
      fiveHourPctUsed: 42,
      sevenDayPctUsed: 61,
      fiveHourResetsAt: null,
      sevenDayResetsAt: null,
      deviceId: "abc123",
      deviceLabel: "Alices-MacBook-Air (darwin)",
    });
  });

  test("passes through resets_at for both windows when Anthropic provides them", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "alice@example.com",
      usage: {
        five_hour: { utilization: 42, resets_at: "2026-07-28T12:00:00.000Z" },
        seven_day: { utilization: 61, resets_at: "2026-08-01T00:00:00.000Z" },
      },
    };

    processUsageReport(body, accounts, saveReportedUsageFn);

    expect(saveReportedUsageFn).toHaveBeenCalledWith("Alice", {
      fiveHourPctUsed: 42,
      sevenDayPctUsed: 61,
      fiveHourResetsAt: "2026-07-28T12:00:00.000Z",
      sevenDayResetsAt: "2026-08-01T00:00:00.000Z",
      deviceId: null,
      deviceLabel: null,
    });
  });

  test("matches loginEmail case-insensitively", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "ALICE@EXAMPLE.COM",
      usage: { five_hour: { utilization: 10 }, seven_day: { utilization: 10 } },
    };

    const result = processUsageReport(body, accounts, saveReportedUsageFn);

    expect(result).toEqual({ ok: true });
    expect(saveReportedUsageFn).toHaveBeenCalledWith("Alice", expect.anything());
  });

  test("attributes correctly to whichever account's email matches, not a hardcoded name", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "bob@example.com",
      usage: { five_hour: { utilization: 43 }, seven_day: { utilization: 5 } },
    };

    processUsageReport(body, accounts, saveReportedUsageFn);

    expect(saveReportedUsageFn).toHaveBeenCalledWith("Bob", {
      fiveHourPctUsed: 43,
      sevenDayPctUsed: 5,
      fiveHourResetsAt: null,
      sevenDayResetsAt: null,
      deviceId: null,
      deviceLabel: null,
    });
  });

  test("appends to history (best-effort) alongside the snapshot save, when a history fn is given", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const appendUsageHistoryFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "alice@example.com",
      deviceId: "abc123",
      usage: { five_hour: { utilization: 91 }, seven_day: { utilization: 12 } },
    };

    const result = processUsageReport(body, accounts, saveReportedUsageFn, appendUsageHistoryFn);

    expect(result).toEqual({ ok: true });
    expect(appendUsageHistoryFn).toHaveBeenCalledWith("Alice", {
      fiveHourPctUsed: 91,
      sevenDayPctUsed: 12,
      status: "low",
      deviceId: "abc123",
    });
  });

  test("skips history entirely when no history fn is passed -- stays optional", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: true });
    const body = {
      loginEmail: "alice@example.com",
      usage: { five_hour: { utilization: 10 }, seven_day: { utilization: 10 } },
    };

    expect(() => processUsageReport(body, accounts, saveReportedUsageFn)).not.toThrow();
  });

  test("rejects a missing loginEmail without calling save", () => {
    const saveReportedUsageFn = jest.fn();
    const result = processUsageReport({ usage: {} }, accounts, saveReportedUsageFn);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("loginEmail");
    expect(saveReportedUsageFn).not.toHaveBeenCalled();
  });

  test("rejects an email that doesn't match any configured account", () => {
    const saveReportedUsageFn = jest.fn();
    const body = {
      loginEmail: "nobody@example.com",
      usage: { five_hour: { utilization: 10 }, seven_day: { utilization: 10 } },
    };
    const result = processUsageReport(body, accounts, saveReportedUsageFn);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("nobody@example.com");
    expect(saveReportedUsageFn).not.toHaveBeenCalled();
  });

  test("rejects a malformed usage payload without calling save", () => {
    const saveReportedUsageFn = jest.fn();
    const result = processUsageReport(
      { loginEmail: "alice@example.com", usage: {} },
      accounts,
      saveReportedUsageFn
    );
    expect(result.ok).toBe(false);
    expect(saveReportedUsageFn).not.toHaveBeenCalled();
  });

  test("propagates a save failure", () => {
    const saveReportedUsageFn = jest.fn().mockReturnValue({ ok: false, errorMessage: "disk full" });
    const body = {
      loginEmail: "alice@example.com",
      usage: { five_hour: { utilization: 10 }, seven_day: { utilization: 10 } },
    };
    const result = processUsageReport(body, accounts, saveReportedUsageFn);
    expect(result).toEqual({ ok: false, errorMessage: "disk full" });
  });
});
