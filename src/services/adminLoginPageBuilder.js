// Renders the admin passkey prompt at /admin — gates the device-
// consumption table, roster management, and account removal. Separate
// from teamLoginPageBuilder.js (the lower-stakes shared /dashboard
// password): this one is a single-person secret, styled distinctly
// (a lock icon, not a sparkle) so the two gates don't look identical.

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
 * @param {string} [returnTo] - path to redirect to after a correct passkey
 * @param {boolean} [wrongPasskey] - show an inline error
 * @returns {string} full HTML document
 */
function buildAdminLoginPageHtml(basePath, returnTo = `${basePath}/admin/devices`, wrongPasskey = false) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin — claude-usage-bot</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --card-bg:#ffffff; --text:#2b2019; --muted:#7a6f63; --border:#ece4d8; --accent:#da7756; --accent-dark:#c05f3f; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1a1613; --card-bg:#242019; --text:#f0e9e0; --muted:#a89c8d; --border:#3a332a; --accent:#e08a68; --accent-dark:#da7756; }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding: 32px 20px; background: radial-gradient(circle at 80% 10%, color-mix(in srgb, var(--accent) 8%, var(--bg)), var(--bg) 55%);
    color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 18px;
    max-width: 360px; width: 100%; padding: 30px 26px; text-align: center;
    box-shadow: 0 18px 40px -18px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.06);
  }
  .lock { font-size: 1.8rem; margin-bottom: 8px; }
  h1 { font-size: 1.1rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 0.8rem; margin-bottom: 20px; }
  input[type="password"] {
    width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text); font-size: 0.92rem; margin-bottom: 12px; text-align: center;
  }
  .error { color: #d93025; font-size: 0.78rem; margin-bottom: 12px; }
  button {
    width: 100%; background: var(--text); color: var(--card-bg); border: none; border-radius: 10px;
    font-size: 0.92rem; font-weight: 600; padding: 12px 14px; cursor: pointer;
  }
  button:hover { background: var(--accent-dark); color: #fff; }
</style>
</head>
<body>
  <div class="card">
    <div class="lock">🔒</div>
    <h1>Admin access</h1>
    <div class="sub">Restricted — passkey required.</div>
    ${wrongPasskey ? `<div class="error">Wrong passkey — try again.</div>` : ""}
    <form method="POST" action="${basePath}/admin">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
      <input type="password" name="passkey" placeholder="Passkey" required autofocus />
      <button type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = { buildAdminLoginPageHtml };
