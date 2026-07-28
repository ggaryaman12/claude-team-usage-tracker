const { buildSparklineSvg } = require("./sparklineSvg");

describe("buildSparklineSvg", () => {
  test("returns null for fewer than 2 points -- nothing to draw a line between", () => {
    expect(buildSparklineSvg([])).toBeNull();
    expect(buildSparklineSvg([50])).toBeNull();
    expect(buildSparklineSvg(null)).toBeNull();
  });

  test("draws an svg polyline with one coordinate pair per point", () => {
    const svg = buildSparklineSvg([10, 50, 90]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polyline");
    const pointsAttr = svg.match(/points="([^"]+)"/)[1];
    expect(pointsAttr.trim().split(" ")).toHaveLength(3);
  });

  test("clamps out-of-range values into the 0-100 drawable area", () => {
    const svg = buildSparklineSvg([-20, 150]);
    expect(svg).toContain("<polyline");
    // shouldn't throw or produce NaN coordinates
    expect(svg).not.toContain("NaN");
  });

  test("respects custom width/height/color", () => {
    const svg = buildSparklineSvg([10, 90], { width: 80, height: 20, color: "#d93025" });
    expect(svg).toContain('width="80"');
    expect(svg).toContain('height="20"');
    expect(svg).toContain("#d93025");
  });
});
