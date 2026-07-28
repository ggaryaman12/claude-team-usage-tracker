const { buildAuthUrl, setupForwardingFilter } = require("./gmailFilterAutomation");

describe("buildAuthUrl", () => {
  test("requests the gmail.settings.basic scope with offline access and the given state", () => {
    const oAuth2Client = { generateAuthUrl: jest.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth?...") };

    const url = buildAuthUrl(oAuth2Client, "nonce-123");

    expect(url).toBe("https://accounts.google.com/o/oauth2/auth?...");
    expect(oAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.settings.basic",
        "https://www.googleapis.com/auth/gmail.settings.sharing",
      ],
      state: "nonce-123",
      prompt: "consent",
    });
  });
});

describe("setupForwardingFilter", () => {
  const relayEmail = "claude-relay@example.com";

  function oAuthClientWith(token) {
    return { getToken: jest.fn().mockResolvedValue({ tokens: { access_token: token } }) };
  }

  test("creates the filter immediately when forwarding is already accepted", async () => {
    const oAuth2Client = oAuthClientWith("tok");
    const httpClient = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ data: { verificationStatus: "accepted" } }) // forwardingAddresses create
        .mockResolvedValueOnce({ data: {} }), // filters create
      get: jest.fn(),
    };

    const result = await setupForwardingFilter(oAuth2Client, "auth-code", relayEmail, httpClient);

    expect(result).toEqual({ ok: true });
    expect(httpClient.post).toHaveBeenNthCalledWith(
      2,
      "https://gmail.googleapis.com/gmail/v1/users/me/settings/filters",
      { criteria: { from: "mail.anthropic.com" }, action: { forward: relayEmail } },
      { headers: { Authorization: "Bearer tok", "content-type": "application/json" } }
    );
  });

  test("returns pending-verification without creating a filter when not yet accepted", async () => {
    const oAuth2Client = oAuthClientWith("tok");
    const httpClient = {
      post: jest.fn().mockResolvedValueOnce({ data: { verificationStatus: "pending" } }),
      get: jest.fn(),
    };

    const result = await setupForwardingFilter(oAuth2Client, "auth-code", relayEmail, httpClient);

    expect(result.ok).toBe(false);
    expect(result.stage).toBe("pending-verification");
    expect(result.message).toContain(relayEmail);
    // Only the forwardingAddresses call — filter creation must not have been attempted.
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  test("falls back to GET lookup when the forwarding address already exists (create rejects)", async () => {
    const oAuth2Client = oAuthClientWith("tok");
    const httpClient = {
      post: jest.fn().mockRejectedValueOnce(new Error("409 already exists")),
      get: jest.fn().mockResolvedValueOnce({ data: { verificationStatus: "accepted" } }),
    };
    // second post call (filter creation) should still happen since status is accepted
    httpClient.post.mockResolvedValueOnce({ data: {} });

    const result = await setupForwardingFilter(oAuth2Client, "auth-code", relayEmail, httpClient);

    expect(result).toEqual({ ok: true });
    expect(httpClient.get).toHaveBeenCalledWith(
      `https://gmail.googleapis.com/gmail/v1/users/me/settings/forwardingAddresses/${encodeURIComponent(relayEmail)}`,
      { headers: { Authorization: "Bearer tok", "content-type": "application/json" } }
    );
  });

  test("returns ok:false when the token exchange itself fails", async () => {
    const oAuth2Client = { getToken: jest.fn().mockRejectedValue(new Error("invalid_grant")) };
    const httpClient = { post: jest.fn(), get: jest.fn() };

    const result = await setupForwardingFilter(oAuth2Client, "bad-code", relayEmail, httpClient);

    expect(result).toEqual({ ok: false, stage: "auth", errorMessage: "invalid_grant" });
    expect(httpClient.post).not.toHaveBeenCalled();
  });
});
