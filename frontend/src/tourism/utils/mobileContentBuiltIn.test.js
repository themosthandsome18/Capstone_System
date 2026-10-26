// The copy of the app's built-in text (mobileContentBuiltIn.js) must be the text the app really has. It is held to TWO sources, and
// fails loudly if either is missing or differs by one character:
//   1. the seed of the content tables, backend/api/migrations/seed_data/mobile_content_0061.json (itself held to the Dart file by
//      backend/tools/extract_mobile_content_seed.py --check and a backend test);
//   2. the Dart file itself, mobile/lib/screens/tourism_screens.dart, where the strings are written.
const fs = require("fs");
const path = require("path");
const { BUILT_IN_BLOCKS, GUEST_NAME } = require("./mobileContentBuiltIn");

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const SEED = path.join(ROOT, "backend", "api", "migrations", "seed_data", "mobile_content_0061.json");
const DART = path.join(ROOT, "mobile", "lib", "screens", "tourism_screens.dart");

const SHOWN = { welcome: ["title", "subtitle"], why_visit: ["title", "subtitle", "body"] };

// What the number of letters is, the way the server counts it (Python len: one for each code point).
const letters = (text) => Array.from(text).length;

function read(file) {
  // not skipped when absent: a guard that can silently stop guarding is not a guard
  expect({ file: path.relative(ROOT, file), found: fs.existsSync(file) }).toEqual({ file: path.relative(ROOT, file), found: true });
  return fs.readFileSync(file, "utf8");
}

// -> the list of every way `copy` differs from the seed and from the Dart source. Empty when it is the same text.
function differences(copy, seedText, dartSource) {
  const found = [];
  const seed = JSON.parse(seedText);
  const rows = Object.fromEntries(seed.blocks.map((block) => [block.key, block]));
  for (const [key, fields] of Object.entries(SHOWN)) {
    const block = copy[key];
    if (!block) {
      found.push(`${key}: missing from the copy`);
      continue;
    }
    const extra = Object.keys(block).filter((field) => !fields.includes(field));
    if (extra.length) found.push(`${key}: the copy has fields the app does not show: ${extra.join(", ")}`);
    for (const field of fields) {
      if (block[field] !== rows[key][field]) found.push(`${key}.${field}: the copy differs from the seed`);
      const literal = field === "title" && key === "welcome" ? null : `'${block[field]}'`;
      if (literal && !dartSource.includes(literal)) found.push(`${key}.${field}: the Dart source does not have this text`);
    }
  }
  if (copy.welcome && typeof copy.welcome.title === "string") {
    const guest = `'${copy.welcome.title.replace("{name}", GUEST_NAME)}'`;
    const named = `'${copy.welcome.title.replace("{name}", "${widget.profile.displayName}")}'`;
    if (!dartSource.includes(guest)) found.push("welcome.title: the Dart source does not greet a guest with this text");
    if (!dartSource.includes(named)) found.push("welcome.title: the Dart source does not greet a named visitor with this text");
  }
  for (const key of Object.keys(copy)) if (!SHOWN[key]) found.push(`${key}: a block the copy should not have`);
  return found;
}

describe("the built-in text is the text the app really has", () => {
  const seedText = read(SEED);
  const dartSource = read(DART);

  it("is, letter for letter, the seed and the Dart source", () => {
    expect(differences(BUILT_IN_BLOCKS, seedText, dartSource)).toEqual([]);
  });

  it("has exactly the fields the app shows for each block, and the seed leaves the others empty", () => {
    expect(Object.keys(BUILT_IN_BLOCKS)).toEqual(["welcome", "why_visit"]);
    expect(Object.keys(BUILT_IN_BLOCKS.welcome)).toEqual(["title", "subtitle"]);
    expect(Object.keys(BUILT_IN_BLOCKS.why_visit)).toEqual(["title", "subtitle", "body"]);
    const welcome = JSON.parse(seedText).blocks.find((block) => block.key === "welcome");
    expect(welcome.body).toBe("");
  });

  it("is frozen, so the page cannot change it in place", () => {
    expect(Object.isFrozen(BUILT_IN_BLOCKS)).toBe(true);
    expect(Object.isFrozen(BUILT_IN_BLOCKS.welcome)).toBe(true);
    expect(Object.isFrozen(BUILT_IN_BLOCKS.why_visit)).toBe(true);
    expect(() => {
      BUILT_IN_BLOCKS.welcome.title = "changed";
    }).toThrow(TypeError);
    expect(BUILT_IN_BLOCKS.welcome.title).toBe("Mabuhay, {name}! \u{1F30A}");
  });

  it("is what the guest sees: {name} is the word the app uses for a guest", () => {
    expect(GUEST_NAME).toBe("Explorer");
    expect(BUILT_IN_BLOCKS.welcome.title.replace("{name}", GUEST_NAME)).toBe("Mabuhay, Explorer! \u{1F30A}");
    expect(dartSource).toContain("'Mabuhay, Explorer! \u{1F30A}'");
  });
});

describe("the check itself: it catches a copy that has drifted", () => {
  const seedText = fs.readFileSync(SEED, "utf8");
  const dartSource = fs.readFileSync(DART, "utf8");
  const clone = () => JSON.parse(JSON.stringify(BUILT_IN_BLOCKS));

  it("sees one letter changed, in every shown field", () => {
    expect(differences(clone(), seedText, dartSource)).toEqual([]); // the fixture: the unchanged copy passes
    for (const [key, fields] of Object.entries(SHOWN)) {
      for (const field of fields) {
        const copy = clone();
        copy[key][field] = copy[key][field].replace(/[a-z]/, (letter) => (letter === "z" ? "y" : "z")); // one letter
        expect(copy[key][field]).not.toBe(BUILT_IN_BLOCKS[key][field]); // the fixture: it really changed
        expect(differences(copy, seedText, dartSource).filter((line) => line.startsWith(`${key}.${field}`)).length).toBeGreaterThan(0);
      }
    }
  });

  it("sees a space added, a letter dropped, a text emptied, a field added, a block gone", () => {
    const cases = {
      "a space at the end": (copy) => (copy.why_visit.body += " "),
      "the last letter dropped": (copy) => (copy.why_visit.subtitle = copy.why_visit.subtitle.slice(0, -1)),
      "emptied": (copy) => (copy.welcome.subtitle = ""),
      "a field the app does not show": (copy) => (copy.welcome.body = "x"),
      "a block gone": (copy) => delete copy.why_visit,
      "a block that should not be": (copy) => (copy.travel_guide = { title: "x" }),
    };
    for (const [label, change] of Object.entries(cases)) {
      const copy = clone();
      change(copy);
      expect({ label, found: differences(copy, seedText, dartSource).length > 0 }).toEqual({ label, found: true });
    }
  });

  it("sees the seed or the Dart source drift away from a copy that did not change", () => {
    const drifted = seedText.replace("Nestled along", "Nestled across");
    expect(drifted).not.toBe(seedText); // the fixture
    expect(differences(BUILT_IN_BLOCKS, drifted, dartSource).some((line) => line.startsWith("why_visit.body"))).toBe(true);
    const driftedDart = dartSource.replace("The historic coastal sanctuary of southern Luzon", "The historic coastal sanctuary of Luzon");
    expect(driftedDart).not.toBe(dartSource); // the fixture
    expect(differences(BUILT_IN_BLOCKS, seedText, driftedDart).some((line) => line.startsWith("why_visit.subtitle"))).toBe(true);
    const driftedGreeting = dartSource.replace("'Mabuhay, Explorer! \u{1F30A}'", "'Mabuhay, Explorer!'");
    expect(driftedGreeting).not.toBe(dartSource); // the fixture
    expect(differences(BUILT_IN_BLOCKS, seedText, driftedGreeting).some((line) => line.includes("greet a guest"))).toBe(true);
  });
});

describe("counting letters the way the server counts them", () => {
  // The server counts code points (Python len). JavaScript's .length counts UTF-16 units, so an emoji is 2 there and 1 on the server.
  // The built-in welcome title has one, so it is a fixture that REACHES the case: the assertions below are inside the test.
  it("the welcome title is a fixture where .length and Array.from().length differ", () => {
    const title = BUILT_IN_BLOCKS.welcome.title;
    expect(title.length).not.toBe(Array.from(title).length); // the fixture reached the case
    expect(title.length - Array.from(title).length).toBe(1); // one emoji, two units
    expect(letters(title)).toBe(18);
    expect(title.length).toBe(19);
  });

  it("the numbers are the ones the server gives (Python len) for each built-in text", () => {
    expect(letters(BUILT_IN_BLOCKS.welcome.title)).toBe(18);
    expect(letters(BUILT_IN_BLOCKS.welcome.subtitle)).toBe(160);
    expect(letters(BUILT_IN_BLOCKS.why_visit.title)).toBe(25);
    expect(letters(BUILT_IN_BLOCKS.why_visit.subtitle)).toBe(48);
    expect(letters(BUILT_IN_BLOCKS.why_visit.body)).toBe(237);
  });

  it("160 emoji are 160 letters for the server (the most a title can have) and 320 for .length", () => {
    const longest = "\u{1F30A}".repeat(160);
    expect(longest.length).toBe(320);
    expect(letters(longest)).toBe(160);
    expect(letters(longest + "\u{1F30A}")).toBe(161);
  });
});
