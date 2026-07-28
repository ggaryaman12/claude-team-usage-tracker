const { buildTeamLoginPageHtml } = require("./teamLoginPageBuilder");

const BASE_PATH = "/claude-usage-bot";

describe("buildTeamLoginPageHtml", () => {
  test("posts to the dashboard-login route with a returnTo field", () => {
    const html = buildTeamLoginPageHtml(BASE_PATH, `${BASE_PATH}/dashboard`);
    expect(html).toContain(`action="${BASE_PATH}/dashboard-login"`);
    expect(html).toContain(`value="${BASE_PATH}/dashboard"`);
  });

  test("does not show an error by default", () => {
    const html = buildTeamLoginPageHtml(BASE_PATH);
    expect(html).not.toContain("Wrong password");
  });

  test("shows an inline error when wrongPassword is true", () => {
    const html = buildTeamLoginPageHtml(BASE_PATH, `${BASE_PATH}/dashboard`, true);
    expect(html).toContain("Wrong password");
  });

  test("never includes an actual password value anywhere in the page (the function never receives one)", () => {
    const html = buildTeamLoginPageHtml(BASE_PATH);
    expect(html).not.toMatch(/value="[a-zA-Z0-9]{6,}"/);
  });

  test("hints where to find the password without revealing it", () => {
    const html = buildTeamLoginPageHtml(BASE_PATH);
    expect(html).toContain("Google Chat");
    expect(html).toContain("hourly usage post");
  });

  test("HTML-escapes the returnTo value", () => {
    const html = buildTeamLoginPageHtml(BASE_PATH, '"><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
