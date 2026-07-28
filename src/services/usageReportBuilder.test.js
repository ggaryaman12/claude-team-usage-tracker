const { buildUsageReportText } = require("./usageReportBuilder");

const BASE = "https://your-domain.example.com/claude-usage-bot/request";

describe("buildUsageReportText", () => {
  test("lists every configured account with a request-access link", () => {
    const accounts = [
      { name: "Alice", contact: "@alice" },
      { name: "Bob", contact: "bob@example.com" },
    ];

    const text = buildUsageReportText(accounts, BASE);

    expect(text).toContain(`• Alice (@alice) — Request access: ${BASE}?account=Alice`);
    expect(text).toContain(`• Bob (bob@example.com) — Request access: ${BASE}?account=Bob`);
  });

  test("URL-encodes account names with spaces", () => {
    const accounts = [{ name: "Alice Example", contact: "@alice" }];
    const text = buildUsageReportText(accounts, BASE);
    expect(text).toContain(`${BASE}?account=Alice%20Example`);
  });

  test("returns a friendly message for an empty list", () => {
    expect(buildUsageReportText([], BASE)).toBe("No Claude accounts configured.");
  });
});
