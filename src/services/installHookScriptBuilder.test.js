const { buildInstallScript, buildReportScript, shellSingleQuote } = require("./installHookScriptBuilder");

const REPORT_URL = "https://your-domain.example.com/claude-usage-bot/report-usage";

describe("shellSingleQuote", () => {
  test("wraps a plain string in single quotes", () => {
    expect(shellSingleQuote("Alice")).toBe("'Alice'");
  });

  test("escapes an embedded single quote so the result stays one shell word", () => {
    expect(shellSingleQuote("O'Brien")).toBe("'O'\\''Brien'");
  });
});

describe("buildReportScript", () => {
  test("embeds the report URL as a shell-quoted export", () => {
    const script = buildReportScript(REPORT_URL);
    expect(script).toContain(`export REPORT_URL='${REPORT_URL}'`);
  });

  test("looks up the real logged-in account's email via the profile endpoint, not a hardcoded name", () => {
    const script = buildReportScript(REPORT_URL);
    expect(script).toContain("https://api.anthropic.com/api/oauth/profile");
    expect(script).toContain("LOGIN_EMAIL");
    expect(script).not.toContain("ACCOUNT_NAME");
  });

  test("checks macOS Keychain first, falls back to the Linux/Windows credentials file", () => {
    const script = buildReportScript(REPORT_URL);
    expect(script).toContain("security find-generic-password -s 'Claude Code-credentials' -w");
    expect(script).toContain(".claude/.credentials.json");
  });

  test("the token is used only for Authorization headers, never sent in the report body", () => {
    const script = buildReportScript(REPORT_URL);
    expect(script).toContain("-H \"Authorization: Bearer $TOKEN\"");
    const bodyLine = script.split("\n").find((line) => line.includes("JSON.stringify"));
    expect(bodyLine).toBeDefined();
    expect(bodyLine).not.toContain("TOKEN");
    expect(bodyLine).toContain("loginEmail: process.env.LOGIN_EMAIL");
    expect(bodyLine).toContain("usage: JSON.parse(process.env.USAGE_JSON)");
  });

  test("derives a stable per-machine deviceId and a human deviceLabel, sent alongside the report", () => {
    const script = buildReportScript(REPORT_URL);
    expect(script).toContain("DEVICE_ID");
    expect(script).toContain("DEVICE_LABEL");
    expect(script).toContain("os.hostname()");
    const bodyLine = script.split("\n").find((line) => line.includes("JSON.stringify"));
    expect(bodyLine).toContain("deviceId: process.env.DEVICE_ID");
    expect(bodyLine).toContain("deviceLabel: process.env.DEVICE_LABEL");
  });

  test("includes the required OAuth beta header on every Anthropic call", () => {
    const script = buildReportScript(REPORT_URL);
    const occurrences = script.split("anthropic-beta: oauth-2025-04-20").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // profile call + usage call
  });

  test("exits early if the profile lookup returns no email, before fetching usage", () => {
    const script = buildReportScript(REPORT_URL);
    const profileLine = script.indexOf("LOGIN_EMAIL");
    const usageLine = script.indexOf("USAGE_JSON=");
    expect(profileLine).toBeGreaterThan(-1);
    expect(usageLine).toBeGreaterThan(profileLine);
    expect(script).toContain('[ -z "$LOGIN_EMAIL" ] && exit 0');
  });
});

describe("buildInstallScript", () => {
  test("writes report-usage.sh via a quoted heredoc and makes it executable", () => {
    const script = buildInstallScript(REPORT_URL);
    expect(script).toContain("cat > \"$HOME/.claude/claude-usage-bot/report-usage.sh\" << 'REPORT_SCRIPT_EOF'");
    expect(script).toContain("chmod +x \"$HOME/.claude/claude-usage-bot/report-usage.sh\"");
  });

  test("converges to exactly one hook entry, replacing any prior one instead of just skipping", () => {
    const script = buildInstallScript(REPORT_URL);
    expect(script).toContain("hadExistingEntry");
    expect(script).toContain('node "$HOME/.claude/claude-usage-bot/install-hook.js"');
    expect(script).toContain('rm -f "$HOME/.claude/claude-usage-bot/install-hook.js"');
  });

  test("resolves bash's own absolute path from the running install rather than relying on a bare 'bash'", () => {
    const script = buildInstallScript(REPORT_URL);
    expect(script).toContain('CLAUDE_USAGE_BOT_BASH_PATH="$(command -v bash 2>/dev/null || echo bash)"');
    expect(script).toContain("export CLAUDE_USAGE_BOT_BASH_PATH");
    expect(script).toContain("process.env.CLAUDE_USAGE_BOT_BASH_PATH");
  });

  test("bails without modifying settings.json if it doesn't parse as JSON", () => {
    const script = buildInstallScript(REPORT_URL);
    expect(script).toContain("is not valid JSON -- leaving it untouched");
  });

  test("is identical regardless of who runs it -- one universal script, no per-person personalization", () => {
    const scriptA = buildInstallScript(REPORT_URL);
    const scriptB = buildInstallScript(REPORT_URL);
    expect(scriptA).toBe(scriptB);
  });
});
