const { classifyStatus } = require("./statusClassifier");

describe("classifyStatus", () => {
  test("returns available when both windows are well under threshold", () => {
    expect(classifyStatus(10, 20)).toBe("available");
  });

  test("returns available at exactly the 80% boundary (not yet low)", () => {
    expect(classifyStatus(80, 80)).toBe("available");
  });

  test("returns low when five-hour usage is just over 80%", () => {
    expect(classifyStatus(81, 10)).toBe("low");
  });

  test("returns low when seven-day usage is just over 80%", () => {
    expect(classifyStatus(10, 81)).toBe("low");
  });

  test("returns exhausted when five-hour usage is at 100%", () => {
    expect(classifyStatus(100, 50)).toBe("exhausted");
  });

  test("returns exhausted when five-hour usage is over 100%", () => {
    expect(classifyStatus(105, 0)).toBe("exhausted");
  });

  test("exhausted takes priority over low even if seven-day is also over 80%", () => {
    expect(classifyStatus(100, 95)).toBe("exhausted");
  });
});
