const { postToGoogleChat, postMessageToGoogleChat } = require("./googleChatWebhook");

describe("postToGoogleChat", () => {
  test("posts {text} to the webhook URL with JSON content-type", async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({ status: 200 }) };

    const result = await postToGoogleChat("hello group", "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t", httpClient);

    expect(result).toBe(true);
    expect(httpClient.post).toHaveBeenCalledWith(
      "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t",
      { text: "hello group" },
      { headers: { "content-type": "application/json" } }
    );
  });

  test("returns false and does not throw when the webhook URL is missing", async () => {
    const httpClient = { post: jest.fn() };
    const result = await postToGoogleChat("hello", undefined, httpClient);
    expect(result).toBe(false);
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  test("returns false and does not throw when the POST rejects", async () => {
    const httpClient = { post: jest.fn().mockRejectedValue(new Error("network down")) };
    const result = await postToGoogleChat("hello", "https://example.com/webhook", httpClient);
    expect(result).toBe(false);
  });
});

describe("postMessageToGoogleChat", () => {
  test("posts the given message body as-is with JSON content-type", async () => {
    const httpClient = { post: jest.fn().mockResolvedValue({ status: 200 }) };
    const body = { cardsV2: [{ cardId: "x", card: {} }] };

    const result = await postMessageToGoogleChat(
      body,
      "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t",
      httpClient
    );

    expect(result).toBe(true);
    expect(httpClient.post).toHaveBeenCalledWith(
      "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t",
      body,
      { headers: { "content-type": "application/json" } }
    );
  });

  test("returns false and does not throw when the webhook URL is missing", async () => {
    const httpClient = { post: jest.fn() };
    const result = await postMessageToGoogleChat({ text: "hi" }, undefined, httpClient);
    expect(result).toBe(false);
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  test("returns false and does not throw when the POST rejects", async () => {
    const httpClient = { post: jest.fn().mockRejectedValue(new Error("network down")) };
    const result = await postMessageToGoogleChat({ text: "hi" }, "https://example.com/webhook", httpClient);
    expect(result).toBe(false);
  });
});
