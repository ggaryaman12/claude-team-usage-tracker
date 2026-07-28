const { formatReply } = require("./replyFormatter");

describe("formatReply", () => {
  test("formats a mix of available, low, exhausted, and errored accounts", () => {
    const results = [
      {
        name: "Alice",
        contact: "@alice",
        error: false,
        fiveHourPctUsed: 12,
        fiveHourResetAt: null,
        sevenDayPctUsed: 40,
        sevenDayResetAt: null,
        status: "available",
      },
      {
        name: "Bob",
        contact: "bob@example.com",
        error: false,
        fiveHourPctUsed: 100,
        fiveHourResetAt: "2026-07-01T14:32:00Z",
        sevenDayPctUsed: 61,
        sevenDayResetAt: null,
        status: "exhausted",
      },
      {
        name: "Charlie",
        contact: "@charlie",
        error: true,
        errorMessage: "request timed out",
      },
    ];

    const reply = formatReply(results);

    expect(reply.text).toContain("🟢 Alice — 5hr: 12% used, 7day: 40% used — @alice");
    expect(reply.text).toContain(
      "🔴 Bob — 5hr: 100% used (resets 2026-07-01T14:32:00Z), 7day: 61% used — bob@example.com"
    );
    expect(reply.text).toContain("⚠️ Charlie — fetch failed (request timed out)");
  });

  test("uses yellow warning emoji for low status", () => {
    const results = [
      {
        name: "Dana",
        contact: "@dana",
        error: false,
        fiveHourPctUsed: 85,
        fiveHourResetAt: null,
        sevenDayPctUsed: 20,
        sevenDayResetAt: null,
        status: "low",
      },
    ];

    const reply = formatReply(results);

    expect(reply.text).toContain("🟡 Dana");
  });

  test("returns a friendly message for an empty account list", () => {
    const reply = formatReply([]);
    expect(reply.text).toBe("No Claude accounts configured.");
  });
});
