jest.mock("fs");
const fs = require("fs");
const { loadReportedUsage, saveReportedUsage, getReportedUsage } = require("./reportedUsageStore");

describe("loadReportedUsage", () => {
  test("returns the parsed object when the file exists", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "2026-01-01T00:00:00Z" } })
    );
    expect(loadReportedUsage()).toEqual({
      Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "2026-01-01T00:00:00Z" },
    });
  });

  test("returns an empty object when the file is missing", () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadReportedUsage()).toEqual({});
  });
});

describe("saveReportedUsage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("adds a new entry, preserving existing ones", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "x", devices: {} } })
    );
    fs.writeFileSync.mockImplementation(() => {});

    const result = saveReportedUsage(
      "Bob",
      { fiveHourPctUsed: 50, sevenDayPctUsed: 60 },
      "2026-02-01T00:00:00Z"
    );

    expect(result).toEqual({ ok: true });
    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(writtenJson)).toEqual({
      Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "x", devices: {} },
      Bob: {
        fiveHourPctUsed: 50,
        sevenDayPctUsed: 60,
        reportedAt: "2026-02-01T00:00:00Z",
        devices: {
          "unknown-device": {
            deviceLabel: "unknown-device",
            fiveHourPctUsed: 50,
            sevenDayPctUsed: 60,
            reportedAt: "2026-02-01T00:00:00Z",
          },
        },
      },
    });
  });

  test("overwrites the top-level (latest) fields for the same account", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "old", devices: {} } })
    );
    fs.writeFileSync.mockImplementation(() => {});

    saveReportedUsage("Alice", { fiveHourPctUsed: 99, sevenDayPctUsed: 88 }, "new");

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(written.Alice.fiveHourPctUsed).toBe(99);
    expect(written.Alice.sevenDayPctUsed).toBe(88);
    expect(written.Alice.reportedAt).toBe("new");
  });

  test("accumulates a distinct devices map entry per deviceId, keeping other devices intact", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        Alice: {
          fiveHourPctUsed: 10,
          sevenDayPctUsed: 20,
          reportedAt: "old",
          devices: {
            laptopA: { deviceLabel: "laptop-a", fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "old" },
          },
        },
      })
    );
    fs.writeFileSync.mockImplementation(() => {});

    saveReportedUsage(
      "Alice",
      { fiveHourPctUsed: 40, sevenDayPctUsed: 15, deviceId: "laptopB", deviceLabel: "laptop-b" },
      "new"
    );

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(Object.keys(written.Alice.devices).sort()).toEqual(["laptopA", "laptopB"]);
    expect(written.Alice.devices.laptopA).toEqual({
      deviceLabel: "laptop-a",
      fiveHourPctUsed: 10,
      sevenDayPctUsed: 20,
      reportedAt: "old",
    });
    expect(written.Alice.devices.laptopB).toEqual({
      deviceLabel: "laptop-b",
      fiveHourPctUsed: 40,
      sevenDayPctUsed: 15,
      reportedAt: "new",
    });
  });

  test("re-reporting from the same deviceId overwrites only that device's entry", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        Alice: {
          fiveHourPctUsed: 10,
          sevenDayPctUsed: 20,
          reportedAt: "old",
          devices: {
            laptopA: { deviceLabel: "laptop-a", fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "old" },
          },
        },
      })
    );
    fs.writeFileSync.mockImplementation(() => {});

    saveReportedUsage(
      "Alice",
      { fiveHourPctUsed: 77, sevenDayPctUsed: 33, deviceId: "laptopA", deviceLabel: "laptop-a" },
      "newer"
    );

    const [, writtenJson] = fs.writeFileSync.mock.calls[0];
    const written = JSON.parse(writtenJson);
    expect(Object.keys(written.Alice.devices)).toEqual(["laptopA"]);
    expect(written.Alice.devices.laptopA.fiveHourPctUsed).toBe(77);
  });
});

describe("getReportedUsage", () => {
  test("returns the entry for a known account", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "x", devices: {} } })
    );
    expect(getReportedUsage("Alice")).toEqual({
      fiveHourPctUsed: 10,
      sevenDayPctUsed: 20,
      reportedAt: "x",
      devices: {},
    });
  });

  test("returns null for an unknown account", () => {
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ Alice: { fiveHourPctUsed: 10, sevenDayPctUsed: 20, reportedAt: "x" } })
    );
    expect(getReportedUsage("Nobody")).toBeNull();
  });
});
