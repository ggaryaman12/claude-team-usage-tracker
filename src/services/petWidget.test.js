const { buildPetWidgetHtml, QUOTE_BANK } = require("./petWidget");

describe("QUOTE_BANK", () => {
  test("has a healthy variety of quotes/jokes to draw from", () => {
    expect(QUOTE_BANK.length).toBeGreaterThanOrEqual(10);
    expect(new Set(QUOTE_BANK).size).toBe(QUOTE_BANK.length); // no dupes
  });
});

describe("buildPetWidgetHtml", () => {
  test("renders all three pets: Claude, Codex, and Bug", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain('id="pet-claude"');
    expect(html).toContain('id="pet-codex"');
    expect(html).toContain('id="pet-bug"');
    expect(html).toContain("pet--claude");
    expect(html).toContain("pet--codex");
    expect(html).toContain("pet--bug");
  });

  test("embeds the given contextual lines for each pet into the script", () => {
    const html = buildPetWidgetHtml({
      claudeLines: ["Requesting access to Bob's account…"],
      codexLines: ["beep boop"],
      bugLines: ["squash me"],
    });
    expect(html).toContain("Requesting access to Bob");
    expect(html).toContain("beep boop");
    expect(html).toContain("squash me");
  });

  test("falls back to default lines for each pet when none are given", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("CLAUDE_LINES");
    expect(html).toContain("CODEX_LINES");
    expect(html).toContain("BUG_LINES");
    expect(html).toMatch(/var CLAUDE_LINES = \[".+"\]/);
    expect(html).toMatch(/var CODEX_LINES = \[".+"\]/);
    expect(html).toMatch(/var BUG_LINES = \[".+"\]/);
  });

  test("embeds the shared quote bank so pets have filler even with no page context", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("QUOTE_BANK");
    expect(html).toContain(QUOTE_BANK[0].replace(/\\/g, "\\\\").replace(/"/g, '\\"').split("\\")[0].slice(0, 10));
  });

  test("escapes double quotes and backslashes so the generated JS stays valid", () => {
    const html = buildPetWidgetHtml({ claudeLines: ['She said "hi" \\ bye'] });
    expect(html).toContain('She said \\"hi\\" \\\\ bye');
  });

  test("escapes angle brackets to prevent breaking out of the inline <script> tag", () => {
    const html = buildPetWidgetHtml({ claudeLines: ["</script><script>alert(1)</script>"] });
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  test("strips newlines from lines so they stay valid single JS string literals", () => {
    const html = buildPetWidgetHtml({ claudeLines: ["line one\nline two"] });
    expect(html).toContain("line one\\nline two");
  });

  test("renders original CSS-drawn critter shapes, not emoji glyphs", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("critter__body--claude");
    expect(html).toContain("critter__ear--l");
    expect(html).toContain("critter__body--codex");
    expect(html).toContain("critter__antenna");
    expect(html).toContain("critter__body--bug");
    expect(html).not.toContain("✳️");
    expect(html).not.toContain("⌨️");
    expect(html).not.toContain("🐛");
  });

  test("uses a diagonal-trot gait (paired legs stepping opposite each other) instead of a uniform bounce", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("leg-step-a");
    expect(html).toContain("leg-step-b");
    expect(html).toContain(":nth-of-type(1)");
    expect(html).toContain(":nth-of-type(4)");
  });

  test("distinguishes idle breathing from active walking, with anticipation and settle states", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("body-breathe");
    expect(html).toContain("is-anticipating");
    expect(html).toContain("is-walking");
    expect(html).toContain("is-settling");
    expect(html).toContain("pet-settle");
  });

  test("desyncs eye blinks per pet type instead of blinking in lockstep", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("eye-blink");
    expect(html).toContain(".pet--claude .critter__eye { animation-delay: 0s; }");
    expect(html).toContain(".pet--codex .critter__eye { animation-delay: 1.6s; }");
    expect(html).toContain(".pet--bug .critter__eye { animation-delay: 3.1s; }");
  });

  test("includes a tail wag for the claude critter and a ground contact shadow for all pets", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("critter__tail");
    expect(html).toContain("tail-wag");
    expect(html).toContain("pet__shadow");
    expect(html).toContain("shadow-walk");
  });

  test("bug legs layer a scuttle animation on top of their resting splay angle via a CSS custom property, not overwriting it", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("--r:20deg");
    expect(html).toContain("rotate(var(--r");
    expect(html).toContain("bug-scuttle-a");
  });

  test("transitions with an eased (non-linear) timing function, not constant-speed linear motion", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain("cubic-bezier");
    expect(html).not.toMatch(/transition:\s*left\s+[\d.]+s\s+linear/);
  });

  test("does not clip the speech bubble -- the pet layer has no overflow:hidden", () => {
    const html = buildPetWidgetHtml();
    const layerRuleMatch = html.match(/\.pet-layer\s*\{[^}]*\}/);
    expect(layerRuleMatch).not.toBeNull();
    expect(layerRuleMatch[0]).not.toContain("overflow");
  });

  test("includes single-click and double-click handling, plus a wandering loop, for each pet", () => {
    const html = buildPetWidgetHtml();
    expect(html).toContain('addEventListener("click"');
    expect(html).toContain("is-celebrating");
    expect(html).toContain("setInterval(walkToRandomSpot");
    // one function declaration + three invocations
    const setupCalls = (html.match(/setupPet\(/g) || []).length;
    expect(setupCalls).toBe(4);
  });
});
