const axios = require("axios");

const USAGE_COMMAND_ID = 1;

/**
 * Orchestrates one /usage invocation: checks the slash command id, fetches
 * live usage for every configured account, and formats the reply.
 *
 * @param {object} chatEventBody - the raw Google Chat MESSAGE event body
 * @param {Array<{name, contact, oauthToken}>} accounts
 * @param {{fetchAllAccountsUsage: Function, formatReply: Function}} deps
 * @returns {Promise<{text: string}>}
 */
async function handleUsageCommand(chatEventBody, accounts, deps) {
  const commandId =
    chatEventBody &&
    chatEventBody.message &&
    chatEventBody.message.slashCommand &&
    chatEventBody.message.slashCommand.commandId;

  if (commandId !== USAGE_COMMAND_ID) {
    return { text: "Unrecognized command. Try /usage." };
  }

  const results = await deps.fetchAllAccountsUsage(accounts, axios);
  return deps.formatReply(results);
}

module.exports = { handleUsageCommand, USAGE_COMMAND_ID };
