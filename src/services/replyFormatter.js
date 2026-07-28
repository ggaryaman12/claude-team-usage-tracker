const STATUS_EMOJI = {
  available: "🟢",
  low: "🟡",
  exhausted: "🔴",
};

function formatAccountLine(result) {
  if (result.error) {
    return `⚠️ ${result.name} — fetch failed (${result.errorMessage})`;
  }

  const emoji = STATUS_EMOJI[result.status] || "❓";
  const fiveHourPart = result.fiveHourResetAt
    ? `5hr: ${result.fiveHourPctUsed}% used (resets ${result.fiveHourResetAt})`
    : `5hr: ${result.fiveHourPctUsed}% used`;
  const sevenDayPart = result.sevenDayResetAt
    ? `7day: ${result.sevenDayPctUsed}% used (resets ${result.sevenDayResetAt})`
    : `7day: ${result.sevenDayPctUsed}% used`;

  return `${emoji} ${result.name} — ${fiveHourPart}, ${sevenDayPart} — ${result.contact}`;
}

/**
 * @param {Array} results - array of AccountUsageResult
 * @returns {{text: string}} Google Chat message body
 */
function formatReply(results) {
  if (!results || results.length === 0) {
    return { text: "No Claude accounts configured." };
  }

  const lines = results.map(formatAccountLine);
  return { text: lines.join("\n") };
}

module.exports = { formatReply };
