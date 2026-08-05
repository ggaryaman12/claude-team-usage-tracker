const { buildRequestAccessPageHtml, buildRequestResultPageHtml } = require("./requestAccessPageBuilder");

const ACCOUNT = { name: "Dikshant", loginEmail: "dikshant.claude@example.com" };
const BASE_PATH = "/claude-usage-bot";

describe("buildRequestAccessPageHtml", () => {
  test("shows the account name and target login email", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).toContain("Dikshant");
    expect(html).toContain("dikshant.claude@example.com");
  });

  test("asks only for an email, not a name/handle field", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).toContain('name="requesterEmail"');
    expect(html).toContain('type="email"');
    expect(html).not.toContain('name="requesterName"');
    expect(html).not.toContain("Slack handle");
  });

  test("posts to the correct account-scoped form action", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).toContain(`action="${BASE_PATH}/request"`);
    expect(html).toContain('value="Dikshant"');
  });

  test("includes a working copy-to-clipboard button for the target email", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).toContain('data-copy-target="target-email"');
    expect(html).toContain("navigator.clipboard.writeText");
  });

  test("HTML-escapes the account name and login email", () => {
    const html = buildRequestAccessPageHtml(
      { name: "<script>alert(1)</script>", loginEmail: "x@example.com" },
      BASE_PATH
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("shows no error banner by default", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).not.toContain('<div class="form-error">');
  });

  test("renders an inline error banner and keeps the page otherwise intact when errorMessage is given", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH, {
      errorMessage: '"nobody@evil.com" isn\'t on the known team roster.',
    });
    expect(html).toContain('<div class="form-error">');
    expect(html).toContain("isn&#39;t on the known team roster");
    // still the same page -- instructions and form still present
    expect(html).toContain("dikshant.claude@example.com");
    expect(html).toContain('name="requesterEmail"');
  });

  test("prefills the previously typed email so the user doesn't have to retype it", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH, {
      errorMessage: "not on the roster",
      prefillEmail: "nobody@evil.com",
    });
    expect(html).toContain('value="nobody@evil.com"');
  });

  test("HTML-escapes the error message and prefilled email", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH, {
      errorMessage: "<script>alert(2)</script>",
      prefillEmail: '"><script>alert(3)</script>',
    });
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).not.toContain("<script>alert(3)</script>");
  });

  test("disables the confirm button on submit so people don't double-submit while waiting", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).toContain('addEventListener("submit"');
    expect(html).toContain("btn.disabled = true");
  });
});

describe("buildRequestResultPageHtml", () => {
  test("success: shows the sign-in link as a clickable button, and mentions the chat post", () => {
    const html = buildRequestResultPageHtml(ACCOUNT, BASE_PATH, {
      ok: true,
      message: "Request sent — check the group chat for the link.",
      link: "https://claude.ai/magic-link",
    });
    expect(html).toContain('href="https://claude.ai/magic-link"');
    expect(html).toContain("Open sign-in link");
    expect(html).toContain("also posted in the group");
  });

  test("failure: shows the failure message and no link button", () => {
    const html = buildRequestResultPageHtml(ACCOUNT, BASE_PATH, {
      ok: false,
      message: "Couldn't retrieve the link. The group has been notified.",
    });
    expect(html).toContain("Couldn&#39;t retrieve the link");
    expect(html).not.toContain("Open sign-in link");
  });

  test("HTML-escapes the account name, message, and link", () => {
    const html = buildRequestResultPageHtml(
      { name: "<script>alert(1)</script>" },
      BASE_PATH,
      { ok: true, message: "<script>alert(2)</script>", link: '"><script>alert(3)</script>' }
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).not.toContain("<script>alert(3)</script>");
  });

  test("links back to the request landing page for this account", () => {
    const html = buildRequestResultPageHtml(ACCOUNT, BASE_PATH, {
      ok: false,
      message: "already in progress",
    });
    expect(html).toContain(`href="${BASE_PATH}/request?account=Dikshant"`);
  });

  test("failure with a requesterEmail: shows a 'Check again' retry form posting to /request/retry", () => {
    const html = buildRequestResultPageHtml(
      ACCOUNT,
      BASE_PATH,
      { ok: false, message: "Still nothing yet." },
      "requester@example.com"
    );
    expect(html).toContain(`action="${BASE_PATH}/request/retry"`);
    expect(html).toContain('name="account" value="Dikshant"');
    expect(html).toContain('name="requesterEmail" value="requester@example.com"');
    expect(html).toContain("Check again");
  });

  test("success: no retry form, even if a requesterEmail is passed", () => {
    const html = buildRequestResultPageHtml(
      ACCOUNT,
      BASE_PATH,
      { ok: true, message: "found it", link: "https://claude.ai/x" },
      "requester@example.com"
    );
    expect(html).not.toContain(`action="${BASE_PATH}/request/retry"`);
    expect(html).not.toContain("Check again");
  });

  test("failure without a requesterEmail: no retry form (nothing to resubmit)", () => {
    const html = buildRequestResultPageHtml(ACCOUNT, BASE_PATH, {
      ok: false,
      message: "no requester context",
    });
    expect(html).not.toContain(`action="${BASE_PATH}/request/retry"`);
    expect(html).not.toContain("Check again");
  });

  test("HTML-escapes the requesterEmail in the retry form", () => {
    const html = buildRequestResultPageHtml(
      ACCOUNT,
      BASE_PATH,
      { ok: false, message: "still nothing" },
      '"><script>alert(4)</script>'
    );
    expect(html).not.toContain("<script>alert(4)</script>");
  });

  // The retry button should only be usable for 10 minutes after the
  // ORIGINAL request, not indefinitely -- both a server-side guard
  // (retrySigninLinkCheck) and this client-side one so the button doesn't
  // just sit there looking clickable past its actual expiry.
  describe("retry window expiry", () => {
    test("carries requestedAtMs through as a hidden field so a retry click still anchors to the original request time", () => {
      const requestedAtMs = Date.now() - 60 * 1000; // 1 min ago -- within window
      const html = buildRequestResultPageHtml(
        ACCOUNT,
        BASE_PATH,
        { ok: false, message: "still nothing" },
        "requester@example.com",
        requestedAtMs
      );
      expect(html).toContain(`name="requestedAt" value="${requestedAtMs}"`);
    });

    test("still within the window: renders the retry form normally with a live countdown", () => {
      const html = buildRequestResultPageHtml(
        ACCOUNT,
        BASE_PATH,
        { ok: false, message: "still nothing" },
        "requester@example.com",
        Date.now() - 2 * 60 * 1000 // 2 min ago
      );
      expect(html).toContain(`action="${BASE_PATH}/request/retry"`);
      expect(html).toContain("Check again");
    });

    test("already past 10 minutes at render time: omits the retry form entirely, shows an expiry note instead", () => {
      const html = buildRequestResultPageHtml(
        ACCOUNT,
        BASE_PATH,
        { ok: false, message: "still nothing" },
        "requester@example.com",
        Date.now() - 11 * 60 * 1000 // 11 min ago
      );
      expect(html).not.toContain(`action="${BASE_PATH}/request/retry"`);
      expect(html).not.toContain(">Check again<");
      expect(html).toContain("submit a new request");
    });

    test("no requestedAtMs given: falls back to always-available retry (backward compatible)", () => {
      const html = buildRequestResultPageHtml(
        ACCOUNT,
        BASE_PATH,
        { ok: false, message: "still nothing" },
        "requester@example.com"
      );
      expect(html).toContain(`action="${BASE_PATH}/request/retry"`);
    });
  });
});
