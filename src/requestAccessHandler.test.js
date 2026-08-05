const { handleAccessRequest, retrySigninLinkCheck } = require("./requestAccessHandler");

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

describe("retrySigninLinkCheck", () => {
  function baseRetryDeps(overrides = {}) {
    return {
      authClient: { getAccessToken: jest.fn().mockResolvedValue({ token: "tok" }) },
      findLatestSigninEmail: jest.fn().mockResolvedValue("https://claude.ai/x"),
      postToGoogleChat: jest.fn().mockResolvedValue(true),
      httpClient: {},
      webhookUrl: "https://chat.googleapis.com/webhook",
      nowFn: () => 1700000000000,
      ...overrides,
    };
  }

  test("happy path: single check finds the link, posts it to chat, no lock/announcement involved", async () => {
    const deps = baseRetryDeps();

    const result = await retrySigninLinkCheck(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result).toEqual({
      ok: true,
      message: "Found it — check the group chat too.",
      link: "https://claude.ai/x",
    });
    expect(deps.findLatestSigninEmail).toHaveBeenCalledWith(
      "tok",
      Math.floor(1700000000000 / 1000) - LOOKBACK_SECONDS,
      deps.httpClient,
      "arpit@example.com"
    );
    expect(deps.postToGoogleChat).toHaveBeenCalledTimes(1);
    expect(deps.postToGoogleChat).toHaveBeenCalledWith(
      "@Aryaman here's the sign-in link for Arpit: https://claude.ai/x",
      deps.webhookUrl,
      deps.httpClient
    );
  });

  test("nothing found: clear message, no chat post at all (retries shouldn't spam the group)", async () => {
    const deps = baseRetryDeps({ findLatestSigninEmail: jest.fn().mockResolvedValue(null) });

    const result = await retrySigninLinkCheck(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).not.toBe("");
    expect(deps.postToGoogleChat).not.toHaveBeenCalled();
  });

  test("only checks once -- does not poll or wait", async () => {
    const deps = baseRetryDeps({ findLatestSigninEmail: jest.fn().mockResolvedValue(null) });

    await retrySigninLinkCheck({ accountName: "Arpit", requesterName: "Aryaman" }, accounts, deps);

    expect(deps.findLatestSigninEmail).toHaveBeenCalledTimes(1);
  });

  test("unknown account: clear error, no auth/check attempted", async () => {
    const deps = baseRetryDeps();

    const result = await retrySigninLinkCheck(
      { accountName: "Nobody", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Nobody");
    expect(deps.findLatestSigninEmail).not.toHaveBeenCalled();
  });

  test("relay mailbox not yet authorized: clear error, no check attempted", async () => {
    const deps = baseRetryDeps({ authClient: null });

    const result = await retrySigninLinkCheck(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("setup-relay-mailbox");
    expect(deps.findLatestSigninEmail).not.toHaveBeenCalled();
  });

  test("does not require or touch the account lock -- safe to click after the original wait already released it", async () => {
    const deps = baseRetryDeps();
    expect(deps.tryAcquireLock).toBeUndefined();
    expect(deps.releaseLock).toBeUndefined();

    const result = await retrySigninLinkCheck(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(true);
  });

  test("unexpected exception: friendly message, doesn't throw", async () => {
    const deps = baseRetryDeps({
      findLatestSigninEmail: jest.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await retrySigninLinkCheck(
      { accountName: "Arpit", requesterName: "Aryaman" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("went wrong");
  });

  // The retry button should only be usable for 10 minutes after the
  // original request -- past that, resurfacing a very old sign-in link
  // (or spending an API call checking for one) doesn't make sense; the
  // requester should just submit a fresh request instead.
  describe("retry window expiry", () => {
    test("within 10 minutes of the original request: checks as normal", async () => {
      const deps = baseRetryDeps();
      const requestedAtMs = 1700000000000 - 9 * 60 * 1000; // 9 min ago

      const result = await retrySigninLinkCheck(
        { accountName: "Arpit", requesterName: "Aryaman", requestedAtMs },
        accounts,
        deps
      );

      expect(result.ok).toBe(true);
      expect(deps.findLatestSigninEmail).toHaveBeenCalledTimes(1);
    });

    test("past 10 minutes: rejects without even calling Gmail", async () => {
      const deps = baseRetryDeps();
      const requestedAtMs = 1700000000000 - 11 * 60 * 1000; // 11 min ago

      const result = await retrySigninLinkCheck(
        { accountName: "Arpit", requesterName: "Aryaman", requestedAtMs },
        accounts,
        deps
      );

      expect(result).toEqual({
        ok: false,
        message: "This retry window has expired — go back and submit a new request.",
        expired: true,
      });
      expect(deps.findLatestSigninEmail).not.toHaveBeenCalled();
      expect(deps.authClient.getAccessToken).not.toHaveBeenCalled();
      expect(deps.postToGoogleChat).not.toHaveBeenCalled();
    });

    test("no requestedAtMs given (e.g. old link from before this feature): treated as not expired", async () => {
      const deps = baseRetryDeps();

      const result = await retrySigninLinkCheck(
        { accountName: "Arpit", requesterName: "Aryaman" },
        accounts,
        deps
      );

      expect(result.ok).toBe(true);
    });
  });
});
