const { handleUsageCommand, USAGE_COMMAND_ID } = require("./chatCommandHandler");

describe("handleUsageCommand", () => {
  const accounts = [{ name: "Alice", contact: "@alice", oauthToken: "tok" }];

  test("fetches usage and formats a reply when the /usage command id matches", async () => {
    const fetchAllAccountsUsage = jest
      .fn()
      .mockResolvedValue([{ name: "Alice", contact: "@alice", error: false, status: "available" }]);
    const formatReply = jest.fn().mockReturnValue({ text: "formatted reply" });

    const event = { message: { slashCommand: { commandId: USAGE_COMMAND_ID } } };

    const result = await handleUsageCommand(event, accounts, { fetchAllAccountsUsage, formatReply });

    expect(fetchAllAccountsUsage).toHaveBeenCalledWith(accounts, expect.anything());
    expect(formatReply).toHaveBeenCalledWith([
      { name: "Alice", contact: "@alice", error: false, status: "available" },
    ]);
    expect(result).toEqual({ text: "formatted reply" });
  });

  test("returns a help message for an unrecognized command id, without fetching", async () => {
    const fetchAllAccountsUsage = jest.fn();
    const formatReply = jest.fn();

    const event = { message: { slashCommand: { commandId: 999 } } };

    const result = await handleUsageCommand(event, accounts, { fetchAllAccountsUsage, formatReply });

    expect(fetchAllAccountsUsage).not.toHaveBeenCalled();
    expect(result).toEqual({ text: "Unrecognized command. Try /usage." });
  });

  test("returns a help message when the event has no slash command at all", async () => {
    const fetchAllAccountsUsage = jest.fn();
    const formatReply = jest.fn();

    const result = await handleUsageCommand({ message: {} }, accounts, {
      fetchAllAccountsUsage,
      formatReply,
    });

    expect(fetchAllAccountsUsage).not.toHaveBeenCalled();
    expect(result).toEqual({ text: "Unrecognized command. Try /usage." });
  });
});
