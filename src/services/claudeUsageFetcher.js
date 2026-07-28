const { classifyStatus } = require("./statusClassifier");
const { logger } = require("../utilities/logger");

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_VERSION = "2023-06-01";
// OAuth bearer tokens (sk-ant-oat01-..., from `claude setup-token`) require
// this beta header alongside Authorization: Bearer — API keys don't need it,
// but OAuth tokens do. Confirmed necessary after a live 403 with this header
// missing; see claude-api skill's Authentication section.
const OAUTH_BETA_HEADER = "oauth-2025-04-20";

// `utilization` from the real endpoint is already a 0-100 percentage
// (confirmed against a live response: {"five_hour":{"utilization":39.0},
// "seven_day":{"utilization":4.0}} for an account at 39%/4% used — not a
// 0-1 fraction as originally assumed from docs. HaloNotch's Swift code got
// this right (stores the value directly, no *100); ours didn't, and it
// went undetected until real production data showed impossible numbers
// like 3900%. Round only — do not multiply.
function toPercent(utilizationPercent) {
  return Math.round(utilizationPercent);
}

/**
 * Fetches and classifies live usage for a single Claude account.
 * Never throws — HTTP/parsing failures are captured into the error result shape.
 *
 * @param {{name: string, contact: string, oauthToken: string}} account
 * @param {{get: Function}} httpClient - an axios-compatible client (injected for testing)
 * @returns {Promise<Object>} AccountUsageResult
 */
async function fetchAccountUsage(account, httpClient) {
  try {
    const response = await httpClient.get(USAGE_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${account.oauthToken}`,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": OAUTH_BETA_HEADER,
      },
    });

    const fiveHourPctUsed = toPercent(response.data.five_hour.utilization);
    const sevenDayPctUsed = toPercent(response.data.seven_day.utilization);

    return {
      name: account.name,
      contact: account.contact,
      error: false,
      fiveHourPctUsed,
      fiveHourResetAt: response.data.five_hour.resets_at,
      sevenDayPctUsed,
      sevenDayResetAt: response.data.seven_day.resets_at,
      status: classifyStatus(fiveHourPctUsed, sevenDayPctUsed),
    };
  } catch (err) {
    // Log the full response body server-side (never in the Chat-facing
    // errorMessage — that stays generic to avoid leaking API internals into
    // a group chat) so failures like wrong-shaped requests are diagnosable
    // from journalctl instead of guessing blind again.
    if (err.response) {
      logger.error(
        `fetchAccountUsage(${account.name}): HTTP ${err.response.status} —`,
        JSON.stringify(err.response.data)
      );
    } else {
      logger.error(`fetchAccountUsage(${account.name}): ${err.message}`);
    }
    return {
      name: account.name,
      contact: account.contact,
      error: true,
      errorMessage: err.message,
    };
  }
}

/**
 * Fetches usage for every account in parallel. A single account's failure
 * (already captured by fetchAccountUsage) never affects the others.
 *
 * @param {Array<{name, contact, oauthToken}>} accounts
 * @param {{get: Function}} httpClient
 * @returns {Promise<Array>} one AccountUsageResult per account, same order as input
 */
async function fetchAllAccountsUsage(accounts, httpClient) {
  return Promise.all(accounts.map((account) => fetchAccountUsage(account, httpClient)));
}

module.exports = { fetchAccountUsage, fetchAllAccountsUsage };
