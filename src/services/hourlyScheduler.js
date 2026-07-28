// Computes the delay until the next top-of-the-clock-hour in IST (e.g.
// 3:00:00 PM, 4:00:00 PM IST — "even time" as requested), so the auto-push
// timer in server.js fires on the hour instead of drifting to whatever
// time the process happened to last restart at.
//
// Deliberately does NOT use Date's local getHours()/setHours() — those
// depend on the server process's system timezone, which may be UTC (common
// default on EC2/Ubuntu) rather than IST. IST has no DST and a fixed
// +5:30 offset, so we shift the timestamp into an IST-equivalent pseudo-UTC
// value, do the hour-boundary math with UTC methods (immune to host TZ),
// then shift back — the result is correct regardless of what timezone the
// box itself is configured with.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * @param {Function} [nowFn] - injectable for testing; returns epoch ms
 * @returns {number} milliseconds until the next IST top of the hour (> 0, <= 1h)
 */
function msUntilNextTopOfHour(nowFn = Date.now) {
  const nowUtcMs = nowFn();
  const istPseudoMs = nowUtcMs + IST_OFFSET_MS;

  const istPseudo = new Date(istPseudoMs);
  const nextIstPseudo = new Date(
    Date.UTC(
      istPseudo.getUTCFullYear(),
      istPseudo.getUTCMonth(),
      istPseudo.getUTCDate(),
      istPseudo.getUTCHours() + 1,
      0,
      0,
      0
    )
  );

  return nextIstPseudo.getTime() - istPseudoMs;
}

module.exports = { msUntilNextTopOfHour, IST_OFFSET_MS };
