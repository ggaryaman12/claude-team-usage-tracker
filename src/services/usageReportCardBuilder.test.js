const { buildUsageReportCardMessage } = require("./usageReportCardBuilder");

const BASE = "https://your-domain.example.com/claude-usage-bot/request";

describe("buildUsageReportCardMessage", () => {
  test("returns a plain text fallback for an empty account list", () => {
    expect(buildUsageReportCardMessage([], BASE)).toEqual({
      text: "No Claude accounts configured.",
    });
  });

  test("shows real usage with bars, percentages, and freshness for a fresh report", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        hasReport: true,
        isFresh: true,
        ageMinutes: 3,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        status: "available",
      },
    ];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.topLabel).toBe("Alice");
    expect(decoratedText.bottomLabel).toBe("@alice");
    expect(decoratedText.text).toContain("🟢");
    expect(decoratedText.text).toContain("████░░░░░░ 40%"); // 5hr bar
    expect(decoratedText.text).toContain("█░░░░░░░░░ 10%"); // 7day bar
    expect(decoratedText.text).toContain("as of 3m ago");
    expect(decoratedText.wrapText).toBe(true);
  });

  test("shows reset time labels for both windows when present", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        hasReport: true,
        isFresh: true,
        ageMinutes: 3,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        fiveHourResetLabel: "resets in 1h 12m (2:30 PM)",
        sevenDayResetLabel: "resets in 3d 4h (Fri 9:00 AM)",
        status: "available",
      },
    ];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.text).toContain("resets in 1h 12m (2:30 PM)");
    expect(decoratedText.text).toContain("resets in 3d 4h (Fri 9:00 AM)");
  });

  test("omits reset labels cleanly when not available", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        hasReport: true,
        isFresh: true,
        ageMinutes: 3,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        fiveHourResetLabel: null,
        sevenDayResetLabel: null,
        status: "available",
      },
    ];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.text).not.toContain("resets");
    expect(decoratedText.text).not.toContain("null");
  });

  test("flags 2+ simultaneously active devices on the same account", () => {
    const results = [
      {
        name: "Bob",
        contact: "@bob",
        hasReport: true,
        isFresh: true,
        ageMinutes: 3,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        status: "available",
        activeCount: 2,
      },
    ];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.text).toContain("⚠️ 2 devices active in the last 1 hour");
  });

  test("says nothing about devices when only one is active", () => {
    const results = [
      {
        name: "Bob",
        contact: "@bob",
        hasReport: true,
        isFresh: true,
        ageMinutes: 3,
        fiveHourPctUsed: 40,
        sevenDayPctUsed: 10,
        status: "available",
        activeCount: 1,
      },
    ];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.text).not.toContain("devices active");
  });

  test("shows a stale marker for an old report", () => {
    const results = [
      {
        name: "Bob",
        contact: "@bob",
        hasReport: true,
        isFresh: false,
        ageMinutes: 90,
        fiveHourPctUsed: 50,
        sevenDayPctUsed: 50,
        status: "available",
      },
    ];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.text).toContain("stale, last seen 90m ago");
  });

  test("shows 'no usage reports yet' for an account with no report", () => {
    const results = [{ name: "Charlie", contact: "@charlie", hasReport: false }];

    const message = buildUsageReportCardMessage(results, BASE);
    const decoratedText = message.cardsV2[0].card.sections[0].widgets[0].decoratedText;

    expect(decoratedText.text).toBe("No usage reports yet");
    expect(decoratedText.topLabel).toBe("Charlie");
    expect(decoratedText.bottomLabel).toBe("@charlie");
  });

  test("every row still gets a Request Access button with the correct URL", () => {
    const results = [{ name: "Alice Example", contact: "@alice", hasReport: false }];
    const message = buildUsageReportCardMessage(results, BASE);
    const widget = message.cardsV2[0].card.sections[0].widgets[0];
    expect(widget.decoratedText.button.text).toBe("Request Access");
    expect(widget.decoratedText.button.onClick.openLink.url).toBe(`${BASE}?account=Alice%20Example`);
  });

  test("adds an 'Open full dashboard' button as the first widget when dashboardUrl is given", () => {
    const results = [{ name: "Alice", contact: "@alice", hasReport: false }];
    const dashboardUrl = "https://your-domain.example.com/claude-usage-bot/dashboard";
    const message = buildUsageReportCardMessage(results, BASE, dashboardUrl);
    const widgets = message.cardsV2[0].card.sections[0].widgets;

    expect(widgets[0].buttonList.buttons[0].text).toContain("dashboard");
    expect(widgets[0].buttonList.buttons[0].onClick.openLink.url).toBe(dashboardUrl);
    // account rows still follow, unaffected
    expect(widgets[1].decoratedText.topLabel).toBe("Alice");
  });

  test("omits the dashboard button entirely when dashboardUrl isn't given -- stays backward compatible", () => {
    const results = [{ name: "Alice", contact: "@alice", hasReport: false }];
    const message = buildUsageReportCardMessage(results, BASE);
    const widgets = message.cardsV2[0].card.sections[0].widgets;
    expect(widgets[0].buttonList).toBeUndefined();
    expect(widgets[0].decoratedText.topLabel).toBe("Alice");
  });
});
