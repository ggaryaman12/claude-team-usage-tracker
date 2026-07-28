// Renders the full analytics dashboard at /claude-usage-bot/dashboard — a
// plain server-rendered HTML page, self-contained so it costs nothing
// extra to run under the service's memory/CPU caps. Three tabs:
//   - Overview: same data as the Chat card (composeUsageResults), plus
//     the full per-device breakdown and trend analytics the card only
//     summarizes, plus a Request Access button per account (mirrors the
//     Chat card's button).
//   - Manage: add/remove accounts, the universal install command, and the
//     onboarding message, each with a copy button.
//   - Logs: a flat chronological feed of every report across all
//     accounts (see recentLogsBuilder.js), for "what actually happened
//     and when" instead of just the current snapshot.
// Tabs need a small amount of vanilla JS (show/hide + remembering the
// selected tab via the URL hash, so the 60s meta-refresh doesn't bounce
// you back to Overview) — still no build step, no external libraries.

const { buildProgressBar } = require("./progressBar");
const { buildSparklineSvg } = require("./sparklineSvg");
const { DEVICE_FRESHNESS_WINDOW_LABEL } = require("./deviceActivity");
const { buildPetWidgetHtml } = require("./petWidget");

const STATUS_META = {
  available: { emoji: "🟢", label: "Available", color: "#1e8e3e" },
  low: { emoji: "🟡", label: "Running low", color: "#e37400" },
  exhausted: { emoji: "🔴", label: "Exhausted", color: "#d93025" },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSummary(results) {
  const totalAccounts = results.length;
  const reporting = results.filter((r) => r.hasReport).length;
  const freshCount = results.filter((r) => r.hasReport && r.isFresh).length;
  const multiDeviceAccounts = results.filter((r) => (r.activeCount || 0) > 1).length;
  const totalActiveDevices = results.reduce((sum, r) => sum + (r.activeCount || 0), 0);
  return { totalAccounts, reporting, freshCount, multiDeviceAccounts, totalActiveDevices };
}

function buildBarRow(label, pctUsed, resetLabel) {
  const bar = buildProgressBar(pctUsed);
  const resetHtml = resetLabel
    ? `<span class="reset">${escapeHtml(resetLabel)}</span>`
    : `<span class="reset reset--unknown">reset time unknown</span>`;
  return `<div class="bar-row">
    <span class="bar-label">${label}</span>
    <span class="bar-track" aria-hidden="true">${escapeHtml(bar)}</span>
    <span class="bar-pct">${pctUsed}%</span>
    ${resetHtml}
  </div>`;
}

function buildDeviceTable(result) {
  if (!result.devices || result.devices.length === 0) {
    return "";
  }
  const rows = result.devices
    .map((d) => {
      const activeClass = d.isActive ? "device-row--active" : "device-row--idle";
      const activeBadge = d.isActive ? `<span class="badge badge--active">active</span>` : `<span class="badge badge--idle">idle</span>`;
      return `<tr class="${activeClass}">
        <td>${escapeHtml(d.label)}</td>
        <td>${d.lastSeenMinutesAgo}m ago</td>
        <td>${activeBadge}</td>
      </tr>`;
    })
    .join("");

  return `<details class="devices">
    <summary>${result.devices.length} device${result.devices.length === 1 ? "" : "s"} seen${result.activeCount > 1 ? ` — <strong class="warn">${result.activeCount} active in the ${DEVICE_FRESHNESS_WINDOW_LABEL}</strong>` : ""}</summary>
    <table class="device-table">
      <thead><tr><th>Device</th><th>Last seen</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </details>`;
}

function buildAnalyticsBlock(analytics) {
  if (!analytics || !analytics.hasHistory) {
    return `<div class="analytics analytics--empty">Not enough history yet for a trend — needs a couple more reports.</div>`;
  }

  const sparkline = buildSparklineSvg(analytics.sparklinePoints, { color: "#1a73e8" });
  const exhaustedNote =
    analytics.exhaustedCount > 0
      ? `<span class="stat stat--warn">🔴 exhausted ${analytics.exhaustedCount}×</span>`
      : `<span class="stat">no exhaustion yet</span>`;
  const deviceNote =
    analytics.distinctDevicesEverSeen > 1
      ? `<span class="stat stat--warn">${analytics.distinctDevicesEverSeen} devices ever</span>`
      : `<span class="stat">${analytics.distinctDevicesEverSeen} device ever</span>`;

  return `<div class="analytics">
    ${sparkline ? `<div class="sparkline">${sparkline}</div>` : ""}
    <div class="analytics-stats">
      <span class="stat">avg ${analytics.avgFiveHourPctUsed}%</span>
      <span class="stat">peak ${analytics.maxFiveHourPctUsed}%</span>
      <span class="stat">${analytics.reportsLast24h} reports today</span>
      ${exhaustedNote}
      ${deviceNote}
    </div>
  </div>`;
}

function buildAccountCard(result, analytics, requestBaseUrl) {
  const multiDeviceClass = (result.activeCount || 0) > 1 ? " account-card--alert" : "";
  const requestUrl = `${requestBaseUrl}?account=${encodeURIComponent(result.name)}`;
  const requestButton = `<a class="request-btn" href="${requestUrl}">Request Access</a>`;

  if (!result.hasReport) {
    return `<div class="account-card${multiDeviceClass}">
      <div class="account-card__header">
        <span class="account-name">${escapeHtml(result.name)}</span>
        <span class="status-pill status-pill--unknown">❓ No reports yet</span>
      </div>
      <div class="account-contact">${escapeHtml(result.contact)}</div>
      <div class="no-report">No usage reports yet — hook not installed, or hasn't fired.</div>
      <div class="card-actions">${requestButton}</div>
    </div>`;
  }

  const meta = STATUS_META[result.status] || { emoji: "❓", label: "Unknown", color: "#5f6368" };
  const freshness = result.isFresh
    ? `as of ${result.ageMinutes}m ago`
    : `stale — last seen ${result.ageMinutes}m ago`;

  return `<div class="account-card${multiDeviceClass}">
    <div class="account-card__header">
      <span class="account-name">${escapeHtml(result.name)}</span>
      <span class="status-pill" style="--pill-color:${meta.color}">${meta.emoji} ${meta.label}</span>
    </div>
    <div class="account-contact">${escapeHtml(result.contact)}</div>
    ${buildBarRow("5hr", result.fiveHourPctUsed, result.fiveHourResetLabel)}
    ${buildBarRow("7day", result.sevenDayPctUsed, result.sevenDayResetLabel)}
    <div class="freshness${result.isFresh ? "" : " freshness--stale"}">${freshness}</div>
    ${(result.activeCount || 0) > 1 ? `<div class="alert-banner">⚠️ ${result.activeCount} devices active on this account in the ${DEVICE_FRESHNESS_WINDOW_LABEL}</div>` : ""}
    ${buildAnalyticsBlock(analytics)}
    ${buildDeviceTable(result)}
    <div class="card-actions">${requestButton}</div>
  </div>`;
}

function buildTeamOverview(teamAnalytics) {
  if (!teamAnalytics || !teamAnalytics.hasData) {
    return "";
  }
  return `<div class="team-overview">
    <div class="team-overview__title">Team overview</div>
    <div class="team-overview__stats">
      <span class="stat">team avg 5hr usage: <strong>${teamAnalytics.avgFiveHourPctUsedAcrossTeam}%</strong></span>
      <span class="stat${teamAnalytics.totalExhaustedEvents > 0 ? " stat--warn" : ""}">exhaustion events logged: <strong>${teamAnalytics.totalExhaustedEvents}</strong></span>
      ${teamAnalytics.busiestAccountName ? `<span class="stat">busiest account: <strong>${escapeHtml(teamAnalytics.busiestAccountName)}</strong></span>` : ""}
    </div>
  </div>`;
}

function buildCopyBox(id, content, label) {
  return `<div class="copy-box">
    <div class="copy-box__label">${escapeHtml(label)}</div>
    <div class="copy-box__row">
      <pre id="${id}" class="copy-box__content">${escapeHtml(content)}</pre>
      <button type="button" class="copy-btn" data-copy-target="${id}">Copy</button>
    </div>
  </div>`;
}

function buildManageTab(accounts, urls) {
  const rows = accounts
    .map(
      (a) => `<tr>
        <td>${escapeHtml(a.name)}</td>
        <td>${escapeHtml(a.contact)}</td>
        <td>${escapeHtml(a.loginEmail)}</td>
        <td><a class="remove-link" href="${urls.basePath}/remove-account?name=${encodeURIComponent(a.name)}">Remove</a></td>
      </tr>`
    )
    .join("");

  return `<div class="manage-section">
    <a class="add-account-btn" href="${urls.basePath}/add-account">+ Add account</a>
    <a class="add-account-btn add-account-btn--secondary" href="${urls.basePath}/admin/devices">🔒 Device consumption (admin)</a>
    <a class="add-account-btn add-account-btn--secondary" href="${urls.basePath}/admin/roster">🔒 Manage requester roster (admin)</a>
  </div>

  ${buildCopyBox("install-cmd", `curl -sL "${urls.installHookUrl}" | bash`, "Universal install command (same for everyone)")}
  ${buildCopyBox("onboarding-msg", urls.onboardingMessage, "Onboarding message (paste into Chat)")}

  <div class="manage-section">
    <table class="manage-table">
      <thead><tr><th>Name</th><th>Contact</th><th>Login email</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="no-report">No accounts configured yet.</td></tr>`}</tbody>
    </table>
  </div>`;
}

function buildLogsTab(recentLogs) {
  if (!recentLogs || recentLogs.length === 0) {
    return `<div class="no-report">No usage reports logged yet.</div>`;
  }

  const rows = recentLogs
    .map((entry) => {
      const meta = STATUS_META[entry.status] || { emoji: "❓", label: "Unknown" };
      const time = new Date(entry.reportedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "medium",
      });
      return `<tr>
        <td class="log-time">${time}</td>
        <td>${escapeHtml(entry.accountName)}</td>
        <td>${entry.fiveHourPctUsed}%</td>
        <td>${entry.sevenDayPctUsed}%</td>
        <td>${meta.emoji} ${meta.label}</td>
        <td class="log-device">${escapeHtml(entry.deviceId || "—")}</td>
      </tr>`;
    })
    .join("");

  return `<table class="manage-table logs-table">
    <thead><tr><th>Time (IST)</th><th>Account</th><th>5hr</th><th>7day</th><th>Status</th><th>Device</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * @param {Object} data
 * @param {Array} data.results - from usageReportComposer.composeUsageResults()
 * @param {Object<string, Object>} [data.analyticsByName] - accountName -> usageAnalytics.summarizeAccountAnalytics() output
 * @param {Object} [data.teamAnalytics] - usageAnalytics.summarizeTeamAnalytics() output
 * @param {Array<{name:string, contact:string, loginEmail:string}>} [data.accounts]
 * @param {Array} [data.recentLogs] - from recentLogsBuilder.buildRecentLogEntries()
 * @param {{basePath:string, installHookUrl:string, requestBaseUrl:string}} data.urls
 * @param {string} [data.onboardingMessage]
 * @param {string} [data.generatedAtIso] - injectable for testing
 * @returns {string} full HTML document
 */
function buildDashboardHtml(data) {
  const {
    results,
    analyticsByName = {},
    teamAnalytics = { hasData: false },
    accounts = [],
    recentLogs = [],
    urls,
    onboardingMessage = "",
    generatedAtIso = new Date().toISOString(),
  } = data;

  const summary = buildSummary(results);
  const cards = results.map((result) => buildAccountCard(result, analyticsByName[result.name], urls.requestBaseUrl)).join("\n");
  const generatedAt = new Date(generatedAtIso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const manageTab = buildManageTab(accounts, { ...urls, onboardingMessage });
  const logsTab = buildLogsTab(recentLogs);

  const dashboardClaudeLines = [
    `${summary.totalAccounts} account${summary.totalAccounts === 1 ? "" : "s"} under watch, ${summary.freshCount} reporting fresh data.`,
    summary.multiDeviceAccounts > 0
      ? `⚠️ ${summary.multiDeviceAccounts} account${summary.multiDeviceAccounts === 1 ? " is" : "s are"} being shared right now.`
      : "No shared-account overlaps right now — looking tidy!",
    teamAnalytics && teamAnalytics.hasData && teamAnalytics.busiestAccountName
      ? `${teamAnalytics.busiestAccountName} is the busiest account lately.`
      : "Click a card's Request Access button if you need to borrow capacity.",
  ];
  const dashboardCodexLines = [
    "compiling usage stats…",
    `refresh cycle: 60s. status: nominal.`,
    "01000100 01000001 01010100 01000001",
  ];
  const dashboardBugLines = [
    teamAnalytics && teamAnalytics.hasData && teamAnalytics.totalExhaustedEvents > 0
      ? `I've caused ${teamAnalytics.totalExhaustedEvents} exhaustion event${teamAnalytics.totalExhaustedEvents === 1 ? "" : "s"} so far. Oops.`
      : "No exhaustion events yet. I'm bored.",
    "found a rate limit. reported it. felt useful.",
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="60" />
<title>Claude Usage — Team Dashboard</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #faf7f2;
    --bg-grad: radial-gradient(circle at 15% 0%, color-mix(in srgb, var(--accent) 9%, var(--bg)), var(--bg) 55%);
    --card-bg: #ffffff;
    --text: #2b2019;
    --muted: #7a6f63;
    --border: #ece4d8;
    --accent: #da7756;
    --accent-dark: #c05f3f;
    --shadow-color: 218,119,86;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1613;
      --card-bg: #242019;
      --text: #f0e9e0;
      --muted: #a89c8d;
      --border: #3a332a;
      --accent: #e08a68;
      --accent-dark: #da7756;
      --shadow-color: 0,0,0;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 20px 60px;
    background: var(--bg-grad);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .page { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 1.55rem; margin: 0 0 4px; font-weight: 700; letter-spacing: -0.01em; }
  h1 .spark { display: inline-block; margin-right: 6px; filter: drop-shadow(0 2px 6px rgba(var(--shadow-color),0.35)); }
  .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 22px; }
  .subtitle a { font-weight: 600; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 26px; }
  .tab-btn {
    appearance: none; border: none; background: none; cursor: pointer;
    padding: 10px 18px; font-size: 0.88rem; font-weight: 600; color: var(--muted);
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    font-family: inherit; border-radius: 8px 8px 0 0; transition: color 0.15s ease, background 0.15s ease;
  }
  .tab-btn:hover { color: var(--text); background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .tab-btn.is-active { color: var(--accent-dark); border-bottom-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .tab-panel { display: none; }
  .tab-panel.is-active { display: block; animation: fadeIn 0.25s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .summary-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }
  .summary-stat {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 1px 2px rgba(var(--shadow-color),0.06), 0 8px 20px -14px rgba(var(--shadow-color),0.5);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  .summary-stat:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(var(--shadow-color),0.08), 0 16px 28px -14px rgba(var(--shadow-color),0.55); }
  .summary-stat__value { font-size: 1.7rem; font-weight: 700; background: linear-gradient(135deg, var(--text), var(--accent-dark)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .summary-stat__label { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
  .summary-stat--alert .summary-stat__value { background: none; -webkit-background-clip: unset; background-clip: unset; color: #d93025; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 18px;
  }
  .account-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 18px 20px;
    box-shadow: 0 1px 2px rgba(var(--shadow-color),0.06), 0 12px 28px -18px rgba(var(--shadow-color),0.55);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .account-card:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(var(--shadow-color),0.08), 0 22px 40px -18px rgba(var(--shadow-color),0.6); }
  .account-card--alert { border-color: #d93025; box-shadow: 0 0 0 1px #d93025 inset, 0 12px 28px -18px rgba(217,48,37,0.45); }
  .account-card__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .account-name { font-weight: 700; font-size: 1.08rem; }
  .account-contact { color: var(--muted); font-size: 0.82rem; margin-bottom: 12px; }
  .status-pill {
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pill-color, var(--muted)) 15%, transparent);
    color: var(--pill-color, var(--muted));
    white-space: nowrap;
    font-weight: 600;
  }
  .status-pill--unknown { background: color-mix(in srgb, var(--muted) 15%, transparent); color: var(--muted); }
  .bar-row { display: grid; grid-template-columns: 34px 1fr 40px auto; align-items: center; gap: 8px; font-size: 0.85rem; margin: 7px 0; }
  .bar-label { color: var(--muted); font-weight: 600; }
  .bar-track { font-family: monospace; letter-spacing: -1px; color: var(--accent); }
  .bar-pct { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .reset { color: var(--muted); font-size: 0.78rem; }
  .reset--unknown { font-style: italic; }
  .freshness { color: var(--muted); font-size: 0.78rem; margin-top: 8px; }
  .freshness--stale { color: #e37400; }
  .alert-banner {
    margin-top: 10px;
    background: color-mix(in srgb, #d93025 12%, transparent);
    color: #d93025;
    border-radius: 10px;
    padding: 7px 11px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .no-report { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
  details.devices { margin-top: 10px; font-size: 0.82rem; }
  details.devices summary { cursor: pointer; color: var(--accent-dark); font-weight: 600; }
  details.devices summary .warn { color: #d93025; }
  .device-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .device-table th, .device-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
  .badge { font-size: 0.72rem; padding: 2px 7px; border-radius: 999px; }
  .badge--active { background: color-mix(in srgb, #1e8e3e 18%, transparent); color: #1e8e3e; }
  .badge--idle { background: color-mix(in srgb, var(--muted) 15%, transparent); color: var(--muted); }
  .team-overview {
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--card-bg)), var(--card-bg));
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 16px 20px;
    margin-bottom: 22px;
    box-shadow: 0 1px 2px rgba(var(--shadow-color),0.06), 0 14px 30px -20px rgba(var(--shadow-color),0.55);
  }
  .team-overview__title { font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; }
  .team-overview__stats { display: flex; flex-wrap: wrap; gap: 14px; }
  .analytics { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
  .analytics--empty { color: var(--muted); font-size: 0.78rem; font-style: italic; }
  .sparkline { line-height: 0; margin-bottom: 6px; }
  .analytics-stats { display: flex; flex-wrap: wrap; gap: 10px; }
  .stat { font-size: 0.76rem; color: var(--muted); }
  .stat strong { color: var(--text); }
  .stat--warn { color: #d93025; }
  .card-actions { margin-top: 12px; }
  .request-btn, .add-account-btn {
    display: inline-block;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), var(--accent-dark));
    color: #fff;
    text-decoration: none;
    box-shadow: 0 4px 12px -4px rgba(var(--shadow-color),0.6);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .request-btn:hover, .add-account-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -4px rgba(var(--shadow-color),0.65); }
  .add-account-btn { margin-bottom: 20px; margin-right: 10px; }
  .add-account-btn--secondary { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); box-shadow: 0 1px 2px rgba(var(--shadow-color),0.06); }
  .manage-section { margin-bottom: 24px; }
  .copy-box { margin-bottom: 20px; }
  .copy-box__label { font-size: 0.8rem; color: var(--muted); margin-bottom: 6px; font-weight: 600; }
  .copy-box__row { display: flex; gap: 8px; align-items: flex-start; }
  .copy-box__content {
    flex: 1;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 0.82rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 1px 2px rgba(var(--shadow-color),0.05);
  }
  .copy-btn {
    appearance: none;
    border: 1px solid var(--border);
    background: var(--card-bg);
    color: var(--text);
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    transition: background 0.15s ease;
  }
  .copy-btn:hover { background: color-mix(in srgb, var(--accent) 10%, var(--card-bg)); }
  .copy-btn.copied { background: #1e8e3e; color: #fff; border-color: #1e8e3e; }
  .manage-table, .logs-table {
    width: 100%; border-collapse: collapse; background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 14px; overflow: hidden; box-shadow: 0 1px 2px rgba(var(--shadow-color),0.06), 0 12px 26px -18px rgba(var(--shadow-color),0.5);
  }
  .manage-table th, .logs-table th { background: color-mix(in srgb, var(--accent) 6%, var(--card-bg)); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .manage-table th, .manage-table td, .logs-table th, .logs-table td {
    text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 0.85rem;
  }
  .manage-table tr:last-child td, .logs-table tr:last-child td { border-bottom: none; }
  .manage-table tbody tr:hover, .logs-table tbody tr:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .remove-link { color: #d93025; text-decoration: none; font-size: 0.82rem; font-weight: 600; }
  .log-time { color: var(--muted); white-space: nowrap; }
  .log-device { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.76rem; color: var(--muted); }
  footer { margin-top: 36px; color: var(--muted); font-size: 0.78rem; text-align: center; }
  footer .spark { opacity: 0.6; }
  a { color: var(--accent-dark); }
</style>
</head>
<body>
<div class="page">
  <h1>Claude Usage — Team Dashboard</h1>
  <div class="subtitle">Generated ${generatedAt} IST · refreshes every 60s · <a href="usage-now">post to Chat now</a></div>

  <div class="tabs" role="tablist">
    <button type="button" class="tab-btn" data-tab="overview">Overview</button>
    <button type="button" class="tab-btn" data-tab="manage">Manage</button>
    <button type="button" class="tab-btn" data-tab="logs">Logs</button>
  </div>

  <div class="tab-panel" id="tab-overview">
    ${buildTeamOverview(teamAnalytics)}

    <div class="summary-strip">
      <div class="summary-stat">
        <div class="summary-stat__value">${summary.totalAccounts}</div>
        <div class="summary-stat__label">Accounts configured</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat__value">${summary.freshCount}</div>
        <div class="summary-stat__label">Reporting fresh data</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat__value">${summary.totalActiveDevices}</div>
        <div class="summary-stat__label">Devices active (last 1h)</div>
      </div>
      <div class="summary-stat${summary.multiDeviceAccounts > 0 ? " summary-stat--alert" : ""}">
        <div class="summary-stat__value">${summary.multiDeviceAccounts}</div>
        <div class="summary-stat__label">Accounts shared (last 1h)</div>
      </div>
    </div>

    <div class="grid">
      ${cards}
    </div>
  </div>

  <div class="tab-panel" id="tab-manage">
    ${manageTab}
  </div>

  <div class="tab-panel" id="tab-logs">
    ${logsTab}
  </div>

  <footer>claude-usage-bot · numbers self-reported by each account's local Claude Code hook</footer>
</div>
<script>
(function () {
  var tabs = ["overview", "manage", "logs"];
  function activate(name) {
    if (tabs.indexOf(name) === -1) name = "overview";
    tabs.forEach(function (t) {
      var btn = document.querySelector('.tab-btn[data-tab="' + t + '"]');
      var panel = document.getElementById("tab-" + t);
      var isActive = t === name;
      if (btn) btn.classList.toggle("is-active", isActive);
      if (panel) panel.classList.toggle("is-active", isActive);
    });
  }
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.getAttribute("data-tab");
      window.location.hash = name;
      activate(name);
    });
  });
  activate((window.location.hash || "#overview").slice(1));

  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = document.getElementById(btn.getAttribute("data-copy-target"));
      if (!target || !navigator.clipboard) return;
      navigator.clipboard.writeText(target.textContent).then(function () {
        btn.classList.add("copied");
        var original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.textContent = original;
        }, 1500);
      });
    });
  });
})();
</script>
  ${buildPetWidgetHtml({
    claudeLines: dashboardClaudeLines,
    codexLines: dashboardCodexLines,
    bugLines: dashboardBugLines,
  })}
</body>
</html>`;
}

module.exports = { buildDashboardHtml };
