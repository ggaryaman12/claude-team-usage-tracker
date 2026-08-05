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
    // Look back 5 minutes, not just a few seconds: the documented flow has
    // the requester trigger claude.ai's sign-in email BEFORE coming back to
    // confirm here, so by the time this runs the email can already be
    // several seconds-to-minutes old -- a narrow backward buffer misses it
    // even though it's sitting right there in the inbox. Paired with
    // gmailRelayWatcher's forward-looking MAX_WAIT_MS (also 5 min) and the
    // recipientEmail scoping below, this keeps a wide window safe rather
    // than accidentally matching a different account's concurrent request.
    const LOOKBACK_SECONDS = 5 * 60;
    const afterEpochSeconds = Math.floor(now / 1000) - LOOKBACK_SECONDS;

    const linkResult = await deps.waitForSigninLink({
      authClient: deps.authClient,
      afterEpochSeconds,
      recipientEmail: account.loginEmail,
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

    return {
      ok: true,
      message: "Request sent — check the group chat for the link.",
      link: linkResult.link,
    };
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

// Kept in sync with the LOOKBACK_SECONDS used inside handleAccessRequest --
// both express "how far back is it still reasonable to find this account's
// sign-in email."
const RETRY_LOOKBACK_SECONDS = 5 * 60;

// How long the "Check again" button stays usable after the ORIGINAL
// request (not reset by each retry click) -- past this, resurfacing an
// old link doesn't make sense and the requester should just start over.
// Mirrored client-side in requestAccessPageBuilder.js (button hides
// itself once this elapses) and enforced here too, since the client-side
// hide is only a UX nicety, not a real guard against a stale form POST.
const RETRY_WINDOW_MS = 10 * 60 * 1000;

/**
 * One-shot recheck of the relay inbox -- backs the "Check again" button on
 * the failure page after the original wait in handleAccessRequest already
 * timed out. Unlike handleAccessRequest this does exactly ONE Gmail check,
 * not a poll loop: no lock (the original request already released it by
 * the time this button is visible), no "X requested access" chat
 * announcement (that already happened once), and no re-waiting -- just
 * "look right now, same 5-minute backward window, same account-scoped
 * query." Only posts to chat when it actually finds something, so
 * repeated clicks while nothing's arrived yet don't spam the group.
 *
 * Never throws -- mirrors handleAccessRequest's failure-mode contract.
 *
 * @param {{accountName: string, requesterName: string, requestedAtMs?: number}} input
 *   requestedAtMs is when the ORIGINAL request started (carried through
 *   from the result page's hidden field) -- used to expire the retry
 *   button after RETRY_WINDOW_MS. Treated as not-yet-expired if omitted.
 * @param {Array<{name, contact, loginEmail}>} accounts
 * @param {object} deps - authClient, findLatestSigninEmail (from
 *   gmailRelayWatcher.js), postToGoogleChat, httpClient, webhookUrl, nowFn
 * @returns {Promise<{ok: boolean, message: string, link?: string, expired?: boolean}>}
 */
async function retrySigninLinkCheck({ accountName, requesterName, requestedAtMs }, accounts, deps) {
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

  const now = deps.nowFn ? deps.nowFn() : Date.now();
  if (requestedAtMs !== undefined && now - requestedAtMs > RETRY_WINDOW_MS) {
    return {
      ok: false,
      message: "This retry window has expired — go back and submit a new request.",
      expired: true,
    };
  }

  try {
    const { token } = await deps.authClient.getAccessToken();
    const afterEpochSeconds = Math.floor(now / 1000) - RETRY_LOOKBACK_SECONDS;

    const link = await deps.findLatestSigninEmail(
      token,
      afterEpochSeconds,
      deps.httpClient,
      account.loginEmail
    );

    if (!link) {
      return {
        ok: false,
        message:
          "Still nothing yet — make sure you've submitted claude.ai's login form with their email, then check again in a moment.",
      };
    }

    await deps.postToGoogleChat(
      `@${requesterName} here's the sign-in link for ${account.name}: ${link}`,
      deps.webhookUrl,
      deps.httpClient
    );

    return { ok: true, message: "Found it — check the group chat too.", link };
  } catch (err) {
    logger.error("retrySigninLinkCheck unexpected error:", err.message);
    return { ok: false, message: "Something went wrong checking again — try once more." };
  }
}

module.exports = { handleAccessRequest, retrySigninLinkCheck };
