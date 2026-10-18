import { INACTIVE_MARK } from "./optionChoices";
import { NOT_IN_LIST_MARK, fareChoicesFor, fareTiers } from "./fareChoices";

const tier = (name, display_order, extra = {}) => ({ name, display_order, is_active: true, ...extra });

// Different names, orders and states; the ids the server sends are not used.
const TIERS = [
  tier("Charlie tier", 30),
  tier("Alpha tier", 10),
  tier("Delta tier", 40, { is_active: false }),
  tier("Bravo tier", 20),
];

const labels = (choices) => choices.map((c) => c.label);
const values = (choices) => choices.map((c) => c.value);

describe("fareChoicesFor", () => {
  it("a) lists the active tiers in display_order, with the text itself as value and no mark", () => {
    const choices = fareChoicesFor(TIERS, null);
    expect(values(choices)).toEqual(["Alpha tier", "Bravo tier", "Charlie tier"]);
    expect(labels(choices)).toEqual(["Alpha tier", "Bravo tier", "Charlie tier"]);
  });

  it("does not offer a retired tier to a record that does not hold it", () => {
    for (const keep of [null, undefined, "", "Alpha tier"]) {
      expect(values(fareChoicesFor(TIERS, keep))).not.toContain("Delta tier");
    }
  });

  it("b) keeps a retired tier the record holds, in ITS place by display_order, marked, same text as value", () => {
    const choices = fareChoicesFor(TIERS, "Delta tier");
    expect(values(choices)).toEqual(["Alpha tier", "Bravo tier", "Charlie tier", "Delta tier"]);
    expect(labels(choices)[3]).toBe(`Delta tier${INACTIVE_MARK}`);
    expect(INACTIVE_MARK).toBe(" (inactive)");

    // in the middle when its order is in the middle
    const middle = [tier("A", 10), tier("B", 20, { is_active: false }), tier("C", 30)];
    expect(values(fareChoicesFor(middle, "B"))).toEqual(["A", "B", "C"]);
    expect(labels(fareChoicesFor(middle, "B"))).toEqual(["A", `B${INACTIVE_MARK}`, "C"]);
  });

  it("c) adds a text that is in no tier at the END, marked, with the text itself as value", () => {
    const text = "1-2 pax (One-way P1,500)"; // the kind of thing an Excel import brings
    const choices = fareChoicesFor(TIERS, text);
    expect(values(choices)).toEqual(["Alpha tier", "Bravo tier", "Charlie tier", text]);
    expect(labels(choices)[3]).toBe(`${text}${NOT_IN_LIST_MARK}`);
    expect(NOT_IN_LIST_MARK).toBe(" (not in the list)");
  });

  it("c) also when the list is empty: the record's text is the only choice", () => {
    const choices = fareChoicesFor([], "Held text");
    expect(choices).toEqual([{ value: "Held text", label: `Held text${NOT_IN_LIST_MARK}` }]);
  });

  it("matches the text exactly: other capitals or a stray space are NOT that tier, and keep their own bytes", () => {
    for (const odd of ["ALPHA TIER", "alpha tier", " Alpha tier", "Alpha tier ", "Alpha  tier"]) {
      const choices = fareChoicesFor(TIERS, odd);
      expect(choices[choices.length - 1]).toEqual({ value: odd, label: `${odd}${NOT_IN_LIST_MARK}` });
      expect(values(choices).filter((v) => v === "Alpha tier")).toHaveLength(1);
    }
  });

  it("never changes the text: no trim, no collapsing of spaces, no case change", () => {
    const text = "  Mixed   CASE  text \t";
    expect(fareChoicesFor(TIERS, text).pop().value).toBe(text);
    expect(fareChoicesFor([tier(text, 1, { is_active: false })], text)[0].value).toBe(text);
  });

  it("treats no text, an empty text and a non-text as holding nothing", () => {
    for (const keep of [null, undefined, "", 5, {}]) {
      expect(values(fareChoicesFor(TIERS, keep))).toEqual(["Alpha tier", "Bravo tier", "Charlie tier"]);
    }
  });

  it("a tier with no is_active is treated as active", () => {
    expect(values(fareChoicesFor([{ name: "No flag" }], null))).toEqual(["No flag"]);
  });

  it("tiers with no display_order, or with equal ones, keep the order they were given in", () => {
    expect(values(fareChoicesFor([{ name: "Z" }, { name: "A" }, { name: "M" }], null))).toEqual(["Z", "A", "M"]);
    expect(values(fareChoicesFor([tier("Z", 10), tier("A", 10), tier("M", 10)], null))).toEqual(["Z", "A", "M"]);
  });

  it("does not change the list it is given", () => {
    const before = JSON.stringify(TIERS);
    fareChoicesFor(TIERS, "Delta tier");
    fareChoicesFor(TIERS, "unlisted");
    expect(JSON.stringify(TIERS)).toBe(before);
  });
});

describe("fareTiers", () => {
  const BUILT_IN = ["one", "two", "three"];

  it("uses the server's list when the payload has one", () => {
    const server = [tier("Only one", 1)];
    expect(fareTiers(server, BUILT_IN)).toBe(server);
  });

  it("falls back to the built-in names, in order, all active, when the payload has no list", () => {
    for (const missing of [undefined, null, "text", 5, {}]) {
      const tiers = fareTiers(missing, BUILT_IN);
      expect(tiers.map((t) => t.name)).toEqual(BUILT_IN);
      expect(tiers.every((t) => t.is_active === true)).toBe(true);
      expect(values(fareChoicesFor(tiers, null))).toEqual(BUILT_IN);
    }
  });

  it("an empty list from the server is an empty list: it does NOT fall back", () => {
    expect(fareTiers([], BUILT_IN)).toEqual([]);
    expect(fareChoicesFor(fareTiers([], BUILT_IN), null)).toEqual([]);
  });
});
