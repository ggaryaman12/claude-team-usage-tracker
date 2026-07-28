// Three small animated "pet" mascots that wander around the bottom of the
// page and occasionally say something in a speech bubble: either a
// page-relevant line passed in by the caller, or a random coding
// quote/joke from the shared bank below. Purely decorative/UI-flavor: no
// tracking, no external assets, no dependencies. Injected into every
// page's <body> (see the page builder modules) via buildPetWidgetHtml().
//
// The three critters are original, simplified CSS-drawn shapes loosely in
// the spirit of well-known AI-assistant mascots (a blocky orange creature
// for Claude, a friendly rounded robot for Codex) WITHOUT tracing or
// reproducing anyone's actual copyrighted/trademarked character art --
// these are hand-built from plain <div>s (ears, square eyes, stub legs /
// a screen face + antenna), not an image asset, so there's nothing to
// "copy" pixel-for-pixel in the first place.
//
// Movement is modeled on how real quadrupeds actually walk (a diagonal
// trot gait -- front-left+back-right swing together, opposite the
// front-right+back-left pair) rather than a uniform bounce, plus:
//   - a brief anticipation squash before setting off, and an elastic
//     overshoot "settle" on arrival (real animals don't stop instantly)
//   - idle breathing (a slow scale pulse) instead of animating even when
//     standing still
//   - independent eye blinks, ear twitches, and tail wag, each pet
//     desynced from the others so they don't all move in lockstep
//   - an ellipse "contact shadow" under each pet, squashing/relaxing in
//     time with the gait, to sell the sense of weight on the ground
// All still pure CSS keyframes + one JS loop -- no video, no sprite
// sheet, no external library.
//
// Deliberately framework-free: a single <style> + three <div>s + one
// <script> block, consistent with the rest of this project's "no build
// step" pages.
//
// Interaction: click a pet for a quick line; double-click for a bigger
// reaction (a little celebration wiggle + a joke).

// Shared filler bank so every pet has something to say even without any
// page-specific context, and so repeat visits don't always show the same
// handful of lines. Deliberately kept short and dev-culture flavored
// rather than generic inspirational-poster quotes.
const QUOTE_BANK = [
  "\"It works on my machine.\" — every developer, ever",
  "There are only two hard problems in computer science: cache invalidation and naming things.",
  "99 little bugs in the code, 99 little bugs. Take one down, patch it around, 127 little bugs in the code.",
  "A SQL query walks into a bar, walks up to two tables and asks: \"Can I join you?\"",
  "Programs must be written for people to read, and only incidentally for machines to execute. — Harold Abelson",
  "I don't always test my code, but when I do, I do it in production.",
  "Weeks of coding can save you hours of planning.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "The best error message is the one that never shows up. — Thomas Fuchs",
  "!false — it's funny because it's true.",
  "Real programmers count from 0.",
  "In order to understand recursion, you must first understand recursion.",
  "A good programmer looks both ways before crossing a one-way street.",
  "Debugging is like being the detective in a crime movie where you're also the murderer.",
  "There's no place like 127.0.0.1.",
  "Simplicity is prerequisite for reliability. — Edsger Dijkstra",
  "Why do Java developers wear glasses? Because they don't C#.",
  "A byte walks into a bar looking miserable. The bartender asks what's wrong. It says, \"parity error.\"",
  "There are 10 types of people: those who understand binary, and those who don't.",
  "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
  "To understand what recursion is, you must first understand recursion.",
  "Programming is 10% writing code and 90% figuring out why it doesn't work.",
  "Any fool can write code a computer understands. Good programmers write code humans understand. — Martin Fowler",
  "Optimism is an occupational hazard of programming; feedback is the treatment. — Kent Beck",
  "First, solve the problem. Then, write the code. — John Johnson",
  "Talk is cheap. Show me the code. — Linus Torvalds",
  "A user interface is like a joke: if you have to explain it, it's not that good.",
  "Deleted code is debugged code. — Jeff Sickel",
  "The most disastrous thing you can ever learn is your first programming language. — Alan Kay",
  "Software and cathedrals are much the same — first we build them, then we pray. — Sam Redwine",
  "Measuring programming progress by lines of code is like measuring aircraft progress by weight. — Bill Gates",
  "Why do programmers hate nature? Too many bugs and no debugger.",
  "There's nothing more permanent than a temporary fix.",
  "The code you write makes you a programmer. The code you delete makes you a good one.",
  "It's not a bug, it's an undocumented feature.",
  "Teach a man to fish and he'll stop asking you for fish. Teach him to code and he'll ask why the fish API is down.",
  "Comments are a chance for you to help the compiler know what you meant.",
  "Two threads walk into a bar — the second one waits for the first to unlock it.",
  "I would love to change the world, but they won't give me the source code.",
  "The best thing about a boolean is even if you're wrong, you're only off by a bit.",
  "Software is like sex: it's better when it's free. — Linus Torvalds",
  "Walking on water and developing software from a specification are easy if both are frozen.",
  "Testing leads to failure, and failure leads to understanding. — Burt Rutan",
  "Documentation is like sex: when it's good, it's very good; when it's bad, it's better than nothing.",
  "One man's crappy software is another man's full-time job.",
  "Perfection is achieved not when there's nothing more to add, but nothing left to take away. — Antoine de Saint-Exupéry",
  "The function of good software is to make the complex appear simple. — Grady Booch",
  "Before software can be reusable it first has to be usable. — Ralph Johnson",
  "Sometimes it pays to stay in bed on Monday rather than debug Monday's code all week. — Dan Salomon",
  "The most efficient debugging tool is still careful thought, plus a well-placed print statement. — Brian Kernighan",
  "A great API is one that gets out of your way. — Anonymous",
  "There is no code faster than no code.",
  "console.log('are you there?') — the loneliest debugging technique.",
  "Why did the developer go broke? Because he used up all his cache.",
  "Why did the programmer quit his job? He didn't get arrays.",
  "How do you comfort a JavaScript bug? You console it.",
  "An SQL query goes into a bar, sees two tables and asks, \"May I join you?\"",
  "The generation of random numbers is too important to be left to chance. — Robert R. Coveyou",
  "Good code is its own best documentation. — Steve McConnell",
  "Always code as if the person who ends up maintaining it is a violent psychopath who knows where you live.",
  "It's a feature, not a bug — most of the time.",
  "There are two ways to write error-free programs; only the third one works.",
  "Why do programmers always mix up Halloween and Christmas? Because Oct 31 == Dec 25.",
  "If debugging removes bugs, programming must be what puts them in. — Edsger Dijkstra",
  "You can never tell what a programmer is doing until it's too late. — Seymour Cray",
  "There are two kinds of programming languages: those people complain about and those nobody uses.",
  "Knock knock. Who's there? *very long pause* ... Java.",
  "It compiles! Ship it.",
  "A commit message is worth a thousand \"fix stuff\" commits.",
  "Real developers don't comment their code — if it was hard to write, it should be hard to understand.",
  "Programming is like writing a book, except if you miss a single comma the whole thing makes no sense.",
  "Version control: because \"final_v2_FINAL_reallyfinal.js\" wasn't cutting it anymore.",
  "The best way to predict the future is to implement it. — David Heinemeier Hansson (paraphrased)",
  "Every great developer you know got there by solving problems they were unqualified to solve — until they did.",
  "Fix the cause, not the symptom.",
  "One person's constant is another person's variable. — Alan Perlis",
  "It's easier to ask forgiveness than it is to get permission. — Grace Hopper",
  "The most damaging phrase in the language is: \"We've always done it this way.\" — Grace Hopper",
  "A ship in port is safe, but that's not what ships are built for. — Grace Hopper (on shipping software)",
  "You can't have great software without a great team. — Xavier Noria",
  "Truth can only be found in one place: the code. — Robert C. Martin",
  "Clean code always looks like it was written by someone who cares. — Robert C. Martin",
  "First make it work, then make it right, then make it fast. — Kent Beck",
  "Code you haven't touched in six months might as well have been written by a stranger.",
  "There has never been a language in which it's hard to write bad code. — Flon's Law",
  "Good judgment comes from experience, and experience comes from bad judgment.",
  "The only way to go fast is to go well. — Robert C. Martin",
  "Premature optimization is the root of all evil. — Donald Knuth",
];

function escapeJsString(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\r?\n/g, "\\n");
}

function toJsArrayLiteral(lines) {
  return "[" + lines.map((line) => `"${escapeJsString(line)}"`).join(",") + "]";
}

// Original, simplified critter markup -- plain nested <div>s (body, ears/
// antenna, eyes, legs, tail), not an image or SVG trace of any existing
// character. See file header for why. Legs are ordered front-to-back,
// left-to-right so the CSS diagonal-trot selectors (nth-of-type) pair the
// right ones together: leg 1 (front-left) steps with leg 4 (back-right),
// leg 2 (front-right) steps with leg 3 (back-left) -- how real quadrupeds
// actually trot.
const CLAUDE_CRITTER_HTML = `<div class="critter">
    <div class="critter__ear critter__ear--l"></div>
    <div class="critter__ear critter__ear--r"></div>
    <div class="critter__tail"></div>
    <div class="critter__body critter__body--claude">
      <div class="critter__eye critter__eye--l"></div>
      <div class="critter__eye critter__eye--r"></div>
    </div>
    <div class="critter__arm critter__arm--l"></div>
    <div class="critter__arm critter__arm--r"></div>
    <div class="critter__leg critter__leg--claude" style="left:6px"></div>
    <div class="critter__leg critter__leg--claude" style="left:15px"></div>
    <div class="critter__leg critter__leg--claude" style="left:24px"></div>
    <div class="critter__leg critter__leg--claude" style="left:33px"></div>
  </div>`;

const CODEX_CRITTER_HTML = `<div class="critter">
    <div class="critter__antenna"></div>
    <div class="critter__body critter__body--codex">
      <div class="critter__eye critter__eye--codex critter__eye--l"></div>
      <div class="critter__eye critter__eye--codex critter__eye--r"></div>
    </div>
    <div class="critter__leg critter__leg--codex" style="left:11px"></div>
    <div class="critter__leg critter__leg--codex" style="left:26px"></div>
  </div>`;

// Each bug leg's resting splay angle is set via the --r custom property
// (not a plain inline transform) so the walking keyframes can layer a
// scuttle motion on top of that base angle instead of overwriting it.
const BUG_CRITTER_HTML = `<div class="critter">
    <div class="critter__antenna critter__antenna--bug critter__antenna--l"></div>
    <div class="critter__antenna critter__antenna--bug critter__antenna--r"></div>
    <div class="critter__body critter__body--bug">
      <div class="critter__eye critter__eye--bug critter__eye--l"></div>
      <div class="critter__eye critter__eye--bug critter__eye--r"></div>
    </div>
    <div class="critter__leg critter__leg--bug" style="left:2px;--r:20deg"></div>
    <div class="critter__leg critter__leg--bug" style="left:10px;--r:8deg"></div>
    <div class="critter__leg critter__leg--bug" style="left:18px;--r:-8deg"></div>
    <div class="critter__leg critter__leg--bug" style="left:26px;--r:-20deg"></div>
  </div>`;

/**
 * @param {{claudeLines?: string[], codexLines?: string[], bugLines?: string[]}} [options]
 *   Context-relevant lines each pet can say, e.g. on the request page:
 *   claudeLines: ["Requesting access to Bob's account…"]. Each pet also
 *   draws from the shared QUOTE_BANK, so these don't need to be exhaustive.
 * @returns {string} a self-contained block to inject right before </body>
 */
function buildPetWidgetHtml(options = {}) {
  const claudeLines = options.claudeLines && options.claudeLines.length
    ? options.claudeLines
    : ["Hi! I'm keeping an eye on usage.", "Everything looks fine over here."];
  const codexLines = options.codexLines && options.codexLines.length
    ? options.codexLines
    : ["beep boop. monitoring.", "01001000 01101001"];
  const bugLines = options.bugLines && options.bugLines.length
    ? options.bugLines
    : ["I'm not a feature.", "Squash me if you can.", "It's not a bug, it's a surprise."];

  return `<style>
  /* No overflow:hidden here -- a wrapped, multi-line speech bubble needs to
     be able to pop up above this layer's own box without getting clipped;
     the layer stays full-width/fixed-to-bottom either way since pets are
     clamped to the viewport width in JS (maxLeft()). */
  .pet-layer { position: fixed; left: 0; right: 0; bottom: 0; height: 66px; pointer-events: none; z-index: 9999; }
  /* cubic-bezier eases in and out of each walk instead of constant-speed
     linear motion -- real movement accelerates out of a stop and decelerates
     into the next one. */
  .pet { position: absolute; bottom: 12px; left: 0; width: 46px; height: 50px; pointer-events: auto; cursor: pointer; transition: left 3.5s cubic-bezier(0.45,0,0.4,1); will-change: left, transform; }
  .pet.is-facing-left { transform: scaleX(-1); }
  .pet.is-celebrating .critter { animation: pet-celebrate 0.5s ease-in-out 2 !important; }

  /* Ground contact shadow -- squashes/relaxes with the gait so the pet
     reads as having weight instead of floating. */
  .pet__shadow {
    position: absolute; bottom: -2px; left: 50%; width: 26px; height: 6px;
    background: radial-gradient(ellipse, rgba(0,0,0,0.4), transparent 72%);
    transform: translateX(-50%); animation: shadow-idle 2.6s ease-in-out infinite;
  }
  .pet.is-walking .pet__shadow { animation: shadow-walk 0.34s ease-in-out infinite; }
  @keyframes shadow-idle { 0%, 100% { transform: translateX(-50%) scaleX(1); opacity: 0.9; } 50% { transform: translateX(-50%) scaleX(0.94); opacity: 0.75; } }
  @keyframes shadow-walk { 0%, 100% { transform: translateX(-50%) scaleX(0.8); opacity: 0.55; } 50% { transform: translateX(-50%) scaleX(1.05); opacity: 0.9; } }

  /* Idle = slow breathing scale on the body only (legs/ears/tail stay put
     so it doesn't read as bouncing while standing still). Walking swaps
     to a tighter bob timed to the step cadence. Anticipation is a brief
     pre-launch squash; settling is a spring overshoot on arrival --
     neither instant start nor instant stop, like a real animal. */
  .critter { position: relative; width: 100%; height: 100%; filter: drop-shadow(0 5px 5px rgba(0,0,0,0.32)); transform-origin: 50% 100%; }
  .critter__body--claude, .critter__body--codex, .critter__body--bug { animation: body-breathe 2.6s ease-in-out infinite; transform-origin: 50% 100%; }
  .pet.is-walking .critter { animation: pet-walk-bob 0.34s ease-in-out infinite; }
  .pet.is-walking .critter__body--claude, .pet.is-walking .critter__body--codex, .pet.is-walking .critter__body--bug { animation: none; }
  .pet.is-anticipating .critter { transform: scaleY(0.88) scaleX(1.08); transition: transform 0.14s ease-out; }
  .pet.is-settling .critter { animation: pet-settle 0.42s cubic-bezier(0.34,1.56,0.64,1) 1; }
  @keyframes body-breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.035); } }
  @keyframes pet-walk-bob { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(-2deg); } }
  @keyframes pet-settle { 0% { transform: scaleY(0.85) scaleX(1.1); } 45% { transform: scaleY(1.08) scaleX(0.95); } 70% { transform: scaleY(0.97) scaleX(1.02); } 100% { transform: scaleY(1) scaleX(1); } }
  @keyframes pet-celebrate { 0%, 100% { transform: translateY(0) rotate(0deg) scale(1); } 25% { transform: translateY(-14px) rotate(-12deg) scale(1.15); } 75% { transform: translateY(-14px) rotate(12deg) scale(1.15); } }

  /* Eye blinks -- desynced per pet type so all three don't blink in
     lockstep, which is what would read as fake/robotic. */
  .critter__eye { animation: eye-blink 4.6s ease-in-out infinite; }
  .pet--claude .critter__eye { animation-delay: 0s; }
  .pet--codex .critter__eye { animation-delay: 1.6s; }
  .pet--bug .critter__eye { animation-delay: 3.1s; }
  @keyframes eye-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.15); } }

  /* --- Claude critter: blocky rounded body, ear twitch, tail wag, square eyes, stub legs + arms --- */
  .critter__body--claude {
    position: absolute; left: 4px; top: 10px; width: 38px; height: 26px;
    background: linear-gradient(160deg, #f0a988, #da7756 55%, #c05f3f);
    border-radius: 45% 45% 35% 35% / 60% 60% 30% 30%;
  }
  .critter__ear { position: absolute; top: 2px; width: 11px; height: 11px; background: #da7756; border-radius: 60% 60% 60% 10%; }
  .critter__ear--l { left: 3px; transform-origin: 80% 80%; animation: ear-twitch-l 5.4s ease-in-out infinite; }
  .critter__ear--r { right: 3px; transform-origin: 20% 80%; animation: ear-twitch-r 6.2s ease-in-out infinite 0.8s; }
  @keyframes ear-twitch-l { 0%, 90%, 100% { transform: rotate(-25deg); } 93% { transform: rotate(-38deg); } 96% { transform: rotate(-18deg); } }
  @keyframes ear-twitch-r { 0%, 90%, 100% { transform: rotate(25deg) scaleX(-1); } 93% { transform: rotate(38deg) scaleX(-1); } 96% { transform: rotate(18deg) scaleX(-1); } }
  .critter__tail { position: absolute; right: -7px; top: 15px; width: 11px; height: 5px; background: #c05f3f; border-radius: 6px 3px 3px 6px; transform-origin: 0% 50%; animation: tail-wag 1.7s ease-in-out infinite; }
  .pet.is-walking .critter__tail { animation-duration: 0.38s; }
  @keyframes tail-wag { 0%, 100% { transform: rotate(-14deg); } 50% { transform: rotate(16deg); } }
  .critter__eye--l, .critter__eye--r { position: absolute; top: 9px; width: 5px; height: 6px; background: #2a1810; border-radius: 1px; }
  .critter__eye--l { left: 9px; }
  .critter__eye--r { right: 9px; }
  .critter__arm { position: absolute; top: 14px; width: 6px; height: 9px; background: #c05f3f; border-radius: 3px; }
  .critter__arm--l { left: -1px; transform: rotate(18deg); }
  .critter__arm--r { right: -1px; transform: rotate(-18deg); }
  .critter__leg--claude { position: absolute; bottom: 2px; width: 6px; height: 8px; background: #c05f3f; border-radius: 2px; transform-origin: 50% 0%; }
  /* diagonal trot: leg 1 (front-left) + leg 4 (back-right) swing together,
     opposite leg 2 (front-right) + leg 3 (back-left) */
  .pet--claude.is-walking .critter__leg--claude:nth-of-type(1),
  .pet--claude.is-walking .critter__leg--claude:nth-of-type(4) { animation: leg-step-a 0.34s ease-in-out infinite; }
  .pet--claude.is-walking .critter__leg--claude:nth-of-type(2),
  .pet--claude.is-walking .critter__leg--claude:nth-of-type(3) { animation: leg-step-b 0.34s ease-in-out infinite; }
  @keyframes leg-step-a { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(14deg); } }
  @keyframes leg-step-b { 0%, 100% { transform: translateY(-3px) rotate(-14deg); } 50% { transform: translateY(0) rotate(0deg); } }

  /* --- Codex critter: rounded robot body, sleepy screen-eyes, antenna, alternating hop-step legs --- */
  .critter__body--codex {
    position: absolute; left: 5px; top: 8px; width: 36px; height: 32px;
    background: linear-gradient(160deg, #8be9d0, #10a37f 60%, #0d8567);
    border-radius: 42%;
  }
  .critter__antenna { position: absolute; left: 50%; top: -2px; width: 2px; height: 9px; background: #0d8567; transform: translateX(-50%); animation: antenna-sway 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
  .critter__antenna::after { content: ""; position: absolute; top: -4px; left: 50%; width: 5px; height: 5px; border-radius: 50%; background: #6be3c4; transform: translateX(-50%); }
  @keyframes antenna-sway { 0%, 100% { transform: translateX(-50%) rotate(-6deg); } 50% { transform: translateX(-50%) rotate(6deg); } }
  .critter__eye--codex { top: 18px; width: 8px; height: 4px; border-radius: 0 0 8px 8px; background: #06291f; }
  .critter__eye--codex.critter__eye--l { left: 10px; }
  .critter__eye--codex.critter__eye--r { right: 10px; }
  .critter__leg--codex { position: absolute; bottom: 1px; width: 7px; height: 6px; background: #0d8567; border-radius: 2px; transform-origin: 50% 0%; }
  .pet--codex.is-walking .critter__leg--codex:nth-of-type(1) { animation: leg-step-a 0.3s ease-in-out infinite; }
  .pet--codex.is-walking .critter__leg--codex:nth-of-type(2) { animation: leg-step-b 0.3s ease-in-out infinite; }

  /* --- Bug critter: small oval body, antennae, thin splayed legs that scuttle fast --- */
  .critter__body--bug {
    position: absolute; left: 7px; top: 16px; width: 26px; height: 18px;
    background: radial-gradient(circle at 35% 30%, #ff9a9e, #e0457b 65%, #b8285f);
    border-radius: 50%;
  }
  .critter__eye--bug { top: 21px; width: 4px; height: 4px; border-radius: 50%; background: #3a0d1f; }
  .critter__eye--bug.critter__eye--l { left: 12px; }
  .critter__eye--bug.critter__eye--r { right: 12px; }
  .critter__antenna--bug { position: absolute; top: 12px; width: 2px; height: 9px; background: #e0457b; border-radius: 1px; transform-origin: 50% 100%; animation: antenna-twitch 2.4s ease-in-out infinite; }
  .critter__antenna--bug::after { content: ""; position: absolute; top: -3px; left: 50%; width: 4px; height: 4px; border-radius: 50%; background: #ff9a9e; transform: translateX(-50%); }
  .critter__antenna--bug.critter__antenna--l { left: 11px; transform: rotate(-25deg); }
  .critter__antenna--bug.critter__antenna--r { right: 11px; transform: rotate(25deg); animation-delay: 0.3s; }
  @keyframes antenna-twitch { 0%, 100% { transform: rotate(-25deg); } 50% { transform: rotate(-15deg); } }
  .critter__leg--bug { position: absolute; bottom: 8px; width: 2px; height: 9px; background: #b8285f; border-radius: 1px; transform-origin: top center; transform: rotate(var(--r, 0deg)); }
  .pet--bug.is-walking .critter__leg--bug:nth-of-type(1),
  .pet--bug.is-walking .critter__leg--bug:nth-of-type(3) { animation: bug-scuttle-a 0.16s ease-in-out infinite; }
  .pet--bug.is-walking .critter__leg--bug:nth-of-type(2),
  .pet--bug.is-walking .critter__leg--bug:nth-of-type(4) { animation: bug-scuttle-b 0.16s ease-in-out infinite; }
  @keyframes bug-scuttle-a { 0%, 100% { transform: rotate(var(--r,0deg)) translateY(0); } 50% { transform: rotate(var(--r,0deg)) translateY(-2.5px); } }
  @keyframes bug-scuttle-b { 0%, 100% { transform: rotate(var(--r,0deg)) translateY(-2.5px); } 50% { transform: rotate(var(--r,0deg)) translateY(0); } }

  .pet__bubble {
    position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%) translateY(6px);
    background: var(--card-bg, #242019); color: var(--text, #f0e9e0); border: 1px solid var(--border, #3a332a);
    border-radius: 10px; padding: 6px 10px; font-size: 0.74rem; line-height: 1.35;
    white-space: normal; width: max-content; max-width: 220px; text-align: center;
    box-shadow: 0 8px 20px -10px rgba(0,0,0,0.5);
    opacity: 0; visibility: hidden; transition: opacity 0.2s ease, transform 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .pet__bubble.is-visible { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
  .pet__bubble::after {
    content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    border: 6px solid transparent; border-top-color: var(--border, #3a332a);
  }
  @media (max-width: 640px) { .pet-layer { display: none; } }
</style>
<div class="pet-layer" aria-hidden="true">
  <div class="pet pet--claude" id="pet-claude">
    <div class="pet__bubble" id="pet-claude-bubble"></div>
    <div class="pet__shadow"></div>
    ${CLAUDE_CRITTER_HTML}
  </div>
  <div class="pet pet--codex" id="pet-codex">
    <div class="pet__bubble" id="pet-codex-bubble"></div>
    <div class="pet__shadow"></div>
    ${CODEX_CRITTER_HTML}
  </div>
  <div class="pet pet--bug" id="pet-bug">
    <div class="pet__bubble" id="pet-bug-bubble"></div>
    <div class="pet__shadow"></div>
    ${BUG_CRITTER_HTML}
  </div>
</div>
<script>
(function () {
  var QUOTE_BANK = ${toJsArrayLiteral(QUOTE_BANK)};
  var CLAUDE_LINES = ${toJsArrayLiteral(claudeLines)};
  var CODEX_LINES = ${toJsArrayLiteral(codexLines)};
  var BUG_LINES = ${toJsArrayLiteral(bugLines)};

  function setupPet(bodyId, bubbleId, ownLines, startLeft, speedMs) {
    var pet = document.getElementById(bodyId);
    var bubble = document.getElementById(bubbleId);
    if (!pet || !bubble) return;

    var facingLeft = false;
    pet.style.left = startLeft + "px";
    pet.style.transitionDuration = (speedMs || 3500) + "ms";

    function maxLeft() { return Math.max(0, window.innerWidth - (pet.offsetWidth || 46) - 8); }

    function say(text, durationMs) {
      bubble.textContent = text;
      bubble.classList.add("is-visible");
      window.clearTimeout(bubble._hideTimer);
      bubble._hideTimer = window.setTimeout(function () {
        bubble.classList.remove("is-visible");
      }, durationMs || 3200);
    }

    // ~55% chance of a page-relevant line, ~45% a random quote/joke from
    // the shared bank -- keeps repeat visits from feeling identical.
    function pickLine() {
      var pool = Math.random() < 0.55 ? ownLines : QUOTE_BANK;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // Real animals don't launch from a standstill at full speed: a brief
    // squash-down anticipation, then the step cycle kicks in; on arrival,
    // an elastic "settle" overshoot instead of stopping dead.
    function walkToRandomSpot() {
      var current = parseFloat(pet.style.left) || 0;
      var target = Math.random() * maxLeft();
      var nowFacingLeft = target < current;
      if (nowFacingLeft !== facingLeft) {
        facingLeft = nowFacingLeft;
        pet.classList.toggle("is-facing-left", facingLeft);
      }

      pet.classList.add("is-anticipating");
      window.setTimeout(function () {
        pet.classList.remove("is-anticipating");
        pet.classList.add("is-walking");
        pet.style.left = target + "px";
      }, 140);

      if (Math.random() < 0.35) {
        window.setTimeout(function () { say(pickLine()); }, 900);
      }
    }

    pet.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "left") return;
      pet.classList.remove("is-walking");
      pet.classList.add("is-settling");
      window.setTimeout(function () { pet.classList.remove("is-settling"); }, 440);
    });

    var lastClickTime = 0;
    pet.addEventListener("click", function () {
      var now = Date.now();
      if (now - lastClickTime < 350) {
        // Treat as a double-click: bigger reaction.
        pet.classList.add("is-celebrating");
        window.setTimeout(function () { pet.classList.remove("is-celebrating"); }, 1000);
        say("🎉 " + QUOTE_BANK[Math.floor(Math.random() * QUOTE_BANK.length)], 4000);
      } else {
        say(pickLine(), 2600);
      }
      lastClickTime = now;
    });

    walkToRandomSpot();
    window.setInterval(walkToRandomSpot, (speedMs || 3500) + 700 + Math.random() * 2600);
  }

  setupPet("pet-claude", "pet-claude-bubble", CLAUDE_LINES, 40, 3500);
  setupPet("pet-codex", "pet-codex-bubble", CODEX_LINES, 140, 4200);
  setupPet("pet-bug", "pet-bug-bubble", BUG_LINES, 260, 2600);
})();
</script>`;
}

module.exports = { buildPetWidgetHtml, QUOTE_BANK };
