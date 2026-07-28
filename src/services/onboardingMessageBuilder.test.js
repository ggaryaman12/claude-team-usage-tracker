const { buildOnboardingMessage } = require("./onboardingMessageBuilder");

describe("buildOnboardingMessage", () => {
  test("includes the given install URL in the one-time setup command", () => {
    const message = buildOnboardingMessage("https://example.com/install-hook.sh");
    expect(message).toContain('curl -sL "https://example.com/install-hook.sh" | bash');
  });

  test("makes the never-sends-your-token promise explicit", () => {
    const message = buildOnboardingMessage("https://example.com/install-hook.sh");
    expect(message).toContain("never your token");
  });

  test("mentions Request Access for borrowing spare capacity", () => {
    const message = buildOnboardingMessage("https://example.com/install-hook.sh");
    expect(message).toContain("Request Access");
  });

  test("includes the dashboard URL and team password when given", () => {
    const message = buildOnboardingMessage(
      "https://example.com/install-hook.sh",
      "https://example.com/claude-usage-bot/dashboard",
      "SecretWord"
    );
    expect(message).toContain("https://example.com/claude-usage-bot/dashboard");
    expect(message).toContain("team password: SecretWord");
  });

  test("omits the dashboard line entirely when no dashboardUrl is given", () => {
    const message = buildOnboardingMessage("https://example.com/install-hook.sh");
    expect(message).not.toContain("Full dashboard");
    expect(message).not.toContain("team password");
  });

  test("shows the dashboard URL without a password mention when teamPassword isn't given", () => {
    const message = buildOnboardingMessage("https://example.com/install-hook.sh", "https://example.com/dashboard");
    expect(message).toContain("https://example.com/dashboard");
    expect(message).not.toContain("team password");
  });
});
