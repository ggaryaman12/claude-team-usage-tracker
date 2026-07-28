const { buildProgressBar, BAR_LENGTH } = require("./progressBar");

describe("buildProgressBar", () => {
  test("renders an empty bar at 0%", () => {
    expect(buildProgressBar(0)).toBe("░".repeat(BAR_LENGTH));
  });

  test("renders a full bar at 100%", () => {
    expect(buildProgressBar(100)).toBe("█".repeat(BAR_LENGTH));
  });

  test("renders a half-filled bar at 50%", () => {
    expect(buildProgressBar(50)).toBe("█████░░░░░");
  });

  test("rounds to the nearest block for a non-round percentage", () => {
    expect(buildProgressBar(44)).toBe("████░░░░░░"); // 4.4 -> rounds to 4
  });

  test("clamps values above 100 to a full bar", () => {
    expect(buildProgressBar(150)).toBe("█".repeat(BAR_LENGTH));
  });

  test("clamps negative values to an empty bar", () => {
    expect(buildProgressBar(-10)).toBe("░".repeat(BAR_LENGTH));
  });

  test("always returns a string of the fixed bar length", () => {
    expect(buildProgressBar(37).length).toBe(BAR_LENGTH);
  });
});
