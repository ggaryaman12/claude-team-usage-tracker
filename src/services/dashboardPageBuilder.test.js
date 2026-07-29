const { buildDashboardHtml } = require("./dashboardPageBuilder");

const GENERATED_AT = "2026-07-28T08:00:00.000Z";
const URLS = {
  basePath: "/claude-usage-bot",
  installHookUrl: "https://your-domain.example.com/claude-usage-bot/install-hook.sh",
  requestBaseUrl: "https://your-domain.example.com/claude-usage-bot/request",
};

function build(overrides = {}) {
  return buildDashboardHtml({
    results: [],
    analyticsByName: {},
    teamAnalytics: { hasData: false },
    accounts: [],
    recentLogs: [],
    urls: URLS,
    onboardingMessage: "",
    generatedAtIso: GENERATED_AT,
    ...overrides,
  });
}

describe("buildDashboardHtml", () => {
  test("renders a valid HTML document with a title and the generated timestamp", () => {
    const html = build();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Claude Usage");
    expect(html).toContain("Generated");
  });

  test("renders the tab structure (Overview, Manage, Logs)", () => {
    const html = build();
    expect(html).toContain('data-tab="overview"');
    expect(html).toContain('data-tab="manage"');
    expect(html).toContain('data-tab="logs"');
  });

  test("summary strip counts accounts, fresh reports, active devices, and shared accounts", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        hasReport: true,
        isFresh: true,
        ageMinutes: 2,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        fiveHourResetLabel: "resets in 1h (2:00 PM)",
        sevenDayResetLabel: "resets in 3d (Fri 9:00 AM)",
        status: "available",
        activeCount: 2,
        devices: [
          { deviceId: "a", label: "laptop-a", lastSeenMinutesAgo: 1, isActive: true },
          { deviceId: "b", label: "laptop-b", lastSeenMinutesAgo: 3, isActive: true },
        ],
      },
      { name: "Bob", contact: "@bob", hasReport: false },
    ];

    const html = build({ results });

    expect(html).toMatch(/<div class="summary-stat__value">2<\/div>\s*<div class="summary-stat__label">Accounts configured/);
    expect(html).toMatch(/<div class="summary-stat__value">1<\/div>\s*<div class="summary-stat__label">Reporting fresh data/);
    expect(html).toMatch(/<div class="summary-stat__value">2<\/div>\s*<div class="summary-stat__label">Devices active \(last 1h\)/);
    expect(html).toMatch(/<div class="summary-stat__value">1<\/div>\s*<div class="summary-stat__label">Accounts shared \(last 1h\)/);
  });

  test("shows the multi-device alert banner and device table when 2+ devices are active", () => {
    const results = [
      {
        name: "Bob",
        contact: "@bob",
        hasReport: true,
        isFresh: true,
        ageMinutes: 2,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        fiveHourResetLabel: null,
        sevenDayResetLabel: null,
        status: "available",
        activeCount: 2,
        devices: [
          { deviceId: "a", label: "laptop-a", lastSeenMinutesAgo: 1, isActive: true },
          { deviceId: "b", label: "laptop-b", lastSeenMinutesAgo: 3, isActive: true },
        ],
      },
    ];

    const html = build({ results });

    expect(html).toContain("devices active on this account in the last 1 hour");
    expect(html).toContain('class="account-card account-card--alert"');
    expect(html).toContain("laptop-a");
    expect(html).toContain("laptop-b");
    expect(html).toContain("reset time unknown");
  });

  test("does not show the alert banner for a single active device", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        hasReport: true,
        isFresh: true,
        ageMinutes: 2,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        fiveHourResetLabel: null,
        sevenDayResetLabel: null,
        status: "available",
        activeCount: 1,
        devices: [{ deviceId: "a", label: "laptop-a", lastSeenMinutesAgo: 1, isActive: true }],
      },
    ];

    const html = build({ results });
    expect(html).not.toContain("devices active on this account in the last 1 hour");
    expect(html).not.toContain('class="account-card account-card--alert"');
  });

  test("shows a clear no-report state for an account with no data", () => {
    const results = [{ name: "Charlie", contact: "@charlie", hasReport: false }];
    const html = build({ results });
    expect(html).toContain("No usage reports yet");
    expect(html).toContain("Charlie");
  });

  test("every account card, reported or not, gets a Request Access link", () => {
    const results = [{ name: "Charlie", contact: "@charlie", hasReport: false }];
    const html = build({ results });
    expect(html).toContain(`${URLS.requestBaseUrl}?account=Charlie`);
    expect(html).toContain("Request Access");
  });

  test("HTML-escapes account names and contacts to prevent injection", () => {
    const results = [{ name: "<script>alert(1)</script>", contact: "@x", hasReport: false }];
    const html = build({ results });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("flags an inferred reset explicitly instead of silently showing a bare 0%", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        hasReport: true,
        isFresh: false,
        ageMinutes: 180,
        fiveHourPctUsed: 0,
        sevenDayPctUsed: 45,
        fiveHourWasInferredReset: true,
        fiveHourResetLabel: null,
        sevenDayWasInferredReset: false,
        sevenDayResetLabel: "resets in 2d (Thu 9:00 AM)",
        status: "available",
      },
    ];
    const html = build({ results });
    expect(html).toContain("reset assumed — no report since");
    expect(html).toContain("resets in 2d (Thu 9:00 AM)");
  });

  test("distinguishes 'reset time unknown' (never reported one) from an inferred reset", () => {
    const results = [{ name: "Alice", contact: "@alice", hasReport: true, isFresh: true, ageMinutes: 1, fiveHourPctUsed: 10, sevenDayPctUsed: 5, status: "available" }];
    const html = build({ results });
    expect(html).toContain("reset time unknown");
    expect(html).not.toContain("reset assumed");
  });

  test("shows a 'not enough history' note when an account has no analytics yet", () => {
    const results = [{ name: "Alice", contact: "@alice", hasReport: true, isFresh: true, ageMinutes: 1, fiveHourPctUsed: 10, sevenDayPctUsed: 5, status: "available" }];
    const html = build({ results });
    expect(html).toContain("Not enough history yet");
  });

  test("renders a sparkline + stats line when analytics history is present", () => {
    const results = [{ name: "Alice", contact: "@alice", hasReport: true, isFresh: true, ageMinutes: 1, fiveHourPctUsed: 10, sevenDayPctUsed: 5, status: "available" }];
    const analyticsByName = {
      Alice: {
        hasHistory: true,
        reportCount: 12,
        avgFiveHourPctUsed: 35,
        maxFiveHourPctUsed: 90,
        exhaustedCount: 2,
        distinctDevicesEverSeen: 2,
        reportsLast24h: 5,
        sparklinePoints: [10, 20, 30, 90, 35],
      },
    };

    const html = build({ results, analyticsByName });

    expect(html).toContain("<svg");
    expect(html).toContain("avg 35%");
    expect(html).toContain("peak 90%");
    expect(html).toContain("5 reports today");
    expect(html).toContain("exhausted 2×");
    expect(html).toContain("2 devices ever");
  });

  test("renders the team overview strip only when team analytics has data", () => {
    const results = [{ name: "Alice", contact: "@alice", hasReport: false }];

    const withoutData = build({ results });
    expect(withoutData).not.toContain("Team overview");

    const withData = build({
      results,
      teamAnalytics: { hasData: true, avgFiveHourPctUsedAcrossTeam: 42, totalExhaustedEvents: 3, busiestAccountName: "Bob" },
    });
    expect(withData).toContain("Team overview");
    expect(withData).toContain("42%");
    expect(withData).toContain("Bob");
  });

  test("Manage tab shows the add-account link, install command, onboarding message, and an accounts table", () => {
    const accounts = [{ name: "Alice", contact: "@alice", loginEmail: "alice@example.com" }];
    const html = build({ accounts, onboardingMessage: "Welcome to the team." });

    expect(html).toContain(`${URLS.basePath}/add-account`);
    expect(html).toContain(`curl -sL &quot;${URLS.installHookUrl}&quot; | bash`);
    expect(html).toContain("Welcome to the team.");
    expect(html).toContain("alice@example.com");
    expect(html).toContain(`${URLS.basePath}/remove-account?name=Alice`);
  });

  test("Manage tab links to the passkey-gated device consumption admin page", () => {
    const html = build();
    expect(html).toContain(`${URLS.basePath}/admin/devices`);
  });

  test("Manage tab links to the passkey-gated roster admin page", () => {
    const html = build();
    expect(html).toContain(`${URLS.basePath}/admin/roster`);
  });

  test("Manage tab shows a placeholder row when there are no accounts", () => {
    const html = build({ accounts: [] });
    expect(html).toContain("No accounts configured yet.");
  });

  test("Logs tab renders recent log entries with time, account, and status", () => {
    const recentLogs = [
      {
        accountName: "Alice",
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        status: "available",
        deviceId: "abc123",
        reportedAt: "2026-07-28T08:00:00.000Z",
      },
    ];
    const html = build({ recentLogs });

    expect(html).toContain("Alice");
    expect(html).toContain("40%");
    expect(html).toContain("10%");
    expect(html).toContain("abc123");
  });

  test("Logs tab shows an empty state when there's no history yet", () => {
    const html = build({ recentLogs: [] });
    expect(html).toContain("No usage reports logged yet.");
  });
});
