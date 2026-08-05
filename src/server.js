const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");

const { logger } = require("./utilities/logger");
const { buildUsageReportCardMessage } = require("./services/usageReportCardBuilder");
const { composeUsageResults } = require("./services/usageReportComposer");
const { processUsageReport } = require("./services/usageReportProcessor");
const { postToGoogleChat, postMessageToGoogleChat } = require("./services/googleChatWebhook");
const { tryAcquireLock, releaseLock } = require("./services/accountLock");
const { waitForSigninLink, findLatestSigninEmail, buildRelayAuthClient } = require("./services/gmailRelayWatcher");
const { buildRelayAuthUrl, completeRelayAuth } = require("./services/gmailRelayAuth");
const { loadRefreshToken } = require("./config/relayTokenStore");
const { getReportedUsage, saveReportedUsage } = require("./config/reportedUsageStore");
const { getUsageHistory, appendUsageHistory, pruneAllAccountsHistory } = require("./config/usageHistoryStore");
const { summarizeAccountAnalytics, summarizeTeamAnalytics } = require("./services/usageAnalytics");
const { msUntilNextTopOfHour } = require("./services/hourlyScheduler");
const { handleAccessRequest, retrySigninLinkCheck } = require("./requestAccessHandler");
const { buildAuthUrl, setupForwardingFilter } = require("./services/gmailFilterAutomation");
const { buildInstallScript } = require("./services/installHookScriptBuilder");
const { buildDashboardHtml } = require("./services/dashboardPageBuilder");
const { buildAdminDevicesHtml } = require("./services/adminDevicesPageBuilder");
const { buildDeviceConsumptionRows } = require("./services/deviceConsumptionBuilder");
const { buildPersonUsageRows } = require("./services/personUsageBuilder");
const { buildRecentLogEntries } = require("./services/recentLogsBuilder");
const { buildOnboardingMessage } = require("./services/onboardingMessageBuilder");
const { createSessionStore, safeCompare } = require("./services/adminSessionStore");
const { parseCookies } = require("./services/cookieHelper");
const { loadAccounts } = require("./config/loadAccounts");
const { addAccount, removeAccount } = require("./config/accountsStore");
const {
  findKnownRequesterByEmail,
  loadKnownRequesters,
  addKnownRequester,
  removeKnownRequester,
} = require("./config/knownRequestersStore");
const { buildRequestAccessPageHtml, buildRequestResultPageHtml } = require("./services/requestAccessPageBuilder");
const { buildTeamLoginPageHtml } = require("./services/teamLoginPageBuilder");
const { buildAdminLoginPageHtml } = require("./services/adminLoginPageBuilder");
const { buildAdminRosterPageHtml } = require("./services/adminRosterPageBuilder");

const PORT = process.env.PORT || 8090;
const BASE_PATH = "/claude-usage-bot";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://your-domain.example.com";
const GOOGLE_CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK_URL || "";
// Where each person's individual forwarding filter sends copies of their
// Claude sign-in emails. Just an address now — no domain-wide delegation,
// no service account key. Whoever completes /setup-relay-mailbox owns it.
const GMAIL_RELAY_EMAIL = process.env.GMAIL_RELAY_EMAIL || "claude-relay@example.com";
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const OAUTH_REDIRECT_URI = `${PUBLIC_BASE_URL}${BASE_PATH}/oauth/callback`;
const RELAY_OAUTH_REDIRECT_URI = `${PUBLIC_BASE_URL}${BASE_PATH}/relay-oauth/callback`;
// Gates the device-consumption table and account removal to one person.
// In-memory session store (see adminSessionStore.js) -- no DB, consistent
// with the rest of this project; a process restart just requires
// re-entering the passkey, an acceptable tradeoff for a single-admin
// internal gate. If ADMIN_PASSKEY isn't configured, these routes refuse
// every login attempt rather than silently allowing access.
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || "";
const ADMIN_COOKIE_NAME = "cub_admin";
const adminSessions = createSessionStore();

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (adminSessions.isValid(cookies[ADMIN_COOKIE_NAME])) {
    return next();
  }
  const returnTo = encodeURIComponent(req.originalUrl);
  return res.redirect(`${BASE_PATH}/admin?returnTo=${returnTo}`);
}

// Separate, deliberately lower-stakes gate on /dashboard itself — a
// shared password the whole team knows (not a per-person secret like
// ADMIN_PASSKEY), just enough to keep it off random link-sharing/search.
// Like ADMIN_PASSKEY, the value lives only in TEAM_PASSWORD (server env),
// never hardcoded in source — required for the public/open-source fork of
// this repo to stay clean of any real value.
const TEAM_PASSWORD = process.env.TEAM_PASSWORD || "";
const TEAM_COOKIE_NAME = "cub_team";
const teamSessions = createSessionStore();

function requireTeamPassword(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (teamSessions.isValid(cookies[TEAM_COOKIE_NAME])) {
    return next();
  }
  return res.status(200).send(buildTeamLoginPageHtml(BASE_PATH, req.originalUrl));
}

// Drives the outbound "sign in with Google, let us create a Gmail filter
// for you" consent flow — needs clientId/clientSecret/redirectUri.
const filterOAuthClient = new OAuth2Client(
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI
);

// Same clientId/secret, different redirectUri — drives the one-time
// "authorize the relay mailbox for reading" consent. Kept separate from
// filterOAuthClient because each OAuth2Client instance is bound to one
// redirect_uri.
const relayOAuthClient = new OAuth2Client(
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  RELAY_OAUTH_REDIRECT_URI
);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const app = express();
// Chat/form payloads here are small — cap body size to keep memory bounded
// on a small shared box.
app.use(bodyParser.json({ limit: "256kb" }));
app.use(bodyParser.urlencoded({ extended: false, limit: "256kb" }));

// Plain health check, no auth — used to confirm the process + Apache proxy
// are wired correctly.
app.get(`${BASE_PATH}/health`, (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Shared by the on-demand route and the 30-min auto-push timer below —
// same report, same webhook post, one place to keep them in sync.
async function postUsageReportNow() {
  const accounts = loadAccounts();
  const results = composeUsageResults(accounts, getReportedUsage);
  const message = buildUsageReportCardMessage(
    results,
    `${PUBLIC_BASE_URL}${BASE_PATH}/request`,
    `${PUBLIC_BASE_URL}${BASE_PATH}/dashboard`,
    TEAM_PASSWORD
  );
  return postMessageToGoogleChat(message, GOOGLE_CHAT_WEBHOOK_URL, axios);
}

// On-demand: anyone with the link can trigger a fresh report right now, in
// addition to the automatic 30-min push below — both post the same way,
// neither returns the report directly in the HTTP response, so this link
// works the same whether opened by a person or hit by any other client.
app.get(`${BASE_PATH}/usage-now`, async (req, res) => {
  try {
    const posted = await postUsageReportNow();
    if (!posted) {
      return res.status(502).send("Couldn't post the usage report to Google Chat. Check server logs.");
    }
    return res.status(200).send("Usage report posted to Google Chat.");
  } catch (err) {
    logger.error("Unhandled error in /usage-now:", err.message);
    return res.status(500).send("Something went wrong generating the usage report.");
  }
});

// Full analytics view — same data as the Chat card, but with the complete
// per-device breakdown the card only summarizes (a device count and a
// warning banner, not the actual device list). Plain server-rendered HTML,
// no client JS beyond a 60s meta-refresh, so it stays cheap under this
// service's memory/CPU caps. See dashboardPageBuilder.js.
app.get(`${BASE_PATH}/dashboard`, requireTeamPassword, (req, res) => {
  const accounts = loadAccounts();
  const results = composeUsageResults(accounts, getReportedUsage);

  const perAccountAnalytics = accounts.map((account) => ({
    name: account.name,
    analytics: summarizeAccountAnalytics(getUsageHistory(account.name)),
  }));
  const analyticsByName = Object.fromEntries(perAccountAnalytics.map((a) => [a.name, a.analytics]));
  const teamAnalytics = summarizeTeamAnalytics(perAccountAnalytics);
  const recentLogs = buildRecentLogEntries(accounts, getUsageHistory);
  const installHookUrl = `${PUBLIC_BASE_URL}${BASE_PATH}/install-hook.sh`;
  const dashboardUrl = `${PUBLIC_BASE_URL}${BASE_PATH}/dashboard`;

  const html = buildDashboardHtml({
    results,
    analyticsByName,
    teamAnalytics,
    accounts,
    recentLogs,
    urls: {
      basePath: BASE_PATH,
      installHookUrl,
      requestBaseUrl: `${PUBLIC_BASE_URL}${BASE_PATH}/request`,
    },
    onboardingMessage: buildOnboardingMessage(installHookUrl, dashboardUrl, TEAM_PASSWORD),
  });

  res.status(200).type("text/html").send(html);
});

app.post(`${BASE_PATH}/dashboard-login`, (req, res) => {
  const password = (req.body && req.body.password) || "";
  const returnTo = (req.body && req.body.returnTo) || `${BASE_PATH}/dashboard`;

  if (!TEAM_PASSWORD || !safeCompare(password, TEAM_PASSWORD)) {
    return res.status(200).send(buildTeamLoginPageHtml(BASE_PATH, returnTo, true));
  }

  const token = teamSessions.createSession();
  res.cookie(TEAM_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — a shared team password is meant to be a one-time thing per device, not re-typed constantly
  });
  return res.redirect(returnTo);
});

// Passkey gate for the device-consumption table and account removal —
// see requireAdmin above. Plain form, not a JS confirm-style flow.
app.get(`${BASE_PATH}/admin`, (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const returnTo = req.query.returnTo || `${BASE_PATH}/admin/devices`;
  if (adminSessions.isValid(cookies[ADMIN_COOKIE_NAME])) {
    return res.redirect(returnTo);
  }

  res.status(200).send(buildAdminLoginPageHtml(BASE_PATH, returnTo));
});

app.post(`${BASE_PATH}/admin`, (req, res) => {
  const passkey = (req.body && req.body.passkey) || "";
  const returnTo = (req.body && req.body.returnTo) || `${BASE_PATH}/admin/devices`;

  if (!ADMIN_PASSKEY || !safeCompare(passkey, ADMIN_PASSKEY)) {
    return res.status(401).send(buildAdminLoginPageHtml(BASE_PATH, returnTo, true));
  }

  const token = adminSessions.createSession();
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 12 * 60 * 60 * 1000,
  });
  return res.redirect(returnTo);
});

// The device-consumption table itself — who's using which physical
// machine, across every account, not just per-account. Kept off the
// public dashboard entirely, per the explicit ask that this (and account
// removal) be restricted to one person.
app.get(`${BASE_PATH}/admin/devices`, requireAdmin, (req, res) => {
  const accounts = loadAccounts();
  const rows = buildDeviceConsumptionRows(accounts, getReportedUsage, getUsageHistory);
  const personRows = buildPersonUsageRows(accounts, getReportedUsage, getUsageHistory);
  res.status(200).type("text/html").send(buildAdminDevicesHtml(rows, personRows));
});

// Roster management for /request's email validation (knownRequestersStore.js)
// — who's allowed to type their email and have it accepted as a real
// requester. Passkey-gated like the rest of /admin/*: this list controls
// who can trigger the relay flow, so it shouldn't be publicly editable.
app.get(`${BASE_PATH}/admin/roster`, requireAdmin, (req, res) => {
  const roster = loadKnownRequesters();
  res.status(200).send(buildAdminRosterPageHtml(roster, BASE_PATH));
});

app.post(`${BASE_PATH}/admin/roster`, requireAdmin, (req, res) => {
  const name = (req.body && req.body.name) || "";
  const email = (req.body && req.body.email) || "";
  const result = addKnownRequester({ name, email });
  if (!result.ok) {
    return res.status(409).send(buildAdminRosterPageHtml(loadKnownRequesters(), BASE_PATH, result.errorMessage));
  }
  return res.redirect(`${BASE_PATH}/admin/roster`);
});

app.post(`${BASE_PATH}/admin/roster/remove`, requireAdmin, (req, res) => {
  const email = (req.body && req.body.email) || "";
  const result = removeKnownRequester(email);
  if (!result.ok) {
    return res.status(404).send(buildAdminRosterPageHtml(loadKnownRequesters(), BASE_PATH, result.errorMessage));
  }
  return res.redirect(`${BASE_PATH}/admin/roster`);
});

// Automatic push once an hour, aligned to the top of the IST clock hour
// (e.g. 3:00 PM, 4:00 PM — "even time" as requested) — not 30 min from
// whenever the process happened to restart. Matches the 1-hour
// device-activity window (deviceActivity.js) so "N devices active in the
// last 1 hour" is exactly the span between one scheduled push and the
// next, not an arbitrary/unrelated number. See hourlyScheduler.js for why
// this is computed in IST specifically rather than the server's own
// (likely UTC) system timezone.
// setTimeout to the next top-of-hour, then setInterval every hour from
// there — no new dependency (e.g. node-cron) needed for this.
const AUTO_PUSH_INTERVAL_MS = 60 * 60 * 1000;

// Piggybacks the usage-history cleanup (drop entries older than 2 days —
// see usageHistoryStore.js's MAX_AGE_MS) onto this same hourly tick rather
// than running a second timer for it — the log data is unnecessary past
// that window, and this is a natural, already-scheduled place to sweep it.
function runHourlyTick() {
  postUsageReportNow().catch((err) => {
    logger.error("Scheduled usage report post failed:", err.message);
  });
  const pruneResult = pruneAllAccountsHistory();
  if (!pruneResult.ok) {
    logger.error("Scheduled usage history prune failed:", pruneResult.errorMessage);
  }
}

function scheduleHourlyAutoPush() {
  const delay = msUntilNextTopOfHour();
  setTimeout(() => {
    runHourlyTick();
    setInterval(runHourlyTick, AUTO_PUSH_INTERVAL_MS);
  }, delay);
}
scheduleHourlyAutoPush();

// /chat-command was re-tried here after fixing the TLS cert, the OAuth
// consent screen, and moving to a fresh Cloud project — all plausible
// causes of the original failure. Retested live: still zero requests from
// Google's Chat-dispatch client reached this server (confirmed via the
// access log during a live /usage attempt — only this process's own
// manual test curl showed up). Two independent failures with every fixable
// cause addressed in between means this is settled, not still-debuggable
// from our side. Removed again rather than left as a red herring; the
// on-demand-link flow (usage-now, add-account, request, install-hook)
// is the supported path.

// Self-service account onboarding — no oauthToken needed anymore (that was
// only for live usage percentages, dropped after confirming `claude
// setup-token` can't get the required OAuth scope). Just name, contact,
// and the login email registered with their Claude account.
app.get(`${BASE_PATH}/add-account`, (req, res) => {
  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Add a Claude account</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto;">
  <h2>Add a Claude account</h2>
  <form method="POST" action="${BASE_PATH}/add-account">
    <label>Name:<br/>
      <input type="text" name="name" required style="width: 100%; padding: 8px; margin: 8px 0;" />
    </label><br/>
    <label>Contact (Slack handle or email):<br/>
      <input type="text" name="contact" required style="width: 100%; padding: 8px; margin: 8px 0;" />
    </label><br/>
    <label>Login email (registered with their Claude account):<br/>
      <input type="email" name="loginEmail" required style="width: 100%; padding: 8px; margin: 8px 0;" />
    </label>
    <button type="submit" style="padding: 8px 16px; margin-top: 8px;">Add account</button>
  </form>
</body></html>`);
});

app.post(`${BASE_PATH}/add-account`, (req, res) => {
  const name = (req.body && req.body.name || "").trim();
  const contact = (req.body && req.body.contact || "").trim();
  const loginEmail = (req.body && req.body.loginEmail || "").trim();

  if (!name || !contact || !loginEmail) {
    return res.status(400).send("Missing name, contact, or loginEmail.");
  }

  const result = addAccount({ name, contact, loginEmail });
  if (!result.ok) {
    return res.status(409).send(result.errorMessage);
  }

  const installHookUrl = `${PUBLIC_BASE_URL}${BASE_PATH}/install-hook`;
  return res
    .status(200)
    .send(`Added ${escapeHtml(name)}. Two things left for real usage numbers + request-access to work: (1) set up email forwarding — manual steps, or <a href="${BASE_PATH}/setup-forwarding">/setup-forwarding</a>; (2) install the usage-reporting hook (same one link for everyone): <a href="${installHookUrl}">${installHookUrl}</a>`);
});

// Confirm-then-act, same pattern as elsewhere on this site (e.g. /request) —
// a plain landing page instead of a JS confirm() dialog, so removal is a
// deliberate second click, not a one-click destructive GET.
app.get(`${BASE_PATH}/remove-account`, requireAdmin, (req, res) => {
  const name = req.query.name || "";
  if (!name) {
    return res.status(400).send("Missing ?name=<account>.");
  }

  const accounts = loadAccounts();
  const account = accounts.find((a) => a.name === name);
  if (!account) {
    return res.status(404).send(`No account named "${name}" is configured.`);
  }

  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Remove Claude account</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto;">
  <h2>Remove ${escapeHtml(account.name)}?</h2>
  <p>This only removes ${escapeHtml(account.name)} from the configured accounts list — it stops showing up on the dashboard and in Chat reports. Their past usage history is left alone.</p>
  <form method="POST" action="${BASE_PATH}/remove-account">
    <input type="hidden" name="name" value="${escapeHtml(account.name)}" />
    <button type="submit" style="padding: 8px 16px; background:#d93025; color:#fff; border:none; border-radius:4px;">Remove ${escapeHtml(account.name)}</button>
    <a href="${BASE_PATH}/dashboard" style="margin-left: 12px;">Cancel</a>
  </form>
</body></html>`);
});

app.post(`${BASE_PATH}/remove-account`, requireAdmin, (req, res) => {
  const name = (req.body && req.body.name) || "";
  if (!name) {
    return res.status(400).send("Missing name.");
  }

  const result = removeAccount(name);
  if (!result.ok) {
    return res.status(404).send(result.errorMessage);
  }

  return res
    .status(200)
    .send(`Removed ${escapeHtml(name)}. <a href="${BASE_PATH}/dashboard">Back to dashboard</a>`);
});

// Receives usage reports from each person's local Claude Code hook (see
// installHookScriptBuilder.js). The hook never sends a token — only the
// derived percentages, computed locally on their own machine from their
// own Keychain-held token. No auth on this endpoint beyond accountName
// matching a configured account: there's no secret to protect here, only
// numbers, and it's fronted by the same Apache layer as everything else.
app.post(`${BASE_PATH}/report-usage`, (req, res) => {
  const accounts = loadAccounts();
  const result = processUsageReport(req.body, accounts, saveReportedUsage, appendUsageHistory);

  if (!result.ok) {
    return res.status(400).send(result.errorMessage);
  }
  return res.status(200).send("ok");
});

// Landing page explaining the hook + the one-line install command. One
// universal script for everyone now — not personalized by ?account=. The
// script self-identifies via Anthropic's /api/oauth/profile on every report
// (whichever account is actually logged in locally at that moment), so the
// same link works for anyone and stays correct even if someone logs into a
// teammate's account on a shared machine. See installHookScriptBuilder.js.
app.get(`${BASE_PATH}/install-hook`, (req, res) => {
  const scriptUrl = `${PUBLIC_BASE_URL}${BASE_PATH}/install-hook.sh`;

  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Install Claude usage reporting</title></head>
<body style="font-family: sans-serif; max-width: 560px; margin: 40px auto;">
  <h2>Report live Claude usage</h2>
  <p>This installs a small script that runs automatically every time you use Claude Code (via its built-in <code>Stop</code> hook). It reads your usage <strong>locally, on your own machine</strong>, and sends us only the resulting percentages plus your account's login email (so we know whose numbers they are, correctly, even if you're logged into a teammate's account at the time) — <strong>never your token</strong>.</p>
  <p>Same link for everyone. Run this once in Terminal:</p>
  <pre style="background:#f4f4f4; padding: 12px; overflow-x: auto;"><code>curl -sL "${scriptUrl}" | bash</code></pre>
  <p>Prefer to read it first? <a href="${scriptUrl}" target="_blank" rel="noopener">View the script</a> before running it, or download with <code>curl -o install.sh "${scriptUrl}"</code> and inspect before <code>bash install.sh</code>.</p>
  <p>Safe to run again anytime — it won't install the hook twice, and re-running it also picks up any fixes we've since made to the script.</p>
</body></html>`);
});

// The actual install script — universal, same bytes for everyone.
app.get(`${BASE_PATH}/install-hook.sh`, (req, res) => {
  const reportUrl = `${PUBLIC_BASE_URL}${BASE_PATH}/report-usage`;
  const script = buildInstallScript(reportUrl);
  res.status(200).type("text/plain").send(script);
});

// GET: landing page. Shows the target's login email + a direct claude.ai
// login link, because the requester triggers the sign-in email themselves —
// Anthropic's sign-in page sits behind Cloudflare bot protection that
// blocks any scripted trigger attempt (confirmed live, not a guess), but
// never blocks a real human typing an email into it. The requester enters
// the *target's* email there; Claude doesn't verify who's asking, only
// where to send the link. Confirm below starts the relay watch.
app.get(`${BASE_PATH}/request`, (req, res) => {
  const accountName = req.query.account || "";
  if (!accountName) {
    return res.status(400).send("Missing ?account=<name> in the URL.");
  }

  const accounts = loadAccounts();
  const account = accounts.find((a) => a.name === accountName);
  if (!account) {
    return res.status(404).send(`No account named "${accountName}" is configured.`);
  }

  res.status(200).send(buildRequestAccessPageHtml(account, BASE_PATH));
});

// POST: does the real work — see requestAccessHandler.js for the orchestration.
// requesterEmail is validated against the known-requesters roster
// (knownRequestersStore.js) rather than trusting free-typed text — Chat's
// openLink buttons carry no identity of who clicked, so this is the
// closest we get to "not just anyone typing anything" without wiring up
// real Google Sign-In (a heavier option, deliberately not chosen here).
app.post(`${BASE_PATH}/request`, async (req, res) => {
  const accountName = (req.body && req.body.account) || "";
  const requesterEmail = (req.body && req.body.requesterEmail) || "";
  // Stamped once, right when this request starts, and carried through the
  // result page's hidden field into any later /request/retry click -- the
  // 10-minute retry window (see requestAccessHandler.js's RETRY_WINDOW_MS)
  // anchors to THIS moment, not to whenever someone happens to click retry.
  const requestedAtMs = Date.now();

  if (!accountName || !requesterEmail) {
    return res.status(400).send("Missing account or requesterEmail.");
  }

  const accounts = loadAccounts();
  const account = accounts.find((a) => a.name === accountName);
  if (!account) {
    return res.status(404).send(`No account named "${accountName}" is configured.`);
  }

  const requester = findKnownRequesterByEmail(requesterEmail);
  if (!requester) {
    return res
      .status(403)
      .send(
        buildRequestAccessPageHtml(account, BASE_PATH, {
          errorMessage: `"${requesterEmail}" isn't on the known team roster — double-check the email and try again.`,
          prefillEmail: requesterEmail,
        })
      );
  }

  const refreshToken = loadRefreshToken();
  const authClient = refreshToken
    ? buildRelayAuthClient(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, refreshToken)
    : null;

  const result = await handleAccessRequest(
    { accountName, requesterName: requester.name },
    accounts,
    {
      tryAcquireLock,
      releaseLock,
      postToGoogleChat,
      waitForSigninLink,
      authClient,
      httpClient: axios,
      webhookUrl: GOOGLE_CHAT_WEBHOOK_URL,
      nowFn: () => requestedAtMs,
    }
  );

  return res
    .status(result.ok ? 200 : 409)
    .send(buildRequestResultPageHtml(account, BASE_PATH, result, requesterEmail, requestedAtMs));
});

// POST: backs the "Check again" button on the failure result page above --
// a single, immediate recheck of the relay inbox (see
// requestAccessHandler.js's retrySigninLinkCheck), not another full
// wait-and-poll cycle. Same roster validation as /request since it's a
// fresh POST, not a continuation of any session.
app.post(`${BASE_PATH}/request/retry`, async (req, res) => {
  const accountName = (req.body && req.body.account) || "";
  const requesterEmail = (req.body && req.body.requesterEmail) || "";
  // Empty string / missing means an older result page with no expiry
  // concept (or a manually-crafted request) -- treated as "no deadline"
  // by retrySigninLinkCheck, same as omitting it entirely.
  const requestedAtRaw = req.body && req.body.requestedAt;
  const requestedAtMs = requestedAtRaw ? Number(requestedAtRaw) : undefined;

  if (!accountName || !requesterEmail) {
    return res.status(400).send("Missing account or requesterEmail.");
  }

  const accounts = loadAccounts();
  const account = accounts.find((a) => a.name === accountName);
  if (!account) {
    return res.status(404).send(`No account named "${accountName}" is configured.`);
  }

  const requester = findKnownRequesterByEmail(requesterEmail);
  if (!requester) {
    return res
      .status(403)
      .send(
        buildRequestAccessPageHtml(account, BASE_PATH, {
          errorMessage: `"${requesterEmail}" isn't on the known team roster — double-check the email and try again.`,
          prefillEmail: requesterEmail,
        })
      );
  }

  const refreshToken = loadRefreshToken();
  const authClient = refreshToken
    ? buildRelayAuthClient(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, refreshToken)
    : null;

  const result = await retrySigninLinkCheck(
    { accountName, requesterName: requester.name, requestedAtMs },
    accounts,
    {
      authClient,
      findLatestSigninEmail,
      postToGoogleChat,
      httpClient: axios,
      webhookUrl: GOOGLE_CHAT_WEBHOOK_URL,
    }
  );

  return res
    .status(result.ok ? 200 : 409)
    .send(buildRequestResultPageHtml(account, BASE_PATH, result, requesterEmail, requestedAtMs));
});

// One-click relay-mailbox authorization — the relay mailbox owner visits
// this once, signs in as that mailbox, clicks Allow. Standard personal
// OAuth consent, no Workspace admin involved anywhere in this path. This
// grants read access to real mail content (gmail.readonly) — more
// sensitive than the filter-setup flow above, so explain it clearly:
// intended for the dedicated relay mailbox only, never a real inbox.
app.get(`${BASE_PATH}/setup-relay-mailbox`, (req, res) => {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    return res.status(500).send("OAuth client isn't configured yet.");
  }

  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Authorize the Claude relay mailbox</title></head>
<body style="font-family: sans-serif; max-width: 520px; margin: 40px auto;">
  <h2>Authorize the Claude relay mailbox</h2>
  <p><strong>Only continue if you're signed into the dedicated relay mailbox</strong> (currently <code>${escapeHtml(GMAIL_RELAY_EMAIL)}</code>) — not your personal or work Gmail. This grants read access to whatever mailbox you're logged into when you click Allow.</p>
  <ul>
    <li><strong>Access requested:</strong> read-only access to this mailbox's mail (<code>gmail.readonly</code>).</li>
    <li><strong>What we do with it:</strong> search for emails from <code>mail.anthropic.com</code> with a Claude sign-in link, extract the link, and post it to the group. Nothing else in this mailbox is read, stored, or sent anywhere.</li>
    <li><strong>Why this needs read access</strong> (unlike the filter setup, which only needs settings access): we have to open the forwarded email to find the sign-in link inside it.</li>
  </ul>
  <p>Review or revoke at any time at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</p>
  <a href="${BASE_PATH}/setup-relay-mailbox/continue" style="display:inline-block; padding: 8px 16px; background:#1a73e8; color:#fff; text-decoration:none; border-radius:4px;">Continue to Google</a>
</body></html>`);
});

app.get(`${BASE_PATH}/setup-relay-mailbox/continue`, (req, res) => {
  const authUrl = buildRelayAuthUrl(relayOAuthClient, "claude-usage-bot-relay-setup");
  return res.redirect(authUrl);
});

app.get(`${BASE_PATH}/relay-oauth/callback`, async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  const result = await completeRelayAuth(relayOAuthClient, code);

  if (result.ok) {
    return res
      .status(200)
      .send(`Done — this mailbox is now authorized as the relay for Claude sign-in links. Have each account owner forward their Claude sign-in emails here (${GMAIL_RELAY_EMAIL}) via the manual filter steps or /claude-usage-bot/setup-forwarding.`);
  }

  logger.error("relay-oauth/callback failed:", result.errorMessage);
  return res.status(500).send(`Something went wrong: ${result.errorMessage}`);
});

// One-click alternative to the manual Gmail filter setup: redirect to
// Google's consent screen requesting only gmail.settings.basic (not mailbox
// read access) — least-privilege for what this needs. Shows what's being
// asked for and why *before* the Google redirect — Google's own consent
// screen will list the scopes too, but people shouldn't have to trust that
// screen alone to know what an internal tool wants from their account.
app.get(`${BASE_PATH}/setup-forwarding`, (req, res) => {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    return res
      .status(500)
      .send("Automated setup isn't configured yet — use the manual filter steps instead.");
  }

  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Set up Claude email forwarding</title></head>
<body style="font-family: sans-serif; max-width: 520px; margin: 40px auto;">
  <h2>Set up Claude sign-in email forwarding</h2>
  <p>Clicking continue takes you to Google's own sign-in and permission screen. What it will ask for, and exactly what we do with it:</p>
  <ul>
    <li><strong>Access requested:</strong> Gmail <em>settings</em> only (filters, forwarding addresses) — never your email content. We cannot read, search, or see any of your actual emails with this permission.</li>
    <li><strong>What we create:</strong> exactly one filter — "emails from <code>mail.anthropic.com</code> get forwarded to <code>${escapeHtml(GMAIL_RELAY_EMAIL)}</code>." Nothing else on your account is touched.</li>
    <li><strong>Why:</strong> so a copy of your Claude sign-in link can be relayed into the group when someone requests access to your account — the same thing the manual Gmail filter steps do, just automated.</li>
  </ul>
  <p>You can review or revoke this at any time at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</p>
  <a href="${BASE_PATH}/setup-forwarding/continue" style="display:inline-block; padding: 8px 16px; background:#1a73e8; color:#fff; text-decoration:none; border-radius:4px;">Continue to Google</a>
</body></html>`);
});

app.get(`${BASE_PATH}/setup-forwarding/continue`, (req, res) => {
  const authUrl = buildAuthUrl(filterOAuthClient, "claude-usage-bot-setup");
  return res.redirect(authUrl);
});

app.get(`${BASE_PATH}/oauth/callback`, async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  const result = await setupForwardingFilter(filterOAuthClient, code, GMAIL_RELAY_EMAIL, axios);

  if (result.ok) {
    return res
      .status(200)
      .send("Done — your Claude sign-in emails will now be forwarded automatically. No further action needed.");
  }

  if (result.stage === "pending-verification") {
    return res.status(200).send(result.message);
  }

  logger.error(`setup-forwarding failed at stage=${result.stage}:`, result.errorMessage);
  return res
    .status(500)
    .send("Something went wrong setting this up automatically — use the manual filter steps instead.");
});

app.listen(PORT, "127.0.0.1", () => {
  logger.info(`claude-usage-bot listening on 127.0.0.1:${PORT}${BASE_PATH}`);
});
