// Renders the shared-password gate shown before /dashboard — deliberately
// separate from the admin passkey (adminSessionStore.js): this is a low-
// stakes "keep it off random search/link-sharing" gate the whole team
// knows, not a per-person secret. See server.js's requireTeamPassword.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {string} basePath - e.g. /claude-usage-bot
 * @param {string} [returnTo] - path to redirect to after a correct password
 * @param {boolean} [wrongPassword] - show an inline error
 * @returns {string} full HTML document
 */
function buildTeamLoginPageHtml(basePath, returnTo = `${basePath}/dashboard`, wrongPassword = false) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Claude Usage — Team Dashboard</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --card-bg:#ffffff; --text:#2b2019; --muted:#7a6f63; --border:#ece4d8; --accent:#da7756; --accent-dark:#c05f3f; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1a1613; --card-bg:#242019; --text:#f0e9e0; --muted:#a89c8d; --border:#3a332a; --accent:#e08a68; --accent-dark:#da7756; }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding: 32px 20px; background: radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--accent) 10%, var(--bg)), var(--bg) 60%);
    color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 18px;
    max-width: 380px; width: 100%; padding: 32px 28px; text-align: center;
    box-shadow: 0 20px 45px -18px rgba(218,119,86,0.35), 0 2px 6px rgba(0,0,0,0.06);
  }
  .spark { font-size: 2rem; margin-bottom: 10px; }
  h1 { font-size: 1.15rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 0.82rem; margin-bottom: 22px; }
  input[type="password"] {
    width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text); font-size: 0.92rem; margin-bottom: 12px; text-align: center;
  }
  .error { color: #d93025; font-size: 0.78rem; margin-bottom: 12px; }
  .hint { color: var(--muted); font-size: 0.74rem; margin-top: 14px; }
  button {
    width: 100%; background: var(--accent); color: #fff; border: none; border-radius: 10px;
    font-size: 0.92rem; font-weight: 600; padding: 12px 14px; cursor: pointer;
  }
  button:hover { background: var(--accent-dark); }
</style>
</head>
<body>
  <div class="card">
    <div class="spark">✳️</div>
    <h1>Team Dashboard</h1>
    <div class="sub">Enter the team password to continue.</div>
    ${wrongPassword ? `<div class="error">Wrong password — try again.</div>` : ""}
    <form method="POST" action="${basePath}/dashboard-login">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
      <input type="password" name="password" placeholder="Team password" required autofocus />
      <button type="submit">Continue</button>
    </form>
    <div class="hint">Don't have it? Check the pinned message in the Google Chat usage group, or the most recent hourly usage post.</div>
  </div>
</body>
</html>`;
}

module.exports = { buildTeamLoginPageHtml };
