const { handleAccessRequest } = require("./requestAccessHandler");

const LOOKBACK_SECONDS = 5 * 60;

const accounts = [
  { name: "Arpit", contact: "@arpit", loginEmail: "arpit@example.com" },
];

function baseDeps(overrides = {}) {
  return {
    tryAcquireLock: jest.fn().mockReturnValue(true),
    releaseLock: jest.fn(),
    postToGoogleChat: jest.fn().mockResolvedValue(true),
    waitForSigninLink: jest.fn().mockResolvedValue({ ok: true, link: "https://claude.ai/x" }),
    authClient: { getAccessToken: jest.fn() },
    httpClient: {},
    webhookUrl: "https://chat.googleapis.com/webhook",
    nowFn: () => 1700000000000,
    ...overrides,
  };
}

describe("handleAccessRequest", () => {
  test("happy path: posts request event, then posts the link tagged to the requester", async () => {
    const deps = baseDeps();

    const result = await handleAccessRequest(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result).toEqual({
      ok: true,
      message: "Request sent — check the group chat for the link.",
      link: "https://claude.ai/x",
    });
    expect(deps.postToGoogleChat).toHaveBeenNthCalledWith(
      1,
      "Aryaman requested access to Arpit's account.",
      deps.webhookUrl,
      deps.httpClient
    );
    expect(deps.postToGoogleChat).toHaveBeenNthCalledWith(
      2,
      "@Aryaman here's the sign-in link for Arpit: https://claude.ai/x",
      deps.webhookUrl,
      deps.httpClient
    );
    expect(deps.waitForSigninLink).toHaveBeenCalledWith({
      authClient: deps.authClient,
      afterEpochSeconds: Math.floor(1700000000000 / 1000) - LOOKBACK_SECONDS,
      recipientEmail: "arpit@example.com",
      httpClient: deps.httpClient,
    });
    expect(deps.releaseLock).toHaveBeenCalledWith("Arpit");
  });

  // Root cause of "bot missed a link that was actually in the inbox": the
  // documented flow has the requester trigger claude.ai's email BEFORE
  // coming back to confirm here, so by confirm-time the email can already
  // be several seconds-to-minutes old. A 5-second backward buffer isn't
  // enough headroom for that gap; this locks in the wider window.
  test("looks back several minutes for the sign-in email, not just a few seconds -- covers triggering it before confirming", async () => {
    const deps = baseDeps();

    await handleAccessRequest({ accountName: "Arpit", requesterName: "Aryaman" }, accounts, deps);

    const callArgs = deps.waitForSigninLink.mock.calls[0][0];
    const lookbackSeconds = Math.floor(1700000000000 / 1000) - callArgs.afterEpochSeconds;
    expect(lookbackSeconds).toBeGreaterThanOrEqual(LOOKBACK_SECONDS);
  });

  test("unknown account: no lock, no chat posts, clear error", async () => {
    const deps = baseDeps();

    const result = await handleAccessRequest(
      { accountName: "Nobody", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Nobody");
    expect(deps.tryAcquireLock).not.toHaveBeenCalled();
    expect(deps.postToGoogleChat).not.toHaveBeenCalled();
  });

  test("relay mailbox not yet authorized: clear error, no lock taken, no chat posts", async () => {
    const deps = baseDeps({ authClient: null });

    const result = await handleAccessRequest(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("setup-relay-mailbox");
    expect(deps.tryAcquireLock).not.toHaveBeenCalled();
    expect(deps.postToGoogleChat).not.toHaveBeenCalled();
  });

  test("account already locked: returns busy message, does nothing else", async () => {
    const deps = baseDeps({ tryAcquireLock: jest.fn().mockReturnValue(false) });

    const result = await handleAccessRequest(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("already in progress");
    expect(deps.postToGoogleChat).not.toHaveBeenCalled();
    expect(deps.releaseLock).not.toHaveBeenCalled();
  });

  test("relay watcher times out: notifies group with actionable guidance, releases lock", async () => {
    const deps = baseDeps({
      waitForSigninLink: jest.fn().mockResolvedValue({ ok: false, errorMessage: "timed out" }),
    });

    const result = await handleAccessRequest(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(deps.postToGoogleChat).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("Couldn't find the sign-in link for Arpit yet (timed out)"),
      deps.webhookUrl,
      deps.httpClient
    );
    expect(deps.releaseLock).toHaveBeenCalledWith("Arpit");
  });

  test("unexpected exception mid-flow: still notifies group and releases lock", async () => {
    const deps = baseDeps({
      waitForSigninLink: jest.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await handleAccessRequest(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Something went wrong");
    expect(deps.releaseLock).toHaveBeenCalledWith("Arpit");
  });
});
