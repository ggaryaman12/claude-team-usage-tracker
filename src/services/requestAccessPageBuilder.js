// Renders the /request landing page — the requester lands here after
// clicking "Request Access" from either Google Chat or the dashboard.
// Deliberately NOT behind any password gate (unlike /dashboard) since
// there's nothing sensitive on it — just instructions plus a form that
// only accepts a known @example.com email (see knownRequestersStore.js).

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
 * @param {{name: string, loginEmail: string}} account
 * @param {string} basePath - e.g. /claude-usage-bot
 * @param {{errorMessage?: string, prefillEmail?: string}} [opts] - set errorMessage to
 *   re-render this same page with an inline error instead of a bare text response
 *   (e.g. after a roster-validation rejection), prefillEmail to keep what they typed
 * @returns {string} full HTML document
 */
function buildRequestAccessPageHtml(account, basePath, opts = {}) {
  const { errorMessage = "", prefillEmail = "" } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Request Claude access — ${escapeHtml(account.name)}</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --card-bg:#ffffff; --text:#2b2019; --muted:#7a6f63; --border:#ece4d8; --accent:#da7756; --accent-dark:#c05f3f; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1a1613; --card-bg:#242019; --text:#f0e9e0; --muted:#a89c8d; --border:#3a332a; --accent:#e08a68; --accent-dark:#da7756; }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding: 32px 20px; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px;
    max-width: 460px; width: 100%; padding: 28px 26px;
    box-shadow: 0 12px 32px -12px rgba(0,0,0,0.15);
  }
  .spark { font-size: 1.6rem; margin-bottom: 8px; }
  h1 { font-size: 1.2rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 20px; }
  ol { padding-left: 20px; margin: 0 0 22px; }
  li { margin-bottom: 12px; font-size: 0.9rem; line-height: 1.45; }
  a { color: var(--accent-dark); }
  .email-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
  code { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 0.85rem; }
  .copy-btn, button[type="submit"] {
    border: none; border-radius: 8px; padding: 8px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer;
  }
  .copy-btn { background: var(--bg); border: 1px solid var(--border); color: var(--text); }
  .copy-btn.copied { background: #1e8e3e; color: #fff; border-color: #1e8e3e; }
  label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 6px; }
  input[type="email"] {
    width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text); font-size: 0.9rem; margin-bottom: 14px;
  }
  input[type="email"].has-error { border-color: #d93025; }
  .form-error {
    background: color-mix(in srgb, #d93025 12%, transparent); color: #d93025;
    border-radius: 8px; padding: 8px 12px; font-size: 0.82rem; font-weight: 500; margin-bottom: 14px;
  }
  .hint { font-size: 0.72rem; color: var(--muted); margin-top: -8px; margin-bottom: 14px; }
  button[type="submit"] {
    width: 100%; background: var(--accent); color: #fff; font-size: 0.92rem; padding: 11px 14px;
  }
  button[type="submit"]:hover { background: var(--accent-dark); }
</style>
</head>
<body>
  <div class="card">
    <div class="spark">✳️</div>
    <h1>Request access to ${escapeHtml(account.name)}'s Claude account</h1>
    <div class="sub">Follow these steps, then confirm below.</div>
    <ol>
      <li>Open <a href="https://claude.ai/login" target="_blank" rel="noopener">claude.ai/login</a> in a new tab.</li>
      <li>Enter this email address and submit:
        <div class="email-row">
          <code id="target-email">${escapeHtml(account.loginEmail)}</code>
          <button type="button" class="copy-btn" data-copy-target="target-email">Copy</button>
        </div>
      </li>
      <li>Come back here, enter your own email, and confirm — we'll watch for the sign-in link and post it to the group, addressed to you.</li>
    </ol>
    <form method="POST" action="${basePath}/request">
      <input type="hidden" name="account" value="${escapeHtml(account.name)}" />
      <label for="requesterEmail">Your email</label>
      ${errorMessage ? `<div class="form-error">${escapeHtml(errorMessage)}</div>` : ""}
      <input type="email" id="requesterEmail" name="requesterEmail" placeholder="you@example.com" value="${escapeHtml(prefillEmail)}" class="${errorMessage ? "has-error" : ""}" required autofocus="${errorMessage ? "true" : "false"}" />
      <div class="hint">Must match a known team email.</div>
      <button type="submit">Confirm — I've submitted the claude.ai form</button>
    </form>
  </div>
  <script>
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
  </script>
  ${buildPetWidgetHtml({
    claudeLines: [
      `Requesting access to ${account.name}'s account…`,
      "Remember: never share your real password, only the login email.",
      "I'll watch for the sign-in link once you confirm!",
    ],
    codexLines: ["access request logged.", "watching for the sign-in link…", "transparency > secrecy."],
    bugLines: ["I hope nobody's account is as buggy as me.", "sign-in link incoming (probably)."],
  })}
</body>
</html>`;
}

module.exports = { buildRequestAccessPageHtml };
