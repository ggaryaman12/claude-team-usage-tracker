const { logger } = require("../utilities/logger");

// ⚠️ UNVERIFIED — best-effort endpoint based on how claude.ai's email
// sign-in page behaves publicly. This has NOT been confirmed against real
// browser network traffic (would require actually submitting a real email
// on the login page and inspecting the request, which sends a real email —
// not done unilaterally). Before relying on this in production, verify by
// opening claude.ai's login page, submitting an email you control, and
// checking the Network tab for the exact request this should match. Update
// SIGNIN_ENDPOINT and the request body shape below if they differ.
const SIGNIN_ENDPOINT = "https://claude.ai/api/auth/signin_email";

/**
 * Triggers a fresh Claude.ai sign-in (magic-link) email for the given
 * address — the same action as typing that email into the login page.
 * Never throws; returns a result object so callers can reply gracefully.
 *
 * @param {string} email
 * @param {{post: Function}} httpClient
 * @returns {Promise<{ok: boolean, errorMessage?: string}>}
 */
async function triggerSigninEmail(email, httpClient) {
  try {
    await httpClient.post(
      SIGNIN_ENDPOINT,
      { email },
      { headers: { "content-type": "application/json" } }
    );
    return { ok: true };
  } catch (err) {
    logger.error("triggerSigninEmail failed:", err.message);
    return { ok: false, errorMessage: err.message };
  }
}

module.exports = { triggerSigninEmail, SIGNIN_ENDPOINT };
