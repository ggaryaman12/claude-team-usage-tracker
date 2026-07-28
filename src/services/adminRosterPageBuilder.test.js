const { buildAdminRosterPageHtml } = require("./adminRosterPageBuilder");

const BASE_PATH = "/claude-usage-bot";
const ROSTER = [
  { name: "Alice Example", email: "alice@example.com" },
  { name: "Bob Example", email: "bob@example.com" },
];

describe("buildAdminRosterPageHtml", () => {
  test("lists every roster entry with a remove form", () => {
    const html = buildAdminRosterPageHtml(ROSTER, BASE_PATH);
    expect(html).toContain("Alice Example");
    expect(html).toContain("alice@example.com");
    expect(html).toContain("Bob Example");
    expect(html).toContain(`action="${BASE_PATH}/admin/roster/remove"`);
    expect(html).toContain('value="alice@example.com"');
  });

  test("shows an empty-state row when the roster is empty", () => {
    const html = buildAdminRosterPageHtml([], BASE_PATH);
    expect(html).toContain("Roster is empty.");
  });

  test("includes an add form posting to the roster route", () => {
    const html = buildAdminRosterPageHtml(ROSTER, BASE_PATH);
    expect(html).toContain(`action="${BASE_PATH}/admin/roster"`);
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
  });

  test("shows no error banner by default", () => {
    const html = buildAdminRosterPageHtml(ROSTER, BASE_PATH);
    expect(html).not.toContain('<div class="error">');
  });

  test("shows an inline error when given", () => {
    const html = buildAdminRosterPageHtml(ROSTER, BASE_PATH, '"charlie@example.com" is already on the roster.');
    expect(html).toContain("is already on the roster");
  });

  test("HTML-escapes names and emails", () => {
    const html = buildAdminRosterPageHtml(
      [{ name: "<script>alert(1)</script>", email: "x@example.com" }],
      BASE_PATH
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
