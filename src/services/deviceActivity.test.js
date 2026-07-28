const { summarizeDeviceActivity, DEVICE_FRESHNESS_WINDOW_MS } = require("./deviceActivity");

const FIXED_NOW = new Date("2026-07-28T08:00:00.000Z").getTime();
const nowFn = () => FIXED_NOW;

describe("summarizeDeviceActivity", () => {
  test("returns zero devices for an empty/missing map", () => {
    expect(summarizeDeviceActivity(undefined, nowFn)).toEqual({ activeCount: 0, devices: [] });
    expect(summarizeDeviceActivity({}, nowFn)).toEqual({ activeCount: 0, devices: [] });
  });

  test("counts a single recent device as active", () => {
    const devices = {
      abc123: { deviceLabel: "Alices-MacBook-Air (darwin)", reportedAt: new Date(FIXED_NOW - 5 * 60000).toISOString() },
    };
    const result = summarizeDeviceActivity(devices, nowFn);
    expect(result.activeCount).toBe(1);
    expect(result.devices[0]).toMatchObject({
      deviceId: "abc123",
      label: "Alices-MacBook-Air (darwin)",
      lastSeenMinutesAgo: 5,
      isActive: true,
    });
  });

  test("flags two devices reporting within the freshness window as both active -- the shared-account signal", () => {
    const devices = {
      laptopA: { deviceLabel: "laptop-a", reportedAt: new Date(FIXED_NOW - 2 * 60000).toISOString() },
      laptopB: { deviceLabel: "laptop-b", reportedAt: new Date(FIXED_NOW - 10 * 60000).toISOString() },
    };
    const result = summarizeDeviceActivity(devices, nowFn);
    expect(result.activeCount).toBe(2);
  });

  test("excludes a stale device (older than the freshness window) from the active count", () => {
    const staleAgeMs = DEVICE_FRESHNESS_WINDOW_MS + 60000;
    const devices = {
      fresh: { deviceLabel: "fresh", reportedAt: new Date(FIXED_NOW - 60000).toISOString() },
      stale: { deviceLabel: "stale", reportedAt: new Date(FIXED_NOW - staleAgeMs).toISOString() },
    };
    const result = summarizeDeviceActivity(devices, nowFn);
    expect(result.activeCount).toBe(1);
    expect(result.devices.find((d) => d.deviceId === "stale").isActive).toBe(false);
  });

  test("sorts devices by most-recently-seen first", () => {
    const devices = {
      old: { deviceLabel: "old", reportedAt: new Date(FIXED_NOW - 30 * 60000).toISOString() },
      recent: { deviceLabel: "recent", reportedAt: new Date(FIXED_NOW - 1 * 60000).toISOString() },
    };
    const result = summarizeDeviceActivity(devices, nowFn);
    expect(result.devices.map((d) => d.deviceId)).toEqual(["recent", "old"]);
  });

  test("falls back to the deviceId as the label when deviceLabel is missing", () => {
    const devices = { xyz: { reportedAt: new Date(FIXED_NOW).toISOString() } };
    const result = summarizeDeviceActivity(devices, nowFn);
    expect(result.devices[0].label).toBe("xyz");
  });
});
