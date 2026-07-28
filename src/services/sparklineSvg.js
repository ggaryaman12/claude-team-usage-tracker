// Tiny inline SVG sparkline — no charting library, no client JS, just a
// server-built <svg><polyline>. Keeps the dashboard cheap to run (this
// service has explicit memory/CPU caps) while still giving a real visual
// trend instead of only ever a single instantaneous percentage.

/**
 * @param {number[]} points - percentages (0-100), oldest first
 * @param {{width?: number, height?: number, color?: string}} [opts]
 * @returns {string|null} an <svg> string, or null if there's nothing
 *   meaningful to draw (need at least 2 points for a line)
 */
function buildSparklineSvg(points, opts = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const { width = 160, height = 36, color = "#1a73e8" } = opts;
  const scaleMax = 100; // fixed 0-100 pct scale keeps sparklines comparable across accounts

  const stepX = width / (points.length - 1);
  const coords = points
    .map((value, i) => {
      const clamped = Math.max(0, Math.min(scaleMax, value));
      const x = Math.round(i * stepX * 100) / 100;
      const y = Math.round((height - (clamped / scaleMax) * height) * 100) / 100;
      return `${x},${y}`;
    })
    .join(" ");

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" role="img" aria-label="usage trend">
    <polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>`;
}

module.exports = { buildSparklineSvg };
