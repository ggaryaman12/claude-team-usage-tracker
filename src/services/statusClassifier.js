const LOW_THRESHOLD_PCT = 80;
const EXHAUSTED_THRESHOLD_PCT = 100;

/**
 * Classifies an account's availability from its 5-hour and 7-day usage percentages.
 * @param {number} fiveHourPctUsed - percent (0-100+) of the 5-hour window used
 * @param {number} sevenDayPctUsed - percent (0-100+) of the 7-day window used
 * @returns {"available"|"low"|"exhausted"}
 */
function classifyStatus(fiveHourPctUsed, sevenDayPctUsed) {
  if (fiveHourPctUsed >= EXHAUSTED_THRESHOLD_PCT) {
    return "exhausted";
  }
  if (fiveHourPctUsed > LOW_THRESHOLD_PCT || sevenDayPctUsed > LOW_THRESHOLD_PCT) {
    return "low";
  }
  return "available";
}

module.exports = { classifyStatus, LOW_THRESHOLD_PCT, EXHAUSTED_THRESHOLD_PCT };
