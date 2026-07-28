// Builds the install script served from /install-hook.sh. Mirrors
// HaloNotch's ClaudeHookInstaller.swift discipline (idempotent,
// non-destructive — only appends our hook if missing, never touches other
// keys or other tools' hooks, bails out untouched if settings.json doesn't
// parse) but as a shell+node script instead of a compiled Swift installer,
// since this has to run on whatever machine the account owner is on.
//
// One universal script for everyone — NOT personalized by account name.
// An earlier version baked a fixed account name into each person's script
// at install time, which silently misattributes usage on a shared machine:
// if Alice installs his own script, then later logs into Bob's
// account to use her spare capacity, every report while logged in as her
// would still be filed under "Alice". Fixed by having the script look up
// the *actual* logged-in account's real email via Anthropic's own
// /api/oauth/profile endpoint on every report, and letting the server
// match that email against each configured account's loginEmail — so
// whichever account is live in the local Keychain at report time is who
// the numbers get attributed to, correctly, automatically.
//
// Two-heredoc structure deliberately avoids nested-quoting hazards: each
// heredoc uses a quoted delimiter ('EOF'), so bash captures its content
// 100% literally — no risk of `$`, backticks, or quotes inside either
// embedded script being misinterpreted by the outer installer.

function shellSingleQuote(str) {
  return "'" + String(str).replace(/'/g, `'\\''`) + "'";
}

/**
 * The script installed at ~/.claude/claude-usage-bot/report-usage.sh, run
 * automatically by the Stop hook. Never sends the account's OAuth token
 * anywhere — reads it only locally (Keychain on macOS, the plain
 * credentials file on Linux/Windows) to call Anthropic directly from this
 * machine, then forwards the real logged-in account's email plus the
 * resulting usage percentages.
 *
 * @param {string} reportUrl - e.g. https://your-domain.example.com/claude-usage-bot/report-usage
 * @returns {string}
 */
function buildReportScript(reportUrl) {
  return `#!/bin/bash
# claude-usage-bot: reports live Claude usage percentages to the team dashboard.
# Installed by /claude-usage-bot/install-hook.sh — runs automatically on every
# Claude Code "Stop" event. Never sends your token anywhere: reads it only
# locally to call Anthropic directly from this machine, then forwards your
# account's email (so we know whose numbers these are, correctly, even if
# you switch between accounts on this machine), a device label derived from
# this machine's hostname (so the team dashboard can flag when the same
# shared account is in active use from two machines at once), and the
# resulting percentages.
set -e

export REPORT_URL=${shellSingleQuote(reportUrl)}

if command -v security >/dev/null 2>&1; then
  TOKEN_JSON=$(security find-generic-password -s 'Claude Code-credentials' -w 2>/dev/null) || TOKEN_JSON=""
elif [ -f "$HOME/.claude/.credentials.json" ]; then
  TOKEN_JSON=$(cat "$HOME/.claude/.credentials.json" 2>/dev/null) || TOKEN_JSON=""
else
  TOKEN_JSON=""
fi
[ -z "$TOKEN_JSON" ] && exit 0

TOKEN=$(echo "$TOKEN_JSON" | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write((d.claudeAiOauth&&d.claudeAiOauth.accessToken)||'')}catch(e){}")
[ -z "$TOKEN" ] && exit 0

export PROFILE_JSON=$(curl -s --max-time 8 -H "Authorization: Bearer $TOKEN" -H "anthropic-version: 2023-06-01" -H "anthropic-beta: oauth-2025-04-20" https://api.anthropic.com/api/oauth/profile)
export LOGIN_EMAIL=$(echo "$PROFILE_JSON" | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write((d.account&&d.account.email)||'')}catch(e){}")
[ -z "$LOGIN_EMAIL" ] && exit 0

export USAGE_JSON=$(curl -s --max-time 8 -H "Authorization: Bearer $TOKEN" -H "anthropic-version: 2023-06-01" -H "anthropic-beta: oauth-2025-04-20" https://api.anthropic.com/api/oauth/usage)
[ -z "$USAGE_JSON" ] && exit 0

# Device identity: derived only from this machine's own hostname + OS user
# (never sent anywhere but our own server), stable across runs so repeated
# reports from the same machine collapse into one device, not a new one
# each time.
DEVICE_ID=$(node -e "const os=require('os');const c=require('crypto');process.stdout.write(c.createHash('sha256').update(os.hostname()+'-'+os.userInfo().username).digest('hex').slice(0,12))" 2>/dev/null) || DEVICE_ID="unknown-device"
export DEVICE_ID
DEVICE_LABEL=$(node -e "const os=require('os');process.stdout.write(os.hostname()+' ('+os.platform()+')')" 2>/dev/null) || DEVICE_LABEL="unknown device"
export DEVICE_LABEL

BODY=$(node -e "process.stdout.write(JSON.stringify({loginEmail: process.env.LOGIN_EMAIL, deviceId: process.env.DEVICE_ID, deviceLabel: process.env.DEVICE_LABEL, usage: JSON.parse(process.env.USAGE_JSON)}))")
curl -s --max-time 8 -X POST "$REPORT_URL" -H "Content-Type: application/json" -d "$BODY" >/dev/null 2>&1 || true
exit 0
`;
}

// A marker substring, not an exact command match, is what identifies "our"
// hook entries below. Needed because the exact hookCommand string can
// legitimately change between installer versions (see BASH_PATH below) --
// matching on the script path means re-running the installer always
// converges to exactly one correct, current entry instead of leaving a
// stale one behind alongside a new one.
const HOOK_MARKER = "claude-usage-bot/report-usage.sh";

// Idempotent (really: convergent) hook installer: replaces any previous
// entry referencing our own script with exactly one up-to-date entry, and
// bails untouched if settings.json exists but doesn't parse as JSON (same
// as ClaudeHookInstaller.swift's "better to silently not self-configure
// than clobber a real config" rule). Plain JS strings only (no embedded
// single quotes) so it's safe inside a single-quoted heredoc delimiter.
//
// hookCommand is built from CLAUDE_USAGE_BOT_BASH_PATH (set by the outer
// installer below to the exact bash binary that's running the install
// itself, via `command -v bash`) rather than a bare "bash". A bare "bash"
// depends on Claude Code's own hook-spawning process resolving it via
// PATH, which isn't guaranteed to match the PATH of the interactive shell
// someone installs from -- confirmed as a real, open Windows issue
// (Git-for-Windows installs that only add Git\\cmd, not Git\\bin, to PATH
// leave bash.exe unresolvable from a different process's PATH; see
// github.com/anthropics/claude-code/issues/22700). Baking in the resolved
// absolute path sidesteps that entirely, on every OS.
const HOOK_INSTALLER_SCRIPT = `const fs = require("fs");
const os = require("os");
const path = require("path");

const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const bashPath = process.env.CLAUDE_USAGE_BOT_BASH_PATH || "bash";
const quotedBashPath = '"' + bashPath.replace(/"/g, '\\\\"') + '"';
const hookCommand = quotedBashPath + " \\"$HOME/.claude/claude-usage-bot/report-usage.sh\\" >/dev/null 2>&1 &";
const hookMarker = "claude-usage-bot/report-usage.sh";

let root = {};
if (fs.existsSync(settingsPath)) {
  try {
    root = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (e) {
    console.error("claude-usage-bot: ~/.claude/settings.json is not valid JSON -- leaving it untouched. Add the hook manually.");
    process.exit(0);
  }
}

root.hooks = root.hooks || {};
root.hooks.Stop = root.hooks.Stop || [];

let hadExistingEntry = false;
root.hooks.Stop = root.hooks.Stop
  .map(function (entry) {
    if (!Array.isArray(entry.hooks)) return entry;
    const filteredHooks = entry.hooks.filter(function (h) {
      const isOurs = typeof h.command === "string" && h.command.indexOf(hookMarker) !== -1;
      if (isOurs) hadExistingEntry = true;
      return !isOurs;
    });
    return Object.assign({}, entry, { hooks: filteredHooks });
  })
  .filter(function (entry) { return Array.isArray(entry.hooks) && entry.hooks.length > 0; });

root.hooks.Stop.push({ hooks: [{ type: "command", command: hookCommand }] });
fs.writeFileSync(settingsPath, JSON.stringify(root, null, 2));
console.log(hadExistingEntry ? "claude-usage-bot: hook updated." : "claude-usage-bot: hook installed.");
`;

/**
 * The full install script served at /install-hook.sh — one universal
 * script, not personalized per person (see file header for why).
 * @param {string} reportUrl
 * @returns {string}
 */
function buildInstallScript(reportUrl) {
  const reportScript = buildReportScript(reportUrl);

  return `#!/bin/bash
set -e
mkdir -p "$HOME/.claude/claude-usage-bot"

cat > "$HOME/.claude/claude-usage-bot/report-usage.sh" << 'REPORT_SCRIPT_EOF'
${reportScript}
REPORT_SCRIPT_EOF
chmod +x "$HOME/.claude/claude-usage-bot/report-usage.sh"

cat > "$HOME/.claude/claude-usage-bot/install-hook.js" << 'INSTALL_HOOK_EOF'
${HOOK_INSTALLER_SCRIPT}
INSTALL_HOOK_EOF

# Resolve bash's own absolute path from *this* running install -- the one
# guaranteed to work, since it's what's executing right now -- and bake
# that into the registered hook command instead of a bare "bash" that a
# different process might not resolve the same way. Falls back to the
# bare name only if resolution genuinely fails (should not happen, since
# this script is itself running under bash).
CLAUDE_USAGE_BOT_BASH_PATH="$(command -v bash 2>/dev/null || echo bash)"
export CLAUDE_USAGE_BOT_BASH_PATH

node "$HOME/.claude/claude-usage-bot/install-hook.js"
rm -f "$HOME/.claude/claude-usage-bot/install-hook.js"

echo "Done -- usage will start reporting the next time you use Claude Code."
`;
}

module.exports = { buildInstallScript, buildReportScript, shellSingleQuote };
