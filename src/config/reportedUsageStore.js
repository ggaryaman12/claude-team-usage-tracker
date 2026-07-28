const fs = require("fs");
const path = require("path");
const { logger } = require("../utilities/logger");

// Plain gitignored JSON file, keyed by account name — the last usage report
// each person's local Claude Code hook posted. We never touch anyone's
// OAuth token: the hook runs entirely on their machine (reads their local
// Keychain, calls Anthropic directly) and only sends us the resulting
// percentages. See services/usageReportProcessor.js for the POST handler
// and docs/HOOK_INSTALL.md-equivalent (installHookPageBuilder.js) for the
// local script we give people to install.
//
// Each account entry also carries a `devices` map, keyed by a per-machine
// deviceId the hook derives locally (hash of hostname+OS user — never a
// real identity, just "is this the same machine as last time"). This is
// what lets us answer "is more than one device using this shared account
// right now" (see services/deviceActivity.js) without needing separate
// storage: the top-level fields stay the latest report from whichever
// device reported most recently (unchanged shape, so existing consumers
// don't need to know about devices at all), while `devices` accumulates
// one entry per distinct machine seen.
const REPORTS_FILE_PATH = path.join(__dirname, "reportedUsage.json");

/**
 * @returns {Object<string, {fiveHourPctUsed: number, sevenDayPctUsed: number, reportedAt: string, devices?: Object}>}
 */
function loadReportedUsage() {
  try {
    const raw = fs.readFileSync(REPORTS_FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * @param {string} accountName
 * @param {{fiveHourPctUsed: number, sevenDayPctUsed: number, deviceId?: string, deviceLabel?: string}} usage
 * @param {string} reportedAtIso - injectable for testing
 */
function saveReportedUsage(accountName, usage, reportedAtIso = new Date().toISOString()) {
  const reports = loadReportedUsage();
  const existing = reports[accountName] || {};
  const deviceId = usage.deviceId || "unknown-device";

  const devices = { ...(existing.devices || {}) };
  devices[deviceId] = {
    deviceLabel: usage.deviceLabel || deviceId,
    fiveHourPctUsed: usage.fiveHourPctUsed,
    sevenDayPctUsed: usage.sevenDayPctUsed,
    reportedAt: reportedAtIso,
  };

  reports[accountName] = { ...usage, reportedAt: reportedAtIso, devices };
  try {
    fs.writeFileSync(REPORTS_FILE_PATH, JSON.stringify(reports, null, 2), { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    logger.error("saveReportedUsage: write failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

/**
 * @param {string} accountName
 * @returns {{fiveHourPctUsed: number, sevenDayPctUsed: number, reportedAt: string, devices: Object}|null}
 */
function getReportedUsage(accountName) {
  const reports = loadReportedUsage();
  return reports[accountName] || null;
}

module.exports = { loadReportedUsage, saveReportedUsage, getReportedUsage, REPORTS_FILE_PATH };
