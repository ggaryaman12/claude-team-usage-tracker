const { triggerSigninEmail, SIGNIN_ENDPOINT } = require("./claudeSigninTrigger");

describe("triggerSigninEmail", () => {
  test("posts the email to the signin endpoint and returns ok:true on success", async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({ status: 200 }) };

    const result = await triggerSigninEmail("charlie@example.com", httpClient);

    expect(result).toEqual({ ok: true });
    expect(httpClient.post).toHaveBeenCalledWith(
      SIGNIN_ENDPOINT,
      { email: "charlie@example.com" },
      { headers: { "content-type": "application/json" } }
    );
  });

  test("returns ok:false with an error message on failure, never throws", async () => {
    const httpClient = { post: jest.fn().mockRejectedValue(new Error("502 from claude.ai")) };

    const result = await triggerSigninEmail("charlie@example.com", httpClient);

    expect(result).toEqual({ ok: false, errorMessage: "502 from claude.ai" });
  });
});
