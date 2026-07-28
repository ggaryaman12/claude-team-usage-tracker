const { verifyGoogleChatRequest } = require("./googleChatAuth");

describe("verifyGoogleChatRequest", () => {
  test("returns false when the header is missing", async () => {
    const fakeClient = { verifyIdToken: jest.fn() };
    const result = await verifyGoogleChatRequest(undefined, "my-audience", fakeClient);
    expect(result).toBe(false);
    expect(fakeClient.verifyIdToken).not.toHaveBeenCalled();
  });

  test("returns false when the header does not start with 'Bearer '", async () => {
    const fakeClient = { verifyIdToken: jest.fn() };
    const result = await verifyGoogleChatRequest("Basic abc123", "my-audience", fakeClient);
    expect(result).toBe(false);
    expect(fakeClient.verifyIdToken).not.toHaveBeenCalled();
  });

  test("returns true when the token verifies successfully", async () => {
    const fakeClient = {
      verifyIdToken: jest
        .fn()
        .mockResolvedValue({ getPayload: () => ({ iss: "chat@system.gserviceaccount.com" }) }),
    };
    const result = await verifyGoogleChatRequest("Bearer valid-token", "my-audience", fakeClient);
    expect(result).toBe(true);
    expect(fakeClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: "valid-token",
      audience: "my-audience",
    });
  });

  test("re-throws when verifyIdToken rejects (invalid/expired token)", async () => {
    const fakeClient = {
      verifyIdToken: jest.fn().mockRejectedValue(new Error("Token used too late")),
    };
    await expect(
      verifyGoogleChatRequest("Bearer expired-token", "my-audience", fakeClient)
    ).rejects.toThrow("Token used too late");
  });
});
