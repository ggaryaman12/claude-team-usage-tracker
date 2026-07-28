const { buildAdminLoginPageHtml } = require("./adminLoginPageBuilder");

const BASE_PATH = "/claude-usage-bot";

describe("buildAdminLoginPageHtml", () => {
  test("posts to the admin route with a returnTo field", () => {
    const html = buildAdminLoginPageHtml(BASE_PATH, `${BASE_PATH}/admin/devices`);
    expect(html).toContain(`action="${BASE_PATH}/admin"`);
    expect(html).toContain(`value="${BASE_PATH}/admin/devices"`);
  });

  test("does not show an error by default", () => {
    const html = buildAdminLoginPageHtml(BASE_PATH);
    expect(html).not.toContain("Wrong passkey");
  });

  test("shows an inline error when wrongPasskey is true", () => {
    const html = buildAdminLoginPageHtml(BASE_PATH, `${BASE_PATH}/admin/devices`, true);
    expect(html).toContain("Wrong passkey");
  });

  test("never includes an actual passkey value anywhere in the page", () => {
    const html = buildAdminLoginPageHtml(BASE_PATH);
    expect(html).not.toMatch(/value="[a-zA-Z0-9]{10,}"/);
  });

  test("HTML-escapes the returnTo value", () => {
    const html = buildAdminLoginPageHtml(BASE_PATH, '"><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
