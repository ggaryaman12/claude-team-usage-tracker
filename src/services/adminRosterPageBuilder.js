// Renders the passkey-gated roster management page at /admin/roster —
// add/remove who's allowed to type their email on /request and have it
// accepted (see knownRequestersStore.js). Same warm theme as the rest of
// the site, matching adminDevicesPageBuilder.js's "back to..." nav pattern.

const { buildPetWidgetHtml } = require("./petWidget");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {Array<{name: string, email: string}>} roster
 * @param {string} basePath - e.g. /claude-usage-bot
 * @param {string} [errorMessage]
 * @returns {string} full HTML document
 */
function buildAdminRosterPageHtml(roster, basePath, errorMessage = "") {
  const rows = roster
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td class="email-cell">${escapeHtml(r.email)}</td>
        <td>
          <form method="POST" action="${basePath}/admin/roster/remove" class="inline-form">
            <input type="hidden" name="email" value="${escapeHtml(r.email)}" />
            <button type="submit" class="remove-btn">Remove</button>
          </form>
        </td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Roster — Admin</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --card-bg:#ffffff; --text:#2b2019; --muted:#7a6f63; --border:#ece4d8; --accent:#da7756; --accent-dark:#c05f3f; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1a1613; --card-bg:#242019; --text:#f0e9e0; --muted:#a89c8d; --border:#3a332a; --accent:#e08a68; --accent-dark:#da7756; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:36px 20px 60px; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .page { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 22px; }
  .sub a { color: var(--accent-dark); font-weight: 600; }
  .error { background: color-mix(in srgb, #d93025 12%, transparent); color: #d93025; border-radius: 8px; padding: 8px 12px; font-size: 0.82rem; margin-bottom: 16px; }
  .add-form { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
  .add-form input { flex: 1; min-width: 160px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text); font-size: 0.88rem; }
  .add-form button {
    border: none; border-radius: 8px; padding: 10px 18px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
    background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #fff;
  }
  table { width: 100%; border-collapse: collapse; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
  th { background: color-mix(in srgb, var(--accent) 6%, var(--card-bg)); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  tr:last-child td { border-bottom: none; }
  .email-cell { color: var(--muted); }
  .inline-form { margin: 0; }
  .remove-btn { color: #d93025; background: none; border: none; cursor: pointer; padding: 0; font-size: 0.82rem; font-weight: 600; }
  .empty-row { color: var(--muted); }
</style>
</head>
<body>
<div class="page">
  <h1>Known requesters</h1>
  <div class="sub">Anyone on this list can type their email on the /request page and have it accepted. <a href="devices">Back to admin</a></div>
  ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
  <form method="POST" action="${basePath}/admin/roster" class="add-form">
    <input type="text" name="name" placeholder="Full name" required />
    <input type="email" name="email" placeholder="email@example.com" required />
    <button type="submit">+ Add</button>
  </form>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="3" class="empty-row">Roster is empty.</td></tr>`}</tbody>
  </table>
</div>
${buildPetWidgetHtml({
  claudeLines: [
    `${roster.length} teammate${roster.length === 1 ? "" : "s"} can request access right now.`,
    errorMessage ? "Hmm, that didn't work — check the error above." : "Add someone new with the form up top!",
  ],
  codexLines: ["syncing roster…", "01110010 01101111 01110011 01110100 01100101 01110010"],
  bugLines: ["I'm not on the roster. Rude.", "roster.length > 0 ? good : concerning"],
})}
</body>
</html>`;
}

module.exports = { buildAdminRosterPageHtml };
