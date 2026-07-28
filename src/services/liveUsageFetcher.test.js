const { fetchUsageForAccounts } = require("./liveUsageFetcher");

describe("fetchUsageForAccounts", () => {
  const accounts = [
    { name: "Alice", contact: "@alice" },
    { name: "Bob", contact: "@bob" },
  ];

  test("marks accounts with no saved token as hasUsageToken:false, without calling the API", async () => {
    const httpClient = { get: jest.fn() };

    const results = await fetchUsageForAccounts(accounts, {}, httpClient);

    expect(results).toEqual([
      { name: "Alice", contact: "@alice", hasUsageToken: false },
      { name: "Bob", contact: "@bob", hasUsageToken: false },
    ]);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  test("fetches live usage for accounts with a saved token", async () => {
    const httpClient = {
      get: jest.fn().mockResolvedValue({
        data: {
          five_hour: { utilization: 30, resets_at: null },
          seven_day: { utilization: 50, resets_at: null },
        },
      }),
    };
    const tokensByName = { Alice: { accessToken: "sk-ant-oat01-alice", savedAt: "2026-01-01" } };

    const results = await fetchUsageForAccounts(accounts, tokensByName, httpClient);

    expect(results[0]).toMatchObject({
      name: "Alice",
      hasUsageToken: true,
      error: false,
      fiveHourPctUsed: 30,
      sevenDayPctUsed: 50,
    });
    expect(results[1]).toEqual({ name: "Bob", contact: "@bob", hasUsageToken: false });
    expect(httpClient.get).toHaveBeenCalledTimes(1);
    expect(httpClient.get).toHaveBeenCalledWith(
      "https://api.anthropic.com/api/oauth/usage",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-ant-oat01-alice" }),
      })
    );
  });

  test("a stale/invalid token surfaces as an error result, not a crash", async () => {
    const httpClient = { get: jest.fn().mockRejectedValue(new Error("Request failed with status code 401")) };
    const tokensByName = { Alice: { accessToken: "expired-tok", savedAt: "2026-01-01" } };

    const results = await fetchUsageForAccounts([accounts[0]], tokensByName, httpClient);

    expect(results[0]).toEqual({
      name: "Alice",
      contact: "@alice",
      hasUsageToken: true,
      error: true,
      errorMessage: "Request failed with status code 401",
    });
  });
});
