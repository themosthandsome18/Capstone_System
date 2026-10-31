// The copy of the app's built-in text (mobileContentBuiltIn.js) must be the text the app really has. It is held to TWO sources, and
// fails loudly if either is missing or differs by one character:
//   1. the seed of the content tables, backend/api/migrations/seed_data/mobile_content_0061.json (itself held to the Dart file by
//      backend/tools/extract_mobile_content_seed.py --check and a backend test);
//   2. the Dart files themselves, where the strings are written: mobile/lib/models/app_content_defaults.dart (the texts, and `welcomeTitle`,
//      the greeting as a TEMPLATE with {name} in it) and mobile/lib/models/app_content.dart (`guestVisitorName`, the word used for a visitor
//      with no name). The app fills {name} in; it no longer has the two greetings written out.
const fs = require("fs");
const path = require("path");
const { BUILT_IN_BLOCKS, GUEST_NAME } = require("./mobileContentBuiltIn");

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const SEED = path.join(ROOT, "backend", "api", "migrations", "seed_data", "mobile_content_0061.json");
const DART = path.join(ROOT, "mobile", "lib", "models", "app_content_defaults.dart");
const DART_CONTENT = path.join(ROOT, "mobile", "lib", "models", "app_content.dart");

const SHOWN = { welcome: ["title", "subtitle"], why_visit: ["title", "subtitle", "body"] };

// What the number of letters is, the way the server counts it (Python len: one for each code point).
const letters = (text) => Array.from(text).length;

function read(file) {
  // not skipped when absent: a guard that can silently stop guarding is not a guard
  expect({ file: path.relative(ROOT, file), found: fs.existsSync(file) }).toEqual({ file: path.relative(ROOT, file), found: true });
  return fs.readFileSync(file, "utf8");
}

// The value of a Dart string constant, exactly as written between its quotes; undefined when the constant is not there.
const dartConstant = (source, declaration) => {
  const found = source.match(new RegExp(declaration + " = '((?:[^'\\\\]|\\\\.)*)';"));
  return found ? found[1] : undefined;
};
const templateOf = (defaultsSource) => dartConstant(defaultsSource, "static const welcomeTitle");
const guestWordOf = (contentSource) => dartConstant(contentSource, "const String guestVisitorName");

// -> the list of every way `copy` differs from the seed and from the Dart sources. Empty when it is the same text.
function differences(copy, seedText, dartSource, contentSource) {
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
    // the greeting is ONE template in the Dart; the web's copy must be that template, letter for letter
    const template = templateOf(dartSource);
    if (template === undefined) found.push("welcome.title: the Dart source has no welcomeTitle");
    else if (template !== copy.welcome.title) found.push("welcome.title: the copy differs from the welcomeTitle template of the Dart source");
  }
  // and the word for a visitor with no name is the Dart's, letter for letter
  const guestWord = guestWordOf(contentSource);
  if (guestWord === undefined) found.push("guest word: the Dart source has no guestVisitorName");
  else if (guestWord !== GUEST_NAME) found.push("guest word: the web's word for a visitor with no name differs from guestVisitorName of the Dart source");
  for (const key of Object.keys(copy)) if (!SHOWN[key]) found.push(`${key}: a block the copy should not have`);
  return found;
}

describe("the built-in text is the text the app really has", () => {
  const seedText = read(SEED);
  const dartSource = read(DART);
  const contentSource = read(DART_CONTENT);

  it("is, letter for letter, the seed and the Dart source", () => {
    expect(differences(BUILT_IN_BLOCKS, seedText, dartSource, contentSource)).toEqual([]);
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

  it("is what the guest sees: {name} is the word the app uses for a guest, and both are the Dart's, letter for letter", () => {
    expect(GUEST_NAME).toBe("Explorer");
    expect(BUILT_IN_BLOCKS.welcome.title.replace("{name}", GUEST_NAME)).toBe("Mabuhay, Explorer! \u{1F30A}");
    // the template and the word are read out of the Dart, not written again here
    expect(templateOf(dartSource)).toBe(BUILT_IN_BLOCKS.welcome.title);
    expect(guestWordOf(contentSource)).toBe(GUEST_NAME);
  });
});

describe("the check itself: it catches a copy that has drifted", () => {
  const seedText = fs.readFileSync(SEED, "utf8");
  const dartSource = fs.readFileSync(DART, "utf8");
  const contentSource = fs.readFileSync(DART_CONTENT, "utf8");
  const clone = () => JSON.parse(JSON.stringify(BUILT_IN_BLOCKS));

  it("sees one letter changed, in every shown field", () => {
    expect(differences(clone(), seedText, dartSource, contentSource)).toEqual([]); // the fixture: the unchanged copy passes
    for (const [key, fields] of Object.entries(SHOWN)) {
      for (const field of fields) {
        const copy = clone();
        copy[key][field] = copy[key][field].replace(/[a-z]/, (letter) => (letter === "z" ? "y" : "z")); // one letter
        expect(copy[key][field]).not.toBe(BUILT_IN_BLOCKS[key][field]); // the fixture: it really changed
        expect(differences(copy, seedText, dartSource, contentSource).filter((line) => line.startsWith(`${key}.${field}`)).length).toBeGreaterThan(0);
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
      expect({ label, found: differences(copy, seedText, dartSource, contentSource).length > 0 }).toEqual({ label, found: true });
    }
  });

  it("sees the seed or the Dart source drift away from a copy that did not change", () => {
    const drifted = seedText.replace("Nestled along", "Nestled across");
    expect(drifted).not.toBe(seedText); // the fixture
    expect(differences(BUILT_IN_BLOCKS, drifted, dartSource, contentSource).some((line) => line.startsWith("why_visit.body"))).toBe(true);
    const driftedDart = dartSource.replace("The historic coastal sanctuary of southern Luzon", "The historic coastal sanctuary of Luzon");
    expect(driftedDart).not.toBe(dartSource); // the fixture
    expect(differences(BUILT_IN_BLOCKS, seedText, driftedDart, contentSource).some((line) => line.startsWith("why_visit.subtitle"))).toBe(true);
    // one letter changed in the template of the Dart (the emoji kept), and one in the Dart's word for a visitor with no name
    const driftedTemplate = dartSource.replace("'Mabuhay, {name}! \u{1F30A}'", "'Mabuhay, {name}! \u{1F30A}.'");
    expect(driftedTemplate).not.toBe(dartSource); // the fixture
    expect(differences(BUILT_IN_BLOCKS, seedText, driftedTemplate, contentSource).some((line) => line.includes("welcomeTitle"))).toBe(true);
    const oneLetter = dartSource.replace("'Mabuhay, {name}!", "'Mabuhay, {nome}!");
    expect(oneLetter).not.toBe(dartSource); // the fixture: a single letter
    expect(differences(BUILT_IN_BLOCKS, seedText, oneLetter, contentSource).some((line) => line.includes("welcomeTitle"))).toBe(true);
    const driftedWord = contentSource.replace("guestVisitorName = 'Explorer'", "guestVisitorName = 'Explorar'");
    expect(driftedWord).not.toBe(contentSource); // the fixture: a single letter
    expect(differences(BUILT_IN_BLOCKS, seedText, dartSource, driftedWord).some((line) => line.startsWith("guest word"))).toBe(true);
    // and the same on the web's side: one letter of the template, one letter of the word
    const copy = clone();
    copy.welcome.title = copy.welcome.title.replace("{name}", "{nome}");
    expect(differences(copy, seedText, dartSource, contentSource).some((line) => line.includes("welcomeTitle"))).toBe(true);
    // a Dart source that has lost the constants is also caught, never skipped
    expect(differences(BUILT_IN_BLOCKS, seedText, dartSource.replace("welcomeTitle", "greetingTitle"), contentSource).some((line) => line.includes("no welcomeTitle"))).toBe(true);
    expect(differences(BUILT_IN_BLOCKS, seedText, dartSource, contentSource.replace("guestVisitorName =", "guestName =")).some((line) => line.includes("no guestVisitorName"))).toBe(true);
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
