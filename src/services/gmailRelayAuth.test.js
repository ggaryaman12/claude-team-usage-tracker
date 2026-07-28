jest.mock("../config/relayTokenStore", () => ({
  saveRefreshToken: jest.fn(),
}));

const { buildRelayAuthUrl, completeRelayAuth } = require("./gmailRelayAuth");
const { saveRefreshToken } = require("../config/relayTokenStore");

describe("buildRelayAuthUrl", () => {
  test("requests gmail.readonly with offline access and consent prompt", () => {
    const oAuth2Client = { generateAuthUrl: jest.fn().mockReturnValue("https://accounts.google.com/auth?x") };

    const url = buildRelayAuthUrl(oAuth2Client, "relay-setup");

    expect(url).toBe("https://accounts.google.com/auth?x");
    expect(oAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
      state: "relay-setup",
      prompt: "consent",
    });
  });
});

describe("completeRelayAuth", () => {
  beforeEach(() => {
    saveRefreshToken.mockClear();
  });

  test("saves the refresh token and returns ok:true on success", async () => {
    const oAuth2Client = {
      getToken: jest.fn().mockResolvedValue({ tokens: { refresh_token: "rt-123", access_token: "at" } }),
    };

    const result = await completeRelayAuth(oAuth2Client, "auth-code");

    expect(result).toEqual({ ok: true });
    expect(saveRefreshToken).toHaveBeenCalledWith("rt-123");
  });

  test("returns ok:false with guidance when no refresh token is returned", async () => {
    const oAuth2Client = {
      getToken: jest.fn().mockResolvedValue({ tokens: { access_token: "at" } }),
    };

    const result = await completeRelayAuth(oAuth2Client, "auth-code");

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("refresh token");
    expect(saveRefreshToken).not.toHaveBeenCalled();
  });

  test("returns ok:false when token exchange fails", async () => {
    const oAuth2Client = { getToken: jest.fn().mockRejectedValue(new Error("invalid_grant")) };

    const result = await completeRelayAuth(oAuth2Client, "bad-code");

    expect(result).toEqual({ ok: false, errorMessage: "invalid_grant" });
    expect(saveRefreshToken).not.toHaveBeenCalled();
  });
});
