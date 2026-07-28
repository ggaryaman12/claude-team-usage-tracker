const { fetchAccountUsage, fetchAllAccountsUsage } = require("./claudeUsageFetcher");

function fakeHttpClient(response) {
  return { get: jest.fn().mockResolvedValue(response) };
}

function fakeHttpClientRejecting(error) {
  return { get: jest.fn().mockRejectedValue(error) };
}

describe("fetchAccountUsage", () => {
  const account = { name: "Alice", contact: "@alice", oauthToken: "sk-ant-oat01-fake" };

  test("parses a successful response into an AccountUsageResult (utilization is already 0-100)", async () => {
    const httpClient = fakeHttpClient({
      data: {
        five_hour: { utilization: 12, resets_at: "2026-07-01T18:00:00Z" },
        seven_day: { utilization: 40, resets_at: "2026-07-05T00:00:00Z" },
      },
    });

    const result = await fetchAccountUsage(account, httpClient);

    expect(result).toEqual({
      name: "Alice",
      contact: "@alice",
      error: false,
      fiveHourPctUsed: 12,
      fiveHourResetAt: "2026-07-01T18:00:00Z",
      sevenDayPctUsed: 40,
      sevenDayResetAt: "2026-07-05T00:00:00Z",
      status: "available",
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      "https://api.anthropic.com/api/oauth/usage",
      {
        headers: {
          Authorization: "Bearer sk-ant-oat01-fake",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
        },
      }
    );
  });

  test("classifies exhausted when five_hour utilization is 100", async () => {
    const httpClient = fakeHttpClient({
      data: {
        five_hour: { utilization: 100, resets_at: "2026-07-01T18:00:00Z" },
        seven_day: { utilization: 50, resets_at: "2026-07-05T00:00:00Z" },
      },
    });

    const result = await fetchAccountUsage(account, httpClient);
    expect(result.status).toBe("exhausted");
  });

  test("returns an error result when the HTTP call rejects", async () => {
    const httpClient = fakeHttpClientRejecting(new Error("request timed out"));

    const result = await fetchAccountUsage(account, httpClient);

    expect(result).toEqual({
      name: "Alice",
      contact: "@alice",
      error: true,
      errorMessage: "request timed out",
    });
  });
});

describe("fetchAllAccountsUsage", () => {
  test("fetches all accounts in parallel and keeps one failure from affecting others", async () => {
    const accounts = [
      { name: "Alice", contact: "@alice", oauthToken: "token-a" },
      { name: "Bob", contact: "@bob", oauthToken: "token-b" },
    ];

    const httpClient = {
      get: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            five_hour: { utilization: 10, resets_at: null },
            seven_day: { utilization: 20, resets_at: null },
          },
        })
        .mockRejectedValueOnce(new Error("boom")),
    };

    const results = await fetchAllAccountsUsage(accounts, httpClient);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: "Alice", error: false, status: "available" });
    expect(results[1]).toMatchObject({ name: "Bob", error: true, errorMessage: "boom" });
  });
});
