// Cards v2 usage report — one row per account with a real "Request Access"
// button (openLink, not an action callback — Google Chat's inbound
// dispatch to this server was confirmed non-functional twice, and openLink
// needs no callback at all, so it works regardless). Shows real 5hr/7day
// usage — percentage plus a text progress bar (Cards v2 has no native bar
// widget) — when the account's local Claude Code hook has reported it
// recently (see usageReportComposer.js), otherwise a clear "no usage
// reports yet" or "stale" line instead of a made-up or missing number.
//
// Uses decoratedText's topLabel/text/bottomLabel fields instead of jamming
// everything into `text` with <br> — an earlier version rendered as a
// single truncated line ("Ayush...") because DecoratedText's `text` field
// doesn't wrap by default (wrapText must be explicitly set).

const { buildProgressBar } = require("./progressBar");
const { DEVICE_FRESHNESS_WINDOW_LABEL } = require("./deviceActivity");

const STATUS_EMOJI = { available: "🟢", low: "🟡", exhausted: "🔴" };

function buildUsageLine(result) {
  if (!result.hasReport) {
    return "No usage reports yet";
  }
  const emoji = STATUS_EMOJI[result.status] || "❓";
  const freshness = result.isFresh
    ? `as of ${result.ageMinutes}m ago`
    : `stale, last seen ${result.ageMinutes}m ago`;
  const fiveHourBar = buildProgressBar(result.fiveHourPctUsed);
  const sevenDayBar = buildProgressBar(result.sevenDayPctUsed);
  // When the known reset time for a window has already passed but nobody's
  // used the account since (so no fresh report ever confirmed it), the
  // percentage shown is inferred from that timestamp, not measured — say
  // so explicitly rather than silently showing a bare "0%" that looks
  // exactly like a real fresh reading.
  const fiveHourReset = result.fiveHourWasInferredReset
    ? ` <font color="#1e8e3e">— reset assumed, not yet confirmed by a report</font>`
    : result.fiveHourResetLabel
      ? ` <font color="#5f6368">— ${result.fiveHourResetLabel}</font>`
      : "";
  const sevenDayReset = result.sevenDayWasInferredReset
    ? ` <font color="#1e8e3e">— reset assumed, not yet confirmed by a report</font>`
    : result.sevenDayResetLabel
      ? ` <font color="#5f6368">— ${result.sevenDayResetLabel}</font>`
      : "";
  // Only worth interrupting the card for when it's actually notable: 2+
  // devices reporting for the same account within the freshness window
  // means it's genuinely in use from two places at once, not just that
  // someone owns two machines. Full per-device breakdown lives on the
  // dashboard; this is just the at-a-glance flag. Window stated explicitly
  // per the team's ask — "active" is meaningless without saying over what
  // span it was measured.
  const multiDeviceNote =
    result.activeCount > 1
      ? `<br><font color="#d93025">⚠️ ${result.activeCount} devices active in the ${DEVICE_FRESHNESS_WINDOW_LABEL}</font>`
      : "";
  return (
    `${emoji} 5hr  ${fiveHourBar} ${result.fiveHourPctUsed}%${fiveHourReset}<br>` +
    `   7day ${sevenDayBar} ${result.sevenDayPctUsed}%${sevenDayReset}<br>` +
    `(${freshness})${multiDeviceNote}`
  );
}

/**
 * @param {Array} results - from usageReportComposer.composeUsageResults():
 *   one per account, either {name, contact, hasReport: false} or the
 *   enriched shape with hasReport: true plus usage/freshness fields
 * @param {string} requestBaseUrl - e.g. https://your-domain.example.com/claude-usage-bot/request
 * @param {string} [dashboardUrl] - e.g. https://your-domain.example.com/claude-usage-bot/dashboard;
 *   optional so existing callers/tests that don't care about this link keep working
 * @param {string} [teamPassword] - shown next to the dashboard button so the
 *   login page's "check the most recent hourly usage post" hint is actually true
 * @returns {{text: string}|{cardsV2: Array}} full Chat message body
 */
function buildUsageReportCardMessage(results, requestBaseUrl, dashboardUrl, teamPassword) {
  if (!results || results.length === 0) {
    return { text: "No Claude accounts configured." };
  }

  const widgets = results.map((result) => ({
    decoratedText: {
      topLabel: result.name,
      text: buildUsageLine(result),
      bottomLabel: result.contact,
      wrapText: true,
      button: {
        text: "Request Access",
        onClick: {
          openLink: {
            url: `${requestBaseUrl}?account=${encodeURIComponent(result.name)}`,
          },
        },
      },
    },
  }));

  // Cards v2 header.subtitle is plain text only — can't carry a real link —
  // so the dashboard link is a proper button widget instead, placed first
  // so it's the first thing anyone sees under the header.
  if (dashboardUrl) {
    widgets.unshift({
      buttonList: {
        buttons: [
          {
            text: "📊 Open full dashboard",
            onClick: { openLink: { url: dashboardUrl } },
          },
        ],
      },
    });
    if (teamPassword) {
      widgets.unshift({
        decoratedText: {
          text: `🔑 Dashboard password: <b>${teamPassword}</b>`,
          wrapText: true,
        },
      });
    }
  }

  return {
    cardsV2: [
      {
        cardId: `usage-report-${Date.now()}`,
        card: {
          header: {
            title: "Claude Accounts",
            subtitle: `${results.length} configured`,
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

module.exports = { buildUsageReportCardMessage };
