const { buildAdminDevicesHtml } = require("./adminDevicesPageBuilder");

const GENERATED_AT = "2026-07-28T08:00:00.000Z";

function baseRow(overrides = {}) {
  return {
    deviceId: "dev1",
    label: "Alices-Laptop (darwin)",
    accountNames: ["Alice"],
    reportCount: 5,
    minFiveHourPctUsed: 10,
    avgFiveHourPctUsed: 40,
    maxFiveHourPctUsed: 90,
    minSevenDayPctUsed: 15,
    avgSevenDayPctUsed: 20,
    maxSevenDayPctUsed: 55,
    lastFiveHourPctUsed: 60,
    lastSevenDayPctUsed: 25,
    lastReportedAt: "2026-07-28T07:00:00.000Z",
    lastSeenMinutesAgo: 60,
    isLive: false,
    firstReportedAt: "2026-07-26T07:00:00.000Z",
    exhaustedCount: 0,
    lowCount: 0,
    availableCount: 5,
    reportsPerDay: 2,
    peakHourLabel: "around 2 PM IST",
    hourlyDistribution: new Array(24).fill(0).map((_, i) => (i === 14 ? 3 : 0)),
    sparklinePoints: [10, 40, 60],
    sevenDaySparklinePoints: [15, 20, 25],
    recentCheckIns: [
      { reportedAt: "2026-07-28T07:00:00.000Z", fiveHourPctUsed: 60, sevenDayPctUsed: 25, status: "available" },
      { reportedAt: "2026-07-28T06:00:00.000Z", fiveHourPctUsed: 40, sevenDayPctUsed: 20, status: "available" },
    ],
    ...overrides,
  };
}

function basePerson(overrides = {}) {
  return {
    name: "Alice",
    contact: "@alice",
    deviceCount: 1,
    totalCheckIns: 5,
    currentFiveHourPctUsed: 40,
    currentSevenDayPctUsed: 20,
    avgFiveHourPctUsed: 30,
    maxFiveHourPctUsed: 60,
    exhaustedCount: 0,
    ...overrides,
  };
}

function build(rows, personRows = [], generatedAtIso = GENERATED_AT) {
  return buildAdminDevicesHtml(rows, personRows, generatedAtIso);
}

describe("buildAdminDevicesHtml", () => {
  test("shows a no-data message for an empty rows array", () => {
    const html = build([]);
    expect(html).toContain("No device check-ins yet.");
  });

  test("summary strip counts devices, live, check-ins, and shared devices", () => {
    const html = build([
      baseRow({ isLive: true }),
      baseRow({ deviceId: "dev2", accountNames: ["Alice", "Bob"], isLive: false }),
    ]);
    expect(html).toMatch(/<strong>2<\/strong> devices/);
    expect(html).toMatch(/<strong>1<\/strong> live now/);
    expect(html).toMatch(/<strong>10<\/strong> check-ins/);
    expect(html).toMatch(/<strong>1<\/strong> shared devices/);
  });

  test("leads with the device name as the heading, account(s) as a secondary line", () => {
    const html = build([baseRow()]);
    expect(html).toMatch(/<div class="device-name">Alices-Laptop \(darwin\)<\/div>/);
    expect(html).toMatch(/<div class="who">used by: Alice<\/div>/);
  });

  test("shows a live badge when isLive, an idle badge otherwise", () => {
    const live = build([baseRow({ isLive: true })]);
    expect(live).toContain('<span class="live-badge">');
    expect(live).not.toContain('<span class="idle-badge">');

    const idle = build([baseRow({ isLive: false, lastSeenMinutesAgo: 42 })]);
    expect(idle).toContain("idle 42m");
  });

  test("shows a progress bar with min/avg/peak for both usage windows", () => {
    const html = build([baseRow()]);
    expect(html).toContain("5HR");
    expect(html).toContain("60%");
    expect(html).toContain("min 10% · avg 40% · peak 90%");
    expect(html).toContain("7DAY");
    expect(html).toContain("25%");
    expect(html).toContain("min 15% · avg 20% · peak 55%");
  });

  test("renders both a 5hr and 7day sparkline when there are enough points", () => {
    const html = build([baseRow()]);
    const svgCount = (html.match(/<svg/g) || []).length;
    expect(svgCount).toBeGreaterThanOrEqual(2);
    expect(html).toContain("5hr trend");
    expect(html).toContain("7day trend");
  });

  test("renders a 24-cell hourly activity heatmap", () => {
    const html = build([baseRow()]);
    const cellCount = (html.match(/class="heat-cell"/g) || []).length;
    expect(cellCount).toBe(24);
  });

  test("renders a segmented status bar reflecting available/low/exhausted proportions", () => {
    const html = build([baseRow({ availableCount: 2, lowCount: 1, exhaustedCount: 1 })]);
    expect(html).toContain("status-bar__seg");
    expect(html).toContain('title="2 available · 1 low · 1 exhausted"');
  });

  test("omits the status bar entirely when there's no status data", () => {
    const html = build([baseRow({ availableCount: 0, lowCount: 0, exhaustedCount: 0 })]);
    expect(html).not.toContain("status-bar__seg");
  });

  test("renders an expandable raw check-in log with time/5hr/7day/status columns", () => {
    const html = build([baseRow()]);
    expect(html).toContain("raw check-in log (2)");
    expect(html).toContain('<table class="log-table">');
  });

  test("meta line shows check-ins, per-day rate, peak-hour, and since-date", () => {
    const html = build([baseRow()]);
    expect(html).toMatch(/5 check-ins · ~2\/day · peak around 2 PM IST · since 26 Jul/);
  });

  test("omits per-day rate and peak-hour cleanly from the meta line when null", () => {
    const html = build([baseRow({ reportsPerDay: null, peakHourLabel: null })]);
    expect(html).toMatch(/5 check-ins · since 26 Jul/);
    expect(html).not.toContain("/day");
    expect(html).not.toContain("peak around");
  });

  test("flags a device used across multiple accounts", () => {
    const html = build([baseRow({ accountNames: ["Alice", "Bob"] })]);
    expect(html).toContain("Alice + Bob");
    expect(html).toContain("⚠ 2 accounts");
  });

  test("HTML-escapes device labels and account names", () => {
    const html = build([baseRow({ label: "<script>alert(1)</script>", accountNames: ["<b>Alice</b>"] })]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("renders a 'who's using how much' person table when personRows are given", () => {
    const html = build([baseRow()], [basePerson()]);
    expect(html).toContain("who's using how much");
    expect(html).toContain("Alice");
    expect(html).toContain("@alice");
    expect(html).toContain("40%"); // current 5hr
    expect(html).toContain("20%"); // current 7day
    expect(html).toContain("30%"); // avg
    expect(html).toContain("60%"); // peak
  });

  test("shows an em-dash for a person with no reports yet, instead of a bare 'null'", () => {
    const html = build(
      [],
      [basePerson({ currentFiveHourPctUsed: null, currentSevenDayPctUsed: null, avgFiveHourPctUsed: null, maxFiveHourPctUsed: null, totalCheckIns: 0, deviceCount: 0 })]
    );
    expect(html).toContain("—");
    expect(html).not.toContain("nullnull");
  });

  test("flags exhausted count per person when nonzero", () => {
    const html = build([], [basePerson({ exhaustedCount: 3 })]);
    expect(html).toContain("3×");
  });

  test("omits the person table entirely when there are no accounts", () => {
    const html = build([baseRow()], []);
    expect(html).not.toContain("who's using how much");
  });

  test("renders a 'by device' summary table keyed by device, not account", () => {
    const html = build([baseRow(), baseRow({ deviceId: "dev2", label: "Bobs-PC (win32)", lastFiveHourPctUsed: 95 })]);
    expect(html).toContain("by device (busiest first)");
    expect(html).toContain("Alices-Laptop (darwin)");
    expect(html).toContain("Bobs-PC (win32)");
  });

  test("device table sorts busiest-first by current 5hr usage", () => {
    const html = build([
      baseRow({ deviceId: "dev-low", label: "Low-Device", lastFiveHourPctUsed: 5 }),
      baseRow({ deviceId: "dev-high", label: "High-Device", lastFiveHourPctUsed: 95 }),
    ]);
    const lowIndex = html.indexOf("Low-Device");
    const highIndex = html.indexOf("High-Device");
    expect(highIndex).toBeGreaterThan(-1);
    expect(lowIndex).toBeGreaterThan(highIndex);
  });

  test("device table flags a shared device with the account count", () => {
    const html = build([baseRow({ accountNames: ["Alice", "Bob"] })]);
    expect(html).toContain("Alice, Bob");
    expect(html).toContain("(2)");
  });

  test("device table shows live/idle status per row", () => {
    const html = build([baseRow({ isLive: true })]);
    expect(html).toContain(">live<");
  });

  test("omits the device table entirely when there are no device rows", () => {
    const html = build([]);
    expect(html).not.toContain("by device (busiest first)");
  });
});
