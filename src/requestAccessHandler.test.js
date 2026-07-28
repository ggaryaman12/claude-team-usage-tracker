const { handleAccessRequest } = require("./requestAccessHandler");

const accounts = [
  { name: "Charlie", contact: "@charlie", loginEmail: "charlie@example.com" },
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
      { accountName: "Charlie", requesterName: "Alice" },
      accounts,
      deps
    );

    expect(result).toEqual({ ok: true, message: "Request sent — check the group chat for the link." });
    expect(deps.postToGoogleChat).toHaveBeenNthCalledWith(
      1,
      "Alice requested access to Charlie's account.",
      deps.webhookUrl,
      deps.httpClient
    );
    expect(deps.postToGoogleChat).toHaveBeenNthCalledWith(
      2,
      "@Alice here's the sign-in link for Charlie: https://claude.ai/x",
      deps.webhookUrl,
      deps.httpClient
    );
    expect(deps.waitForSigninLink).toHaveBeenCalledWith({
      authClient: deps.authClient,
      afterEpochSeconds: Math.floor(1700000000000 / 1000) - 5,
      httpClient: deps.httpClient,
    });
    expect(deps.releaseLock).toHaveBeenCalledWith("Charlie");
  });

  test("unknown account: no lock, no chat posts, clear error", async () => {
    const deps = baseDeps();

    const result = await handleAccessRequest(
      { accountName: "Nobody", requesterName: "Alice" },
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
      { accountName: "Charlie", requesterName: "Alice" },
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
      { accountName: "Charlie", requesterName: "Alice" },
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
      { accountName: "Charlie", requesterName: "Alice" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(deps.postToGoogleChat).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("Couldn't find the sign-in link for Charlie yet (timed out)"),
      deps.webhookUrl,
      deps.httpClient
    );
    expect(deps.releaseLock).toHaveBeenCalledWith("Charlie");
  });

  test("unexpected exception mid-flow: still notifies group and releases lock", async () => {
    const deps = baseDeps({
      waitForSigninLink: jest.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await handleAccessRequest(
      { accountName: "Charlie", requesterName: "Alice" },
      accounts,
      deps
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Something went wrong");
    expect(deps.releaseLock).toHaveBeenCalledWith("Charlie");
  });
});
