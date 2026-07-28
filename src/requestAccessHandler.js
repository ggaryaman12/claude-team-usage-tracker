const { logger } = require("./utilities/logger");

/**
 * Orchestrates one "request access" flow end to end:
 *   1. Post the request event to the group (always, immediately — this is
 *      the transparency guarantee from the design spec).
 *   2. Watch the relay mailbox for a fresh sign-in email to arrive and
 *      extract the link from it.
 *   3. Post the link back to the group, tagged to the requester.
 *
 * Triggering the sign-in email itself is NOT automated — Anthropic's
 * sign-in page sits behind Cloudflare bot protection that blocks scripted
 * requests (confirmed via live testing, not a guess). Instead, the
 * requester triggers it themselves: a real human visiting claude.ai and
 * entering the target account's email is never blocked, since that page
 * doesn't verify who's typing, only where to send the link. The landing
 * page (server.js) shows them the target's email and a claude.ai link
 * before they submit this. This function only needs to know the request
 * happened and start watching for the result.
 *
 * Never throws — every failure path still posts something to the group so
 * the requester isn't left with silence.
 *
 * @param {{accountName: string, requesterName: string}} input
 * @param {Array<{name, contact, loginEmail}>} accounts
 * @param {object} deps - all injected for testability:
 *   tryAcquireLock, releaseLock, postToGoogleChat, waitForSigninLink,
 *   authClient (pre-built via buildRelayAuthClient, or null if the
 *   one-time relay-mailbox authorization hasn't been done yet), httpClient,
 *   webhookUrl, nowFn
 * @returns {Promise<{ok: boolean, message: string}>} outcome for the HTTP response
 */
async function handleAccessRequest({ accountName, requesterName }, accounts, deps) {
  const account = accounts.find((a) => a.name === accountName);
  if (!account) {
    return { ok: false, message: `No account named "${accountName}" is configured.` };
  }

  if (!deps.authClient) {
    return {
      ok: false,
      message:
        "The relay mailbox hasn't been authorized yet — visit /claude-usage-bot/setup-relay-mailbox once to finish setup, then try again.",
    };
  }

  const acquired = deps.tryAcquireLock(account.name);
  if (!acquired) {
    return {
      ok: false,
      message: `A request for ${account.name}'s account is already in progress — try again in a couple of minutes.`,
    };
  }

  try {
    await deps.postToGoogleChat(
      `${requesterName} requested access to ${account.name}'s account.`,
      deps.webhookUrl,
      deps.httpClient
    );

    const now = deps.nowFn ? deps.nowFn() : Date.now();
    const afterEpochSeconds = Math.floor(now / 1000) - 5; // small buffer for clock skew

    const linkResult = await deps.waitForSigninLink({
      authClient: deps.authClient,
      afterEpochSeconds,
      httpClient: deps.httpClient,
    });

    if (!linkResult.ok) {
      await deps.postToGoogleChat(
        `⚠️ Couldn't find the sign-in link for ${account.name} yet (${linkResult.errorMessage}). Make sure you actually submitted claude.ai's login form with their email, and that their forwarding filter is set up.`,
        deps.webhookUrl,
        deps.httpClient
      );
      return { ok: false, message: "Couldn't retrieve the link. The group has been notified." };
    }

    await deps.postToGoogleChat(
      `@${requesterName} here's the sign-in link for ${account.name}: ${linkResult.link}`,
      deps.webhookUrl,
      deps.httpClient
    );

    return { ok: true, message: "Request sent — check the group chat for the link." };
  } catch (err) {
    logger.error("handleAccessRequest unexpected error:", err.message);
    await deps.postToGoogleChat(
      `⚠️ Something went wrong handling the request for ${account.name}'s account.`,
      deps.webhookUrl,
      deps.httpClient
    );
    return { ok: false, message: "Something went wrong. The group has been notified." };
  } finally {
    deps.releaseLock(account.name);
  }
}

module.exports = { handleAccessRequest };
