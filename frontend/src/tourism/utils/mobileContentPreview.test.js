// The preview of a text (mobileContentPreview.js): a second implementation of what the server does when it fills in the placeholders. It is
// held to the REAL value the server sends, so the two cannot drift apart.
const fs = require("fs");
const path = require("path");
const { GUEST_NAME } = require("./mobileContentBuiltIn");
const { FEE_NOT_AVAILABLE, insertAt, placeholderWarnings, previewContext, previewParts, previewText } = require("./mobileContentPreview");

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const read = (...parts) => {
  const file = path.join(ROOT, ...parts);
  expect({ file: path.relative(ROOT, file), found: fs.existsSync(file) }).toEqual({ file: path.relative(ROOT, file), found: true });
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const FEE = { regular: 80, discounted: 64 };
const FULL = { regular: 80, discounted: 64, office: "Tourism Office, 2nd Floor, Mauban Municipal Hall" };
const ALL = ["fee_regular", "fee_discounted", "fee_office", "name"];
// what the server sends to the app: the placeholder {name} is left for the app, so it is put back for the comparison
const asTheServerSends = (parts) => parts.map((part) => (part.kind === "name" ? part.token : part.text)).join("");

describe("the preview fills in the placeholders as the server does (held to the real value)", () => {
  const seed = read("backend", "api", "migrations", "seed_data", "mobile_content_0061.json");
  const sent = read("mobile", "test", "data", "app_content_commit3.json");
  const blocks = Object.fromEntries(seed.blocks.map((block) => [block.key, block]));
  const context = previewContext({ fee: FEE, blocks: seed.blocks });

  it("takes the amounts and the place from the answer of the list, as the server does", () => {
    expect(context).toEqual(FULL);
  });

  it("gives, for every shown text of every block, exactly what the server sends", () => {
    let withPlaceholders = 0;
    for (const [key, shown] of Object.entries(sent.blocks)) {
      for (const [field, text] of Object.entries(shown)) {
        const source = blocks[key][field];
        const parts = previewParts(source, context).parts;
        if (/\{fee_/.test(source)) withPlaceholders += 1;
        expect({ key, field, text: asTheServerSends(parts) }).toEqual({ key, field, text });
      }
    }
    expect(withPlaceholders).toBeGreaterThanOrEqual(1); // the fixture reached the case: at least one text has a fee placeholder
  });

  it("gives, for every item of both sections, exactly what the server sends", () => {
    const items = seed.items.map((item, index) => ({ ...item, id: index + 1 }));
    let withPlaceholders = 0;
    for (const section of Object.keys(sent.sections)) {
      sent.sections[section].forEach((row) => {
        const item = items.find((candidate) => candidate.id === row.id);
        for (const field of ["title", "short_text", "full_text"]) {
          if (/\{fee_/.test(item[field])) withPlaceholders += 1;
          expect({ id: row.id, field, text: asTheServerSends(previewParts(item[field], context).parts) }).toEqual({ id: row.id, field, text: row[field] });
        }
      });
    }
    expect(withPlaceholders).toBeGreaterThanOrEqual(2); // the boat guide and the environmental fee name the place
  });

  it("the amounts come with the peso sign and no decimals, as the app wrote them", () => {
    expect(previewText(previewParts("{fee_regular} / {fee_discounted}", context).parts)).toBe("₱80 / ₱64");
  });
});

describe("what the preview adds: the visitor's name", () => {
  it("puts the guest's name in place of {name}, and says it did", () => {
    const shown = previewParts("Mabuhay, {name}! \u{1F30A}", FULL, ALL);
    expect(shown.usesName).toBe(true);
    expect(previewText(shown.parts)).toBe(`Mabuhay, ${GUEST_NAME}! \u{1F30A}`);
    expect(GUEST_NAME).toBe("Explorer");
    expect(previewParts("Mabuhay!", FULL, ALL).usesName).toBe(false);
  });
});

describe("one pass, and what is not known stays as written", () => {
  it("what is put in is never read again", () => {
    const sneaky = { ...FULL, office: "{fee_regular} {name} {fee_office}" };
    const shown = previewParts("At the {fee_office}.", sneaky, ALL);
    expect(shown.parts.map((part) => part.kind)).toEqual(["text", "filled", "text"]);
    expect(previewText(shown.parts)).toBe("At the {fee_regular} {name} {fee_office}.");
    expect(shown.usesName).toBe(false);
  });

  it("a placeholder nobody knows stays as it is written and is marked", () => {
    const shown = previewParts("Hello {fee_ofice} {x} {}", FULL, ALL);
    expect(previewText(shown.parts)).toBe("Hello {fee_ofice} {x} {}");
    expect(shown.parts.filter((part) => part.kind === "unknown").map((part) => part.text)).toEqual(["{fee_ofice}", "{x}", "{}"]);
  });

  it("a placeholder the table knows but the server does not allow in this field is marked too", () => {
    const shown = previewParts("Hi {name}", FULL, ["fee_regular", "fee_discounted", "fee_office"]);
    expect(shown.parts.find((part) => part.token === "{name}").kind).toBe("unknown");
    expect(shown.usesName).toBe(true); // the flag says what the text uses; the mark says whether it may
  });

  it("a text with no placeholder comes back the same, in one piece", () => {
    const shown = previewParts("Plain text.", FULL, ALL);
    expect(shown.parts).toEqual([{ kind: "text", text: "Plain text." }]);
    expect(previewParts("", FULL, ALL).parts).toEqual([]);
    expect(previewParts(null, FULL, ALL).parts).toEqual([]);
  });
});

describe("what cannot be filled in", () => {
  it("the place missing: the text is flagged, nothing is invented", () => {
    for (const office of [null]) {
      const shown = previewParts("Pay at the {fee_office}.", { ...FULL, office }, ALL);
      expect(shown.officeMissing).toBe(true);
      expect(shown.parts.find((part) => part.token === "{fee_office}").kind).toBe("missing");
    }
    expect(previewParts("No place named.", { ...FULL, office: null }, ALL).officeMissing).toBe(false); // only a text that needs it
  });

  it("an amount missing: [fee not available] stands where it goes, and only for the amount that is missing", () => {
    const shown = previewParts("{fee_regular} or {fee_discounted}", { regular: null, discounted: 64, office: "x" }, ALL);
    expect(shown.feeMissing).toBe(true);
    expect(previewText(shown.parts)).toBe(`${FEE_NOT_AVAILABLE} or ₱64`);
    expect(FEE_NOT_AVAILABLE).toBe("[fee not available]");
  });

  it("the context takes whatever shape the answer has, and never throws", () => {
    const empty = { regular: null, discounted: null, office: null };
    for (const data of [null, undefined, {}, { fee: null }, { fee: "80" }, { fee: { regular: "80", discounted: NaN } }, { blocks: "x" }, { blocks: [null, 3] }]) {
      expect(previewContext(data)).toEqual(empty);
    }
    expect(previewContext({ fee: { regular: 80 }, blocks: [{ key: "fee_office", body: "   " }] })).toEqual({ regular: 80, discounted: null, office: null });
    expect(previewContext({ fee: FEE, blocks: [{ key: "fee_office", body: "  The desk  " }] }).office).toBe("The desk");
  });
});

describe("the warnings before saving (never a refusal)", () => {
  it("an unknown placeholder is warned about once, in the agreed words", () => {
    expect(placeholderWarnings("Pay at the {fee_ofice}, or {fee_ofice}", ALL)).toEqual([
      "{fee_ofice} is not one of the placeholders listed above, so this text will be refused when you save.",
    ]);
  });

  it("a bracket without a partner is warned about", () => {
    const stray = "A curly bracket in this text has no partner, so this text will be refused when you save.";
    expect(placeholderWarnings("Pay at {fee_regular and {fee_office}", ALL)).toContain(stray);
    expect(placeholderWarnings("text } with a stray bracket", ALL)).toEqual([stray]);
    expect(placeholderWarnings("{fee_office", ALL)).toEqual([stray]);
  });

  it("the six malformed ones the server refuses are all warned about here too", () => {
    const six = ["{{fee_regular}}", "{ fee_regular }", "{fee_regular }", "{ fee_regular}", "{FEE_REGULAR}", "{{name}}"];
    six.forEach((text) => expect({ text, warned: placeholderWarnings(text, ALL).length > 0 }).toEqual({ text, warned: true }));
  });

  it("a well-formed text is not warned about, whichever allowed placeholders it uses", () => {
    expect(placeholderWarnings("Pay {fee_regular} or {fee_discounted} at the {fee_office}. Mabuhay, {name}!", ALL)).toEqual([]);
    expect(placeholderWarnings("Plain.", ALL)).toEqual([]);
    expect(placeholderWarnings("", ALL)).toEqual([]);
    expect(placeholderWarnings(null, ALL)).toEqual([]);
  });

  it("a placeholder the field does not allow is warned about, though it is well formed", () => {
    expect(placeholderWarnings("Hi {name}", ["fee_regular"])).toEqual([
      "{name} is not one of the placeholders listed above, so this text will be refused when you save.",
    ]);
  });

  it("a fee amount typed by hand is NOT looked for: only the server says that", () => {
    for (const typed of ["Pay P80", "Pay ₱80", "PHP 64 only", "₱64.00"]) expect(placeholderWarnings(typed, ALL)).toEqual([]);
  });
});

describe("putting a placeholder in", () => {
  it("goes in place of the selection, at the caret, or at the end when the place is not known", () => {
    expect(insertAt("Hello world", "{name}", 6, 11)).toEqual({ value: "Hello {name}", caret: 12 });
    expect(insertAt("Hello world", "{name}", 5, 5)).toEqual({ value: "Hello{name} world", caret: 11 });
    expect(insertAt("Hello", "{name}", undefined, undefined)).toEqual({ value: "Hello{name}", caret: 11 });
    expect(insertAt("", "{name}", 0, 0)).toEqual({ value: "{name}", caret: 6 });
    expect(insertAt(null, "{name}", null, null)).toEqual({ value: "{name}", caret: 6 });
  });

  it("never goes outside the text, and keeps the letters on both sides whole", () => {
    expect(insertAt("abc", "{x}", 99, 120).value).toBe("abc{x}");
    expect(insertAt("abc", "{x}", -5, -1).value).toBe("{x}abc");
    expect(insertAt("abc", "{x}", 2, 1).value).toBe("ab{x}c"); // an end before the start is taken as the start
  });
});
