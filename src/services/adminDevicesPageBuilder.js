// Renders the passkey-gated "which device is consuming how much Claude"
// page at /claude-usage-bot/admin/devices — deliberately a separate page
// from the public /dashboard, per the ask to keep this (and account
// removal) restricted to one person.
//
// Third revision: v1 was raw numbers with no context, v2 was full plain-
// English sentences (too much text), this one is a denser "technical
// dashboard" look — monospace, dark-leaning, progress bars instead of
// bare percentages, a 24-hour IST activity heatmap, a segmented status
// bar, and an expandable raw check-in log — while keeping every number
// captioned so it's still readable, not just decorative. Same underlying
// data as before plus a few new computed fields (see
// deviceConsumptionBuilder.js): min values, hourly distribution, a live/
// idle indicator, and a recent raw check-in log.

const { buildSparklineSvg } = require("./sparklineSvg");
const { buildPetWidgetHtml } = require("./petWidget");

function buildPersonTable(personRows) {
  if (!personRows || personRows.length === 0) return "";
  const rows = personRows
    .map((p) => {
      const now5h = p.currentFiveHourPctUsed;
      const now7d = p.currentSevenDayPctUsed;
      const color5h = now5h === null ? "var(--muted)" : severityColor(now5h);
      const color7d = now7d === null ? "var(--muted)" : severityColor(now7d);
      return `<tr>
        <td>${escapeHtml(p.name)}</td>
        <td class="log-device">${escapeHtml(p.contact)}</td>
        <td>${p.deviceCount}</td>
        <td>${p.totalCheckIns}</td>
        <td style="color:${color5h}; font-weight:600">${now5h === null ? "—" : `${now5h}%`}</td>
        <td style="color:${color7d}; font-weight:600">${now7d === null ? "—" : `${now7d}%`}</td>
        <td>${p.avgFiveHourPctUsed === null ? "—" : `${p.avgFiveHourPctUsed}%`} / ${p.maxFiveHourPctUsed === null ? "—" : `${p.maxFiveHourPctUsed}%`}</td>
        <td>${p.exhaustedCount > 0 ? `<span style="color:#d93025">${p.exhaustedCount}×</span>` : "0"}</td>
      </tr>`;
    })
    .join("");

  return `<div class="person-block">
    <div class="section-label">who's using how much (busiest first)</div>
    <table class="person-table">
      <thead><tr><th>person</th><th>contact</th><th>devices</th><th>check-ins</th><th>5hr now</th><th>7day now</th><th>5hr avg/peak</th><th>exhausted</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// Same rollup as buildPersonTable, but keyed by device instead of account --
// the person view answers "who", this answers "which machine", side by
// side with it for a same at-a-glance comparison instead of only inside
// the fuller cards below.
function buildDeviceTable(deviceRows) {
  if (!deviceRows || deviceRows.length === 0) return "";
  const sorted = deviceRows.slice().sort((a, b) => b.lastFiveHourPctUsed - a.lastFiveHourPctUsed);
  const rows = sorted
    .map((r) => {
      const color5h = severityColor(r.lastFiveHourPctUsed);
      const color7d = severityColor(r.lastSevenDayPctUsed);
      const sharedNote = r.accountNames.length > 1 ? ` <span style="color:#e37400">(${r.accountNames.length})</span>` : "";
      return `<tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="log-device">${r.accountNames.map(escapeHtml).join(", ")}${sharedNote}</td>
        <td>${r.reportCount}</td>
        <td style="color:${color5h}; font-weight:600">${r.lastFiveHourPctUsed}%</td>
        <td style="color:${color7d}; font-weight:600">${r.lastSevenDayPctUsed}%</td>
        <td>${r.avgFiveHourPctUsed}% / ${r.maxFiveHourPctUsed}%</td>
        <td>${r.exhaustedCount > 0 ? `<span style="color:#d93025">${r.exhaustedCount}×</span>` : "0"}</td>
        <td>${r.isLive ? `<span style="color:#3fb950">live</span>` : `idle ${r.lastSeenMinutesAgo}m`}</td>
      </tr>`;
    })
    .join("");

  return `<div class="person-block">
    <div class="section-label">by device (busiest first)</div>
    <table class="person-table">
      <thead><tr><th>device</th><th>used by</th><th>check-ins</th><th>5hr now</th><th>7day now</th><th>5hr avg/peak</th><th>exhausted</th><th>status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIst(iso, opts) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts });
}

function formatShortDate(iso) {
  return formatIst(iso, { day: "2-digit", month: "short" });
}

function formatTime(iso) {
  return formatIst(iso, { hour: "numeric", minute: "2-digit", hour12: true });
}

function severityColor(pct) {
  if (pct >= 90) return "#d93025";
  if (pct >= 50) return "#e37400";
  return "#1e8e3e";
}

function buildProgressBar(pct, min, avg, max) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = severityColor(pct);
  return `<div class="pbar">
    <div class="pbar__track">
      <div class="pbar__fill" style="width:${clamped}%; background:${color}"></div>
    </div>
    <div class="pbar__range">min ${min}% · avg ${avg}% · peak ${max}%</div>
  </div>`;
}

function buildHeatmap(hourlyDistribution) {
  const maxCount = Math.max(...hourlyDistribution, 1);
  const cells = hourlyDistribution
    .map((count, hour) => {
      const intensity = count === 0 ? 0 : 0.25 + 0.75 * (count / maxCount);
      const label = `${hour}:00 IST — ${count} check-in${count === 1 ? "" : "s"}`;
      return `<div class="heat-cell" style="opacity:${count === 0 ? 0.12 : intensity}" title="${escapeHtml(label)}"></div>`;
    })
    .join("");
  return `<div class="heatmap">${cells}</div>`;
}

function buildStatusBar(r) {
  const total = r.availableCount + r.lowCount + r.exhaustedCount;
  if (total === 0) return "";
  const availPct = (r.availableCount / total) * 100;
  const lowPct = (r.lowCount / total) * 100;
  const exhaustedPct = (r.exhaustedCount / total) * 100;
  return `<div class="status-bar" title="${r.availableCount} available · ${r.lowCount} low · ${r.exhaustedCount} exhausted">
    <div class="status-bar__seg" style="width:${availPct}%; background:#1e8e3e"></div>
    <div class="status-bar__seg" style="width:${lowPct}%; background:#e37400"></div>
    <div class="status-bar__seg" style="width:${exhaustedPct}%; background:#d93025"></div>
  </div>`;
}

function buildCheckInLog(r) {
  if (!r.recentCheckIns || r.recentCheckIns.length === 0) return "";
  const rows = r.recentCheckIns
    .map(
      (c) => `<tr>
        <td>${formatTime(c.reportedAt)}</td>
        <td>${c.fiveHourPctUsed}%</td>
        <td>${c.sevenDayPctUsed}%</td>
        <td><span class="status-dot" style="background:${severityColor(c.status === "exhausted" ? 100 : c.status === "low" ? 60 : 0)}"></span>${escapeHtml(c.status || "?")}</td>
      </tr>`
    )
    .join("");
  return `<details class="log-details">
    <summary>raw check-in log (${r.recentCheckIns.length})</summary>
    <table class="log-table">
      <thead><tr><th>time</th><th>5hr</th><th>7day</th><th>status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </details>`;
}

function buildDeviceCard(r) {
  const who = r.accountNames.map(escapeHtml).join(" + ");
  const sharedBadge =
    r.accountNames.length > 1 ? `<span class="shared-badge">⚠ ${r.accountNames.length} accounts</span>` : "";
  const liveBadge = r.isLive
    ? `<span class="live-badge"><span class="live-dot"></span>live</span>`
    : `<span class="idle-badge">idle ${r.lastSeenMinutesAgo}m</span>`;
  const sparkline5h = buildSparklineSvg(r.sparklinePoints, { color: "#1a73e8", width: 130, height: 26 });
  const sparkline7d = buildSparklineSvg(r.sevenDaySparklinePoints, { color: "#8ab4f8", width: 130, height: 26 });

  const metaBits = [
    `${r.reportCount} check-ins`,
    r.reportsPerDay ? `~${r.reportsPerDay}/day` : null,
    r.peakHourLabel ? `peak ${r.peakHourLabel}` : null,
    `since ${formatShortDate(r.firstReportedAt)}`,
  ].filter(Boolean);

  return `<div class="device-card">
    <div class="device-card__top">
      <div>
        <div class="device-name">${escapeHtml(r.label)}</div>
        <div class="who">used by: ${who}</div>
      </div>
      <div class="badges">${liveBadge}${sharedBadge}</div>
    </div>

    <div class="limit-block">
      <div class="limit-block__head"><span class="limit-tag">5HR</span><span class="limit-now">${r.lastFiveHourPctUsed}%</span></div>
      ${buildProgressBar(r.lastFiveHourPctUsed, r.minFiveHourPctUsed, r.avgFiveHourPctUsed, r.maxFiveHourPctUsed)}
    </div>
    <div class="limit-block">
      <div class="limit-block__head"><span class="limit-tag">7DAY</span><span class="limit-now">${r.lastSevenDayPctUsed}%</span></div>
      ${buildProgressBar(r.lastSevenDayPctUsed, r.minSevenDayPctUsed, r.avgSevenDayPctUsed, r.maxSevenDayPctUsed)}
    </div>

    <div class="spark-row">
      ${sparkline5h ? `<div class="spark-cell"><div class="spark-cell__label">5hr trend</div>${sparkline5h}</div>` : ""}
      ${sparkline7d ? `<div class="spark-cell"><div class="spark-cell__label">7day trend</div>${sparkline7d}</div>` : ""}
    </div>

    <div class="heatmap-block">
      <div class="heatmap-block__label">activity by hour (IST)</div>
      ${buildHeatmap(r.hourlyDistribution)}
    </div>

    ${buildStatusBar(r)}
    ${buildCheckInLog(r)}

    <div class="meta-line">${metaBits.join(" · ")}</div>
  </div>`;
}

/**
 * @param {Array} rows - from deviceConsumptionBuilder.buildDeviceConsumptionRows()
 * @param {Array} [personRows] - from personUsageBuilder.buildPersonUsageRows()
 * @param {string} [generatedAtIso] - injectable for testing
 * @returns {string} full HTML document
 */
function buildAdminDevicesHtml(rows, personRows = [], generatedAtIso = new Date().toISOString()) {
  const generatedAt = formatIst(generatedAtIso, { dateStyle: "medium", timeStyle: "short" });
  const cards = rows.map(buildDeviceCard).join("\n");
  const liveCount = rows.filter((r) => r.isLive).length;
  const totalCheckIns = rows.reduce((sum, r) => sum + r.reportCount, 0);
  const sharedCount = rows.filter((r) => r.accountNames.length > 1).length;
  const personTable = buildPersonTable(personRows);
  const deviceTable = buildDeviceTable(rows);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Device Consumption — Admin</title>
<style>
  :root { color-scheme: dark light; --bg:#0d1117; --card-bg:#161b22; --text:#e6edf3; --muted:#8b949e; --border:#30363d; --accent:#58a6ff; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f7f9; --card-bg:#ffffff; --text:#202124; --muted:#5f6368; --border:#e3e5e8; --accent:#1a73e8; }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  .page { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; letter-spacing: 0.02em; }
  .subtitle { color: var(--muted); font-size: 0.8rem; margin-bottom: 16px; }
  .subtitle a { color: var(--accent); }
  .summary-strip { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .summary-chip { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-size: 0.76rem; color: var(--muted); }
  .summary-chip strong { color: var(--text); font-size: 0.9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
  .device-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .device-card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .device-name { font-weight: 600; font-size: 0.88rem; }
  .who { color: var(--muted); font-size: 0.68rem; }
  .badges { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .live-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 0.66rem; color: #3fb950; }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #3fb950; box-shadow: 0 0 4px #3fb950; }
  .idle-badge { font-size: 0.66rem; color: var(--muted); }
  .shared-badge { font-size: 0.66rem; color: #e37400; }
  .limit-block { margin-bottom: 8px; }
  .limit-block__head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
  .limit-tag { font-size: 0.62rem; letter-spacing: 0.06em; color: var(--muted); }
  .limit-now { font-size: 0.95rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pbar__track { height: 6px; border-radius: 3px; background: var(--bg); overflow: hidden; }
  .pbar__fill { height: 100%; }
  .pbar__range { font-size: 0.62rem; color: var(--muted); margin-top: 2px; }
  .spark-row { display: flex; gap: 14px; margin: 10px 0; }
  .spark-cell__label { font-size: 0.6rem; color: var(--muted); margin-bottom: 2px; }
  .heatmap-block { margin-bottom: 8px; }
  .heatmap-block__label { font-size: 0.62rem; color: var(--muted); margin-bottom: 3px; }
  .heatmap { display: grid; grid-template-columns: repeat(24, 1fr); gap: 1.5px; height: 14px; }
  .heat-cell { background: var(--accent); border-radius: 1px; }
  .status-bar { display: flex; height: 5px; border-radius: 3px; overflow: hidden; margin-bottom: 8px; background: var(--bg); }
  .log-details { font-size: 0.7rem; margin-bottom: 8px; }
  .log-details summary { cursor: pointer; color: var(--accent); }
  .log-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .log-table th, .log-table td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--border); font-size: 0.68rem; }
  .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; }
  .meta-line { font-size: 0.68rem; color: var(--muted); }
  .no-data { color: var(--muted); font-size: 0.85rem; }
  .section-label { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 4px 0 8px; }
  .person-block { margin-bottom: 24px; }
  .person-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .person-table th, .person-table td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border); font-size: 0.76rem; }
  .person-table tr:last-child td { border-bottom: none; }
  .log-device { color: var(--muted); font-size: 0.72rem; }
</style>
</head>
<body>
<div class="page">
  <h1>&gt; device_consumption</h1>
  <div class="subtitle">generated ${generatedAt} IST · <a href="../dashboard">back to dashboard</a> · <a href="roster">manage roster</a></div>
  <div class="summary-strip">
    <div class="summary-chip"><strong>${rows.length}</strong> devices</div>
    <div class="summary-chip"><strong>${liveCount}</strong> live now</div>
    <div class="summary-chip"><strong>${totalCheckIns}</strong> check-ins</div>
    <div class="summary-chip"><strong>${sharedCount}</strong> shared devices</div>
  </div>
  ${personTable}
  ${deviceTable}
  <div class="section-label">device detail</div>
  ${
    rows.length === 0
      ? `<div class="no-data">No device check-ins yet.</div>`
      : `<div class="grid">${cards}</div>`
  }
</div>
${buildPetWidgetHtml({
  claudeLines: [
    `${rows.length} device${rows.length === 1 ? "" : "s"} on record, ${liveCount} live right now.`,
    sharedCount > 0
      ? `⚠️ ${sharedCount} device${sharedCount === 1 ? " is" : "s are"} being shared across accounts.`
      : "No devices are double-booked right now.",
  ],
  codexLines: ["indexing device fingerprints…", "01100100 01100101 01110110 01101001 01100011 01100101"],
  bugLines: ["I live on one of these devices. Which one? Unclear.", `${totalCheckIns} check-ins and counting.`],
})}
</body>
</html>`;
}

module.exports = { buildAdminDevicesHtml };
