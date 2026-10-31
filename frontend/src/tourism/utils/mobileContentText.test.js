import { BUILT_IN_BLOCKS } from "./mobileContentBuiltIn";
import { countLetters, normalizeFor, normalizeLine, normalizeText } from "./mobileContentText";

describe("counting letters the way the server does (code points, never .length)", () => {
  it("an emoji is one letter, though .length says two (the fixture reaches the case, inside the test)", () => {
    const wave = "\u{1F30A}";
    expect(wave.length).not.toBe(Array.from(wave).length); // the fixture reached the case
    expect(wave.length).toBe(2);
    expect(countLetters(wave)).toBe(1);
  });

  it("160 emoji are 160 letters (allowed in a title), 161 are not", () => {
    const longest = "\u{1F30A}".repeat(160);
    expect(longest.length).toBe(320); // the fixture: .length would say twice the limit
    expect(countLetters(longest)).toBe(160);
    expect(countLetters(longest + "\u{1F30A}")).toBe(161);
  });

  it("a family of three emoji joined by joiners is 5 code points, as the server counts it, and 8 for .length", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(family.length).toBe(8);
    expect(Array.from(family).length).toBe(5); // the fixture reached the case: the two counts differ
    expect(countLetters(family)).toBe(5);
  });

  it("the built-in texts have the counts the server gives them", () => {
    expect(countLetters(BUILT_IN_BLOCKS.welcome.title)).toBe(18);
    expect(BUILT_IN_BLOCKS.welcome.title.length).toBe(19); // the fixture reached the case
    expect(countLetters(BUILT_IN_BLOCKS.welcome.subtitle)).toBe(160);
    expect(countLetters(BUILT_IN_BLOCKS.why_visit.body)).toBe(237);
  });

  it("nothing counts as nothing", () => {
    expect([countLetters(""), countLetters(null), countLetters(undefined)]).toEqual([0, 0, 0]);
  });
});

describe("cleaning one line", () => {
  it("trims, makes every run of white space one space, and makes a new line a space", () => {
    expect(normalizeLine("  a   b\t c \n d  ")).toBe("a b c d");
    expect(normalizeLine("\n\n")).toBe("");
    expect(normalizeLine("a  b")).toBe("a b"); // a no-break space is white space
  });

  it("leaves a clean line, and the texts the server stored, as they are", () => {
    expect(normalizeLine("Mabuhay, {name}! \u{1F30A}")).toBe("Mabuhay, {name}! \u{1F30A}");
    Object.values(BUILT_IN_BLOCKS).forEach((block) =>
      Object.entries(block)
        .filter(([field]) => field !== "body")
        .forEach(([, text]) => expect(normalizeLine(text)).toBe(text))
    );
  });

  it("an empty or missing text is empty", () => {
    expect([normalizeLine(""), normalizeLine(null), normalizeLine(undefined)]).toEqual(["", "", ""]);
  });
});

describe("cleaning paragraphs", () => {
  it("makes new lines \\n, trims the end of every line and the whole, and keeps at most one empty line", () => {
    expect(normalizeText("  one  \r\ntwo   \r\n\r\n\r\n\r\nthree\r\n")).toBe("one\ntwo\n\nthree");
    expect(normalizeText("a\rb")).toBe("a\nb");
    expect(normalizeText("\n\n\n")).toBe("");
  });

  it("keeps the spaces inside a line (only the end of a line is trimmed)", () => {
    expect(normalizeText("a   b  \n  c")).toBe("a   b\n  c".trim());
    expect(normalizeText("a   b")).toBe("a   b");
  });

  it("leaves the built-in body as the server stored it", () => {
    expect(normalizeText(BUILT_IN_BLOCKS.why_visit.body)).toBe(BUILT_IN_BLOCKS.why_visit.body);
  });
});

describe("which cleaning a field gets", () => {
  it("a field of kind text gets the paragraphs cleaning and every other kind the line cleaning", () => {
    expect(normalizeFor("text", "a\n\n\n\nb")).toBe("a\n\nb");
    expect(normalizeFor("line", "a\n\n\n\nb")).toBe("a b");
    expect(normalizeFor("lines", "a  b")).toBe("a b");
  });
});
