const { parseCookies } = require("./cookieHelper");

describe("parseCookies", () => {
  test("returns an empty object for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  test("parses a single cookie", () => {
    expect(parseCookies("cub_admin=abc123")).toEqual({ cub_admin: "abc123" });
  });

  test("parses multiple cookies separated by '; '", () => {
    expect(parseCookies("a=1; b=2; cub_admin=xyz")).toEqual({ a: "1", b: "2", cub_admin: "xyz" });
  });

  test("decodes URI-encoded values", () => {
    expect(parseCookies("name=hello%20world")).toEqual({ name: "hello world" });
  });

  test("skips malformed pairs without a '='", () => {
    expect(parseCookies("a=1; garbage; b=2")).toEqual({ a: "1", b: "2" });
  });
});
