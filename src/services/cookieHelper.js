// Minimal cookie-header parser — avoids pulling in the cookie-parser
// dependency just to read one admin-session cookie.

/**
 * @param {string|undefined} cookieHeader - req.headers.cookie
 * @returns {Object<string, string>}
 */
function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) {
    return result;
  }
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return;
    try {
      result[key] = decodeURIComponent(value);
    } catch (e) {
      result[key] = value;
    }
  });
  return result;
}

module.exports = { parseCookies };
