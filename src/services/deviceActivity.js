// Turns a per-account devices map (see reportedUsageStore.js) into an
// "is more than one device actively using this account in the last hour"
// summary. This is the concrete signal for "how many people are currently
// logged into and using a shared personal account" — each machine's hook
// reports its own deviceId/deviceLabel independently, so if two machines
// both report for the same account within the window, that account is
// genuinely in use from two places at once.

// Explicit 1-hour window, matching the hourly auto-push cadence
// (server.js) — the label shown to the team says "last 1 hour" exactly
// because this is the window backing that claim; keep them in sync if
// either changes.
const DEVICE_FRESHNESS_WINDOW_MS = 60 * 60 * 1000;
const DEVICE_FRESHNESS_WINDOW_LABEL = "last 1 hour";

/**
 * @param {Object<string, {deviceLabel?: string, reportedAt: string}>} devicesMap
 * @param {Function} [nowFn] - injectable for testing
 * @returns {{activeCount: number, devices: Array<{deviceId: string, label: string, lastSeenMinutesAgo: number, isActive: boolean}>}}
 */
function summarizeDeviceActivity(devicesMap, nowFn = Date.now) {
  const devices = Object.entries(devicesMap || {})
    .map(([deviceId, device]) => {
      const ageMs = nowFn() - new Date(device.reportedAt).getTime();
      return {
        deviceId,
        label: device.deviceLabel || deviceId,
        lastSeenMinutesAgo: Math.max(0, Math.round(ageMs / 60000)),
        isActive: ageMs <= DEVICE_FRESHNESS_WINDOW_MS,
      };
    })
    .sort((a, b) => a.lastSeenMinutesAgo - b.lastSeenMinutesAgo);

  const activeCount = devices.filter((d) => d.isActive).length;
  return { activeCount, devices };
}

module.exports = { summarizeDeviceActivity, DEVICE_FRESHNESS_WINDOW_MS, DEVICE_FRESHNESS_WINDOW_LABEL };
