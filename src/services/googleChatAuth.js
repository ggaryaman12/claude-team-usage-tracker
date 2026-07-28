/**
 * Verifies that an incoming request really came from Google Chat by checking
 * the signed bearer token Google attaches to every Chat app HTTP call.
 *
 * @param {string|undefined} authorizationHeader - the raw `Authorization` header
 * @param {string} expectedAudience - your Cloud project number/id, as configured
 *   for the Chat app
 * @param {import('google-auth-library').OAuth2Client} oAuth2Client - injected so
 *   tests can supply a fake client instead of calling Google's network
 * @returns {Promise<boolean>}
 */
async function verifyGoogleChatRequest(authorizationHeader, expectedAudience, oAuth2Client) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authorizationHeader.slice("Bearer ".length);
  await oAuth2Client.verifyIdToken({
    idToken: token,
    audience: expectedAudience,
  });
  return true;
}

module.exports = { verifyGoogleChatRequest };
