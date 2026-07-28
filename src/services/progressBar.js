// Google Chat Cards v2 has no native progress-bar widget — this renders one
// as text using unicode block characters, which works fine inside
// decoratedText.text (plain characters, no special widget needed).

const BAR_LENGTH = 10;
const FILLED_CHAR = "█";
const EMPTY_CHAR = "░";

/**
 * @param {number} pctUsed - 0-100 (values outside this range are clamped)
 * @returns {string} e.g. "███░░░░░░░"
 */
function buildProgressBar(pctUsed) {
  const clamped = Math.max(0, Math.min(100, pctUsed));
  const filledCount = Math.round((clamped / 100) * BAR_LENGTH);
  return FILLED_CHAR.repeat(filledCount) + EMPTY_CHAR.repeat(BAR_LENGTH - filledCount);
}

module.exports = { buildProgressBar, BAR_LENGTH };
