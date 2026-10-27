// The copy in mobileContentTileRules.js is held to the backend that decides it: this test READS backend/api/views/mobile_content.py,
// backend/api/models.py and backend/api/services/mobile_content.py and compares. When the backend changes a number or a name, this test
// FAILS until the copy is brought up to date (proved in Commit 6a by changing the real backend files for a moment).
// Every test says, inside it, that what it read from the backend is not empty (a test that read nothing would compare nothing).
import fs from "fs";
import path from "path";
import { PILLAR_ICONS } from "../pages/MobileContentPillars";
import {
  ADVISED_LIMITS,
  EDITABLE_FIELDS,
  FIELD_RULES,
  HARD_LIMITS,
  ICON_NAMES,
  ITEM_PLACEHOLDERS,
  ITEM_SECTIONS,
  MAX_ITEMS_PER_SECTION,
  ORDER_MAX,
  ORDER_MIN,
  ORDER_STEP,
} from "./mobileContentTileRules";

const BACKEND = path.join(__dirname, "..", "..", "..", "..", "backend", "api");
const read = (...parts) => fs.readFileSync(path.join(BACKEND, ...parts), "utf8").replace(/\r\n/g, "\n");
const VIEWS = read("views", "mobile_content.py");
const MODELS = read("models.py");
const SERVICE = read("services", "mobile_content.py");

// the class of the item in models.py, and nothing of the other classes
const ITEM_CLASS = MODELS.slice(MODELS.indexOf("class MobileContentItem("), MODELS.indexOf("class MobileContentBlock("));

const numbersOf = (text) => Object.fromEntries([...text.matchAll(/"(\w+)":\s*(\d+)/g)].map((found) => [found[1], Number(found[2])]));
// `NAME = { "a": {"x": 1, ...}, "b": {...}, }` -> { a: { x: 1 }, b: {...} }
function dictOfDicts(name) {
  const start = VIEWS.search(new RegExp(`^${name} = \\{`, "m"));
  expect(start).toBeGreaterThan(-1); // it is in the file
  const end = VIEWS.indexOf("\n}", start);
  const body = VIEWS.slice(start, end);
  const result = {};
  for (const found of body.matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) result[found[1]] = numbersOf(found[2]);
  return result;
}
const tupleOf = (text) => [...text.matchAll(/"([a-z_]+)"/g)].map((found) => found[1]);

describe("the limits of the lengths", () => {
  it("the hard limits are the server's (HARD)", () => {
    const server = dictOfDicts("HARD");
    expect(Object.keys(server).sort()).toEqual(["travel_guide", "why_visit"]); // the fixture: both sections were read
    expect(server.why_visit.title).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(HARD_LIMITS))).toEqual(server);
  });

  it("the advised limits are the server's (ADVISED)", () => {
    const server = dictOfDicts("ADVISED");
    expect(Object.keys(server).length).toBeGreaterThan(0); // the fixture
    expect(server.why_visit.short_text).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(ADVISED_LIMITS))).toEqual(server);
  });

  it("an advised limit is never longer than the hard one of the same text", () => {
    for (const [section, advised] of Object.entries(ADVISED_LIMITS)) {
      expect(Object.keys(advised).length).toBeGreaterThan(0); // the fixture
      for (const [field, number] of Object.entries(advised)) expect(number).toBeLessThanOrEqual(HARD_LIMITS[section][field]);
    }
  });
});

describe("the positions and the size of a section", () => {
  it("ORDER_MIN, ORDER_MAX, ORDER_STEP and the most items of a section are the server's", () => {
    const step = VIEWS.match(/^ORDER_STEP = (\d+)/m);
    const range = VIEWS.match(/^ORDER_MIN, ORDER_MAX = (\d+), (\d+)/m);
    const most = VIEWS.match(/^MAX_ITEMS_PER_SECTION = (\d+)/m);
    expect([step, range, most].every(Boolean)).toBe(true); // the fixture: the three lines were found
    expect(ORDER_STEP).toBe(Number(step[1]));
    expect([ORDER_MIN, ORDER_MAX]).toEqual([Number(range[1]), Number(range[2])]);
    expect(MAX_ITEMS_PER_SECTION).toBe(Number(most[1]));
  });

  it("a position of 0 is not allowed (the design said 0; the server decided 1)", () => {
    expect(ORDER_MIN).toBe(1);
    expect(ORDER_MAX).toBe(9999);
  });
});

describe("the names of the icons and of the sections", () => {
  it("the icons are the model's ICON_NAMES, in its order", () => {
    const found = ITEM_CLASS.match(/ICON_NAMES = \[([\s\S]*?)\]/);
    expect(found).not.toBeNull(); // the fixture
    const server = tupleOf(found[1]);
    expect(server.length).toBeGreaterThanOrEqual(11);
    expect([...ICON_NAMES]).toEqual(server);
  });

  it("each icon is drawn by the page (and the page draws no icon the server does not know)", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0); // the fixture
    expect(Object.keys(PILLAR_ICONS).sort()).toEqual([...ICON_NAMES].sort());
    expect(ICON_NAMES).toContain("info"); // the neutral one: the default of the server and the one used for a name nobody knows
  });

  it("the sections and their names are the model's SECTION_CHOICES", () => {
    const constants = Object.fromEntries([...ITEM_CLASS.matchAll(/^    (SECTION_[A-Z_]+) = "(\w+)"/gm)].map((found) => [found[1], found[2]]));
    const choices = ITEM_CLASS.match(/SECTION_CHOICES = \[([\s\S]*?)\]/);
    expect(Object.keys(constants).length).toBeGreaterThan(0); // the fixture
    expect(choices).not.toBeNull();
    // a choice is written with the name of its constant, or with the code itself: both count
    const server = Object.fromEntries([...choices[1].matchAll(/\((?:(SECTION_[A-Z_]+)|"(\w+)"), "([^"]+)"\)/g)].map((found) => [found[1] ? constants[found[1]] : found[2], found[3]]));
    expect(Object.keys(server).length).toBe(2); // two sections: a third one would be a new kind of list
    expect({ ...ITEM_SECTIONS }).toEqual(server);
  });
});

describe("what a request may change, and what a text is", () => {
  it("the editable fields are the server's EDITABLE, in its order", () => {
    const found = VIEWS.match(/^EDITABLE = \(([^)]*)\)/m);
    expect(found).not.toBeNull(); // the fixture
    expect([...EDITABLE_FIELDS]).toEqual(tupleOf(found[1]));
  });

  it("the title and the short line are ONE line and needed, the full text is paragraphs and may be empty (the calls of _text)", () => {
    const calls = [...VIEWS.matchAll(/_text\(data, "(\w+)", section, (True|False), (True|False)\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(6); // the fixture: the create and the edit both call it, three times each
    const rules = {};
    for (const [, field, singleLine, required] of calls) {
      const rule = { kind: singleLine === "True" ? "line" : "text", required: required === "True" };
      if (rules[field]) expect(rule).toEqual(rules[field]); // the create and the edit agree
      rules[field] = rule;
    }
    expect(JSON.parse(JSON.stringify(FIELD_RULES))).toEqual(rules);
  });

  it("the placeholders of an item are the three of the fee (FEE_PLACEHOLDERS), and the name of the visitor is not one", () => {
    const found = SERVICE.match(/^FEE_PLACEHOLDERS = \(([^)]*)\)/m);
    expect(found).not.toBeNull(); // the fixture
    expect([...ITEM_PLACEHOLDERS]).toEqual(tupleOf(found[1]));
    expect(ITEM_PLACEHOLDERS).not.toContain("name");
    expect(VIEWS).toMatch(/_check_placeholders\(new\[field\], field, FEE_PLACEHOLDERS\)/); // an edit allows exactly those
    expect(VIEWS).toMatch(/allowed = FEE_PLACEHOLDERS/); // and so does a new item
  });
});

describe("the copy cannot be changed in place", () => {
  it("everything exported is frozen", () => {
    for (const value of [ITEM_SECTIONS, ICON_NAMES, HARD_LIMITS, HARD_LIMITS.why_visit, ADVISED_LIMITS, ADVISED_LIMITS.travel_guide, FIELD_RULES, FIELD_RULES.title, EDITABLE_FIELDS, ITEM_PLACEHOLDERS]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});
