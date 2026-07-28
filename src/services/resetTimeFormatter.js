// Formats Anthropic's usage.resets_at (5hr and 7day windows) into a short,
// human line: a countdown plus the actual clock time in IST, since the
// team's all on @example.com and a countdown alone ("resets in 47m")
// is useless without knowing what time that lands at for a shared reading.

const TIMEZONE = "Asia/Kolkata";

/**
 * @param {string|null|undefined} resetsAtIso
 * @param {Function} [nowFn] - injectable for testing
 * @returns {string|null} e.g. "resets in 1h 12m (2:30 PM)", or null if
 *   resets_at wasn't provided / isn't parseable.
 */
function formatResetTime(resetsAtIso, nowFn = Date.now) {
  if (!resetsAtIso) {
    return null;
  }

  const resetMs = new Date(resetsAtIso).getTime();
  if (Number.isNaN(resetMs)) {
    return null;
  }

  const diffMs = resetMs - nowFn();
  const totalMinutes = Math.round(diffMs / 60000);
  const days = Math.floor(Math.max(totalMinutes, 0) / (24 * 60));

  // Beyond a day out, a bare clock time is ambiguous ("6:30 am" — today?
  // which day?) — add the weekday so the label stands on its own.
  const clockTime = new Date(resetMs).toLocaleTimeString("en-IN", {
    timeZone: TIMEZONE,
    ...(days > 0 ? { weekday: "short" } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffMs <= 0) {
    return `resets soon (${clockTime})`;
  }

  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  let countdown;
  if (days > 0) {
    countdown = `${days}d ${hours}h`;
  } else if (hours > 0) {
    countdown = `${hours}h ${minutes}m`;
  } else {
    countdown = `${minutes}m`;
  }

  return `resets in ${countdown} (${clockTime})`;
}

module.exports = { formatResetTime, TIMEZONE };
