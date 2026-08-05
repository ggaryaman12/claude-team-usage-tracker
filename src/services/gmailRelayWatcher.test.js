const {
  extractSigninLink,
  findLatestSigninEmail,
  waitForSigninLink,
  decodeBase64Url,
} = require("./gmailRelayWatcher");

function base64Url(str) {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

describe("decodeBase64Url", () => {
  test("decodes a base64url string back to utf-8", () => {
    expect(decodeBase64Url(base64Url("hello world"))).toBe("hello world");
  });
});

describe("extractSigninLink", () => {
  test("extracts the Sign in link from a real-shaped HTML body", () => {
    const html = `
      <html><body>
        <p>Click the button below to finish signing in. This link expires in 10 minutes.</p>
        <a href="https://claude.ai/api/auth/callback?token=abc123">Sign in</a>
        <p>If you didn't request this email, you can safely ignore it.</p>
      </body></html>
    `;
    const messageDetail = {
      payload: { mimeType: "text/html", body: { data: base64Url(html) } },
    };

    expect(extractSigninLink(messageDetail)).toBe(
      "https://claude.ai/api/auth/callback?token=abc123"
    );
  });

  test("finds the html part inside a multipart message", () => {
    const html = '<a href="https://claude.ai/signin/xyz">Sign in</a>';
    const messageDetail = {
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: base64Url("plain text version") } },
          { mimeType: "text/html", body: { data: base64Url(html) } },
        ],
      },
    };

    expect(extractSigninLink(messageDetail)).toBe("https://claude.ai/signin/xyz");
  });

  test("returns null when no html part is present", () => {
    const messageDetail = {
      payload: { mimeType: "text/plain", body: { data: base64Url("no html here") } },
    };
    expect(extractSigninLink(messageDetail)).toBeNull();
  });

  test("returns null when html has no Sign in link", () => {
    const messageDetail = {
      payload: { mimeType: "text/html", body: { data: base64Url("<p>unrelated email</p>") } },
    };
    expect(extractSigninLink(messageDetail)).toBeNull();
  });
});

describe("findLatestSigninEmail", () => {
  test("returns null when no messages match", async () => {
    const httpClient = { get: jest.fn().mockResolvedValue({ data: {} }) };
    const result = await findLatestSigninEmail("token", 1700000000, httpClient);
    expect(result).toBeNull();
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });

  test("fetches and extracts the link from the newest matching message", async () => {
    const html = '<a href="https://claude.ai/signin/found">Sign in</a>';
    const httpClient = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ data: { messages: [{ id: "msg1" }, { id: "msg2" }] } })
        .mockResolvedValueOnce({
          data: { payload: { mimeType: "text/html", body: { data: base64Url(html) } } },
        }),
    };

    const result = await findLatestSigninEmail("token", 1700000000, httpClient);

    expect(result).toBe("https://claude.ai/signin/found");
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg1",
      { headers: { Authorization: "Bearer token" }, params: { format: "full" } }
    );
  });

  // Root cause of "bot missed a link that was actually in the inbox": the
  // search had no way to tell WHICH account's sign-in email it was looking
  // for, so a concurrent request for a different account (or any other
  // Claude.ai email landing in the shared relay inbox around the same time)
  // could win the "newest match" race instead of the one this request
  // actually needs. Confirmed live against the real relay mailbox: Gmail's
  // `to:` operator matches the ORIGINAL recipient even after the message
  // was forwarded into the shared inbox, so scoping the query to
  // `to:<the account's loginEmail>` reliably isolates it.
  test("scopes the Gmail query to the requested account's loginEmail, not just any sign-in email", async () => {
    const httpClient = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ data: { messages: [{ id: "msg1" }] } })
        .mockResolvedValueOnce({
          data: {
            payload: {
              mimeType: "text/html",
              body: { data: base64Url('<a href="https://claude.ai/x">Sign in</a>') },
            },
          },
        }),
    };

    await findLatestSigninEmail("token", 1700000000, httpClient, "gaurav@example.com");

    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      {
        headers: { Authorization: "Bearer token" },
        params: {
          q: 'from:mail.anthropic.com to:gaurav@example.com subject:"secure link to Claude.ai" after:1700000000',
          maxResults: 5,
        },
      }
    );
  });

  test("falls back to the unscoped query when no recipientEmail is given (backward compatible)", async () => {
    const httpClient = { get: jest.fn().mockResolvedValue({ data: {} }) };
    await findLatestSigninEmail("token", 1700000000, httpClient);

    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      {
        headers: { Authorization: "Bearer token" },
        params: {
          q: 'from:mail.anthropic.com subject:"secure link to Claude.ai" after:1700000000',
          maxResults: 5,
        },
      }
    );
  });
});

describe("waitForSigninLink", () => {
  test("returns the link as soon as it's found, without waiting out the full timeout", async () => {
    const authClient = { getAccessToken: jest.fn().mockResolvedValue({ token: "tok" }) };
    const httpClient = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ data: {} }) // first poll: nothing yet
        .mockResolvedValueOnce({ data: { messages: [{ id: "m1" }] } }) // second poll: found
        .mockResolvedValueOnce({
          data: {
            payload: {
              mimeType: "text/html",
              body: { data: base64Url('<a href="https://claude.ai/x">Sign in</a>') },
            },
          },
        }),
    };
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    const result = await waitForSigninLink({
      authClient,
      afterEpochSeconds: 1700000000,
      httpClient,
      sleepFn,
    });

    expect(result).toEqual({ ok: true, link: "https://claude.ai/x" });
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });

  test("returns ok:false if it can't authenticate", async () => {
    const authClient = { getAccessToken: jest.fn().mockRejectedValue(new Error("bad key")) };
    const httpClient = { get: jest.fn() };

    const result = await waitForSigninLink({
      authClient,
      afterEpochSeconds: 1700000000,
      httpClient,
      sleepFn: jest.fn(),
    });

    expect(result).toEqual({
      ok: false,
      errorMessage: "Could not authenticate to the relay mailbox.",
    });
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  test("threads recipientEmail through to the Gmail query", async () => {
    const authClient = { getAccessToken: jest.fn().mockResolvedValue({ token: "tok" }) };
    const httpClient = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ data: { messages: [{ id: "m1" }] } })
        .mockResolvedValueOnce({
          data: {
            payload: {
              mimeType: "text/html",
              body: { data: base64Url('<a href="https://claude.ai/x">Sign in</a>') },
            },
          },
        }),
    };

    const result = await waitForSigninLink({
      authClient,
      afterEpochSeconds: 1700000000,
      recipientEmail: "gaurav@example.com",
      httpClient,
      sleepFn: jest.fn(),
    });

    expect(result).toEqual({ ok: true, link: "https://claude.ai/x" });
    const [, params] = httpClient.get.mock.calls[0];
    expect(params.params.q).toContain("to:gaurav@example.com");
  });
});
