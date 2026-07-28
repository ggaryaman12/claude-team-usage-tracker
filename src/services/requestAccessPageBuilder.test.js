const { buildRequestAccessPageHtml } = require("./requestAccessPageBuilder");

const ACCOUNT = { name: "Charlie", loginEmail: "charlie.claude@example.com" };
const BASE_PATH = "/claude-usage-bot";

describe("buildRequestAccessPageHtml", () => {
  test("shows the account name and target login email", () => {
    const html = buildRequestAccessPageHtml(ACCOUNT, BASE_PATH);
    expect(html).toContain("Charlie");
    expect(html).toContain("charlie.claude@example.com");
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
    expect(html).toContain('value="Charlie"');
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
    expect(html).toContain("charlie.claude@example.com");
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
});
