// A text of LINES (Commit 8a): the port guide, where every line is a bullet in the app. The page cleans and counts it the way the server does
// (api/views/mobile_content.py, _clean_lines): every line cleaned as a line, the blank lines gone, the limit is for EACH line and for the NUMBER of lines.
// The tests of a text of one line and of a text of paragraphs stay as they were (mobileContentText.test.js is not touched); here they are only checked
// not to have changed. The file of the server is read, so a rule that the server changes makes a test here fail.
import fs from "fs";
import path from "path";
import {
  BULLET,
  bulletLines,
  countLetters,
  lineCount,
  linesOf,
  longLines,
  longestLine,
  normalizeFor,
  normalizeLine,
  normalizeLines,
  normalizeText,
} from "./mobileContentText";

const VIEWS = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "backend", "api", "views", "mobile_content.py"), "utf8").replace(/\r\n/g, "\n");
const CLEAN_LINES = VIEWS.slice(VIEWS.indexOf("def _clean_lines("), VIEWS.indexOf("def _all_fee_placeholders("));

describe("the server's rules for a text of lines, as the page copies them", () => {
  it("the part of the server that cleans lines was found, and it does what the page does", () => {
    expect(CLEAN_LINES.length).toBeGreaterThan(200); // the fixture: the function was read
    expect(CLEAN_LINES).toMatch(/\[clean_name\(line\) for line in raw\.replace\("\\r\\n", "\\n"\)\.replace\("\\r", "\\n"\)\.split\("\\n"\)\]/); // every line cleaned as a line
    expect(CLEAN_LINES).toMatch(/lines = \[line for line in lines if line\]/); // the blank lines go
    expect(CLEAN_LINES).toMatch(/if not lines:\s+_refuse\(f"\{word\} is required\."/); // none at all is refused
    expect(CLEAN_LINES).toMatch(/len\(lines\) > rules\["max_lines"\]/); // the number of lines is limited
    expect(CLEAN_LINES).toMatch(/len\(line\) > rules\["max"\]/); // and each line
    expect(CLEAN_LINES).toMatch(/line\.startswith\("\\u2022"\)/); // a bullet at the start is refused
    expect(BULLET).toBe("\u2022");
    expect(CLEAN_LINES).toMatch(/return "\\n"\.join\(lines\)/); // and the lines are kept apart by a new line
  });

  it("the server's rules for the port guide are the ones the page expects: kind lines, 400 and 8", () => {
    const found = VIEWS.match(/"port_guide": \{[\s\S]*?"body": \{"kind": "lines", "max": (\d+), "max_lines": (\d+)/);
    expect(found).not.toBeNull(); // the fixture
    expect([Number(found[1]), Number(found[2])]).toEqual([400, 8]);
  });
});

describe("linesOf and normalizeLines", () => {
  it("clean every line as a line, drop the blank ones, and keep the order", () => {
    const typed = "  first   line \n\n\t\n second\tline  \r\n   \nthird\rfourth ";
    expect(linesOf(typed)).toEqual(["first line", "second line", "third", "fourth"]);
    expect(normalizeLines(typed)).toBe("first line\nsecond line\nthird\nfourth");
    expect(linesOf(typed).length).toBeGreaterThan(1); // the fixture: more than one line came out
  });

  it("keep the new lines (a text of lines is not one line)", () => {
    expect(normalizeLines("a\nb\nc")).toBe("a\nb\nc");
    expect(normalizeLines("a\nb\nc")).not.toBe("a b c");
  });

  it("make nothing of nothing: no text, spaces only, or blank lines give no line at all", () => {
    for (const empty of ["", "   ", "\n\n", " \n \r\n\t", null, undefined]) {
      expect(linesOf(empty)).toEqual([]);
      expect(normalizeLines(empty)).toBe("");
    }
  });

  it("do not touch the letters inside a line (an emoji, an arrow, a placeholder)", () => {
    expect(normalizeLines("Mauban Port \u2194 Cagbalete\n\u{1F30A}  wave {fee_regular}")).toBe("Mauban Port \u2194 Cagbalete\n\u{1F30A} wave {fee_regular}");
  });
});

describe("normalizeFor", () => {
  it("cleans a text of lines as lines, a text of paragraphs as paragraphs, and a line as a line: each its own way", () => {
    const typed = "a   b\n\n\n\nc  \n d";
    expect(normalizeFor("lines", typed)).toBe("a b\nc\nd");
    expect(normalizeFor("text", typed)).toBe(normalizeText(typed));
    expect(normalizeFor("text", typed)).toBe("a   b\n\nc\n d"); // paragraphs: three or more new lines become two; the blank line stays
    expect(normalizeFor("line", typed)).toBe(normalizeLine(typed));
    expect(normalizeFor("line", typed)).toBe("a b c d"); // a line: every new line a space
    expect(new Set([normalizeFor("lines", typed), normalizeFor("text", typed), normalizeFor("line", typed)]).size).toBe(3); // the fixture: three different answers
  });

  it("an unknown kind is cleaned as a line, as before", () => {
    expect(normalizeFor("something", "a\nb")).toBe("a b");
    expect(normalizeFor(undefined, "a\nb")).toBe("a b");
  });
});

describe("the two numbers of a text of lines", () => {
  it("lineCount counts the lines the server will find, not the new lines typed", () => {
    expect(lineCount("a\n\n\nb\n  \nc")).toBe(3);
    expect(lineCount("")).toBe(0);
    expect(lineCount("one")).toBe(1);
    expect(lineCount("a\nb\nc\nd\ne\nf\ng\nh\ni")).toBe(9);
  });

  it("longestLine is the letters of the longest line, counted like the server (an emoji is one)", () => {
    expect(longestLine("ab\nabcde\nabc")).toBe(5);
    expect(longestLine("")).toBe(0);
    const wave = "\u{1F30A}";
    expect(wave.length).toBe(2); // the fixture: .length counts it twice
    expect(longestLine(`${wave.repeat(10)}\nshort`)).toBe(10);
    expect(countLetters(wave.repeat(10))).toBe(10);
  });

  it("longestLine counts a line after it is cleaned: the spaces between words are one", () => {
    expect(longestLine("a      b")).toBe(3);
  });

  it("longLines names the lines that are over the limit, as the server numbers them (the blank lines do not count)", () => {
    const text = `ok\n\n${"x".repeat(7)}\n\n  \n${"y".repeat(5)}\n${"z".repeat(9)}`;
    expect(linesOf(text).map((line) => line.length)).toEqual([2, 7, 5, 9]); // the fixture
    expect(longLines(text, 6)).toEqual([
      { number: 2, over: 1 },
      { number: 4, over: 3 },
    ]);
    expect(longLines(text, 9)).toEqual([]);
    expect(longLines(text, 7).map((entry) => entry.number)).toEqual([4]);
  });

  it("a line of exactly the limit is not over it, and one letter more is", () => {
    expect(longLines("x".repeat(400), 400)).toEqual([]);
    expect(longLines("x".repeat(401), 400)).toEqual([{ number: 1, over: 1 }]);
    expect(longLines(`${"\u{1F30A}".repeat(400)}`, 400)).toEqual([]); // 400 emoji are 400 letters for the server
  });
});

describe("bulletLines", () => {
  it("names the lines that start with a bullet, as the server numbers them", () => {
    expect(bulletLines("fine\n\u2022 one\nfine too\n  \u2022two")).toEqual([2, 4]);
    expect(bulletLines("\n\n\u2022 first real line")).toEqual([1]); // the blank lines before it do not count
    expect(bulletLines("fine\n\n\n\u2022 now")).toEqual([2]);
  });

  it("looks at the start of a cleaned line: spaces before the bullet do not hide it", () => {
    expect(bulletLines("   \u2022 indented")).toEqual([1]);
  });

  it("does not take a bullet in the middle of a line, or another dot, for one", () => {
    expect(bulletLines("a \u2022 b\n- dash\n* star\n\u00b7 middle dot\n\u25cf black circle")).toEqual([]);
  });

  it("finds none in a text with none", () => {
    expect(bulletLines("")).toEqual([]);
    expect(bulletLines("one\ntwo")).toEqual([]);
  });
});
