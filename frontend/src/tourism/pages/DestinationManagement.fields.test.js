/**
 * The fields, the labels and the "Apply pin" button of the Edit Destination modal.
 *
 * The values are read from Tourism_index.css itself. The page is drawn, and for every field the rules of BOTH stylesheets that match it are
 * collected, so the test can say which one wins by specificity (jsdom does not apply a stylesheet, and when it computes a style it ignores
 * specificity, so the cascade is worked out here). The LocationPicker is also drawn outside the modal to show that nothing changed for it.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import DestinationManagement from "./DestinationManagement";
import LocationPicker from "../../shared/LocationPicker";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/destinations" }) }), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: jest.fn(), getZoom: () => 13 }),
  useMapEvents: () => null,
}));
jest.mock("leaflet", () => ({
  __esModule: true,
  default: { DivIcon: class {} },
  DivIcon: class {},
}));

const read = (...parts) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
const tourismCss = read("..", "Tourism_index.css");
const pickerCss = read("..", "..", "shared", "LocationPicker.css");

// ---- a small CSS reader: [{selector, declarations, order, sheet}] for every plain rule, a rule of a list split into one per selector ----
function parseRules(text, sheet) {
  const clean = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(?:media|keyframes|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const rules = [];
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = {};
    for (const line of match[2].split(";")) {
      const at = line.indexOf(":");
      if (at < 0) continue;
      const property = line.slice(0, at).trim();
      if (/^[a-z-]+$/.test(property)) declarations[property] = line.slice(at + 1).trim();
    }
    for (const selector of match[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      rules.push({ selector, declarations, sheet, order: rules.length });
    }
  }
  return rules;
}

const tourismRules = parseRules(tourismCss, "tourism");
const pickerRules = parseRules(pickerCss, "picker");

// (ids, classes + attributes + pseudo-classes, elements), as a number that compares like the real thing
function specificity(selector) {
  const stripped = selector.replace(/::?[a-z-]+\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, " [] ");
  const ids = (stripped.match(/#[\w-]+/g) || []).length;
  const pseudoElements = (stripped.match(/::[a-z-]+/g) || []).length;
  const classes = (stripped.match(/\.[\w-]+|\[\]|:(?!:)[a-z-]+/g) || []).length;
  const elements = (stripped.replace(/[.#:][\w-]+|\[\]/g, " ").match(/(?:^|[\s>+~])[a-z][a-z0-9]*/gi) || []).length + pseudoElements;
  return ids * 10000 + classes * 100 + elements;
}

const only = (selector) => [...tourismRules, ...pickerRules].filter((rule) => rule.selector === selector);
function declared(selector) {
  const found = only(selector);
  if (!found.length) throw new Error(`no rule for ${selector}`);
  return Object.assign({}, ...found.map((rule) => rule.declarations));
}

// What an element ends up with, property by property: the matching rule of the highest specificity (a tie goes to the later sheet, and the
// picker's sheet is taken as the later). Pseudo-class rules are left out; `state` adds ":focus" to the ones that count.
function cascade(element, properties, state = "") {
  const result = {};
  for (const property of properties) {
    const candidates = [...tourismRules, ...pickerRules].filter((rule) => {
      if (!(property in rule.declarations)) return false;
      const base = state ? rule.selector.replace(`:${state}`, "") : rule.selector;
      if (!state && rule.selector.includes(":")) return false;
      if (state && !rule.selector.includes(`:${state}`) && rule.selector.includes(":")) return false;
      try {
        return element.matches(base);
      } catch (error) {
        return false;
      }
    });
    candidates.sort((a, b) => specificity(a.selector) - specificity(b.selector) || (a.sheet === b.sheet ? a.order - b.order : a.sheet === "picker" ? 1 : -1));
    const winner = candidates[candidates.length - 1];
    const runnerUp = candidates[candidates.length - 2];
    result[property] = {
      value: winner ? winner.declarations[property] : undefined,
      selector: winner?.selector,
      strictlyAhead: !runnerUp || specificity(winner.selector) > specificity(runnerUp.selector),
    };
  }
  return result;
}

const white = (value) => ["#fff", "#ffffff"].includes(value);
const texts = (nodes) => Array.from(nodes).map((node) => node.textContent);

const RESORT = {
  resort_id: 4,
  resort_name: "Beach One",
  is_active: true,
  type: "Beach Resort",
  location: "Cagbalete, Mauban",
  access: "Boat",
  short_description: "A beach.",
  with_mayors_permit: true,
  tourism_rating: 4.8,
  review_count: 1,
  monthly_arrivals: 1,
  yearly_arrivals: 2,
  itinerary_ids: [],
  images: [],
  latitude: 14.2,
  longitude: 121.7,
};

function openEdit() {
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [RESORT], itineraries: [] },
    feedbackEntries: [],
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn(),
    unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(),
    updateResort: jest.fn(),
    uploadResortImage: jest.fn(),
  });
  render(<DestinationManagement initialTab="destinations" />);
  const card = screen.getByRole("heading", { name: "Beach One" }).closest(".destination-card");
  fireEvent.click(within(card).getByTitle("Edit Destination & Images"));
  return document.querySelector("form.dest-edit");
}

const FIELD_SELECTORS = [
  ".dest-edit .tourist-record-field input",
  ".dest-edit .tourist-record-field select",
  ".dest-edit .tourist-record-field textarea",
  ".dest-edit .location-picker-search input",
];

describe("the fields, in the CSS file", () => {
  it.each(FIELD_SELECTORS)("%s: white, a 1px #E0CDB7 border, radius 9, min-height 40, padding 9px 12px, 14px, #241E1A", (selector) => {
    const rule = declared(selector);
    expect(white(rule.background)).toBe(true);
    expect(rule).toMatchObject({
      border: "1px solid #e0cdb7",
      "border-radius": "9px",
      "min-height": selector.endsWith("textarea") ? "96px" : "40px",
      padding: "9px 12px",
      "font-size": "14px",
      color: "#241e1a",
    });
  });

  it.each([
    ".dest-edit .tourist-record-field input:focus",
    ".dest-edit .tourist-record-field select:focus",
    ".dest-edit .tourist-record-field textarea:focus",
    ".dest-edit .location-picker-search input:focus",
  ])("%s: an orange outline of 2px, pulled in by 1px", (selector) => {
    expect(declared(selector)).toMatchObject({ outline: "2px solid #e0701a", "outline-offset": "-1px" });
  });

  it("the labels are 11px uppercase, letter-spacing .07em, #8A6E55, w700, with 6px under them", () => {
    expect(declared(".dest-edit .tourist-record-field > span")).toMatchObject({
      "font-size": "11px",
      "text-transform": "uppercase",
      "letter-spacing": "0.07em",
      color: "#8a6e55",
      "font-weight": "700",
      "margin-bottom": "6px",
    });
  });

  it("Apply pin is white with a #E0CDB7 border, #453931, radius 9, min-height 40, padding 0 16px, 13.5px w600", () => {
    const rule = declared(".dest-edit .location-picker-search button");
    expect(white(rule.background)).toBe(true);
    expect(rule).toMatchObject({
      border: "1px solid #e0cdb7",
      color: "#453931",
      "border-radius": "9px",
      "min-height": "40px",
      padding: "0 16px",
      "font-size": "13.5px",
      "font-weight": "600",
    });
  });

  it("the textarea keeps its taller minimum: a 40px box is no place to write a paragraph", () => {
    expect(declared(".dest-edit .tourist-record-field textarea")["min-height"]).toBe("96px");
  });
});

describe("the markup uses the classes that CSS aims at", () => {
  it("every selector of the rules above finds something in the drawn modal", () => {
    const form = openEdit();
    const selectors = [
      ...FIELD_SELECTORS,
      ".dest-edit .tourist-record-field > span",
      ".dest-edit .location-picker-search button",
    ];
    for (const selector of selectors) {
      expect({ selector, found: document.querySelectorAll(selector).length > 0 }).toEqual({ selector, found: true });
    }
    expect(form.classList.contains("dest-edit")).toBe(true);
  });

  it("every input, select and textarea of the modal is hit by one of those selectors (the hidden file picker apart)", () => {
    const form = openEdit();
    const fields = Array.from(form.querySelectorAll("input:not([type=file]), select, textarea"));
    expect(fields.length).toBeGreaterThanOrEqual(9);
    for (const field of fields) {
      const hit = FIELD_SELECTORS.some((selector) => field.matches(selector));
      expect({ field: field.outerHTML.slice(0, 70), hit }).toEqual({ field: field.outerHTML.slice(0, 70), hit: true });
    }
  });

  it("the labels are exactly these eight, as labels and not as headings", () => {
    const form = openEdit();
    const labels = Array.from(form.querySelectorAll(".dest-edit .tourist-record-field > span"));
    expect(labels.map((label) => label.textContent)).toEqual([
      "Destination name",
      "Category",
      "Location",
      "Mayor's permit",
      "Access",
      "Latitude",
      "Longitude",
      "Image key",
    ]);
    for (const label of labels) {
      expect(label.tagName).toBe("SPAN");
      expect(label.closest("label")).not.toBeNull();
    }
    // the headings of the modal are the h2 of the title and the six group titles, none of them a field label
    expect(Array.from(form.querySelectorAll("h2, h3")).map((h) => h.textContent)).toEqual([
      "Edit destination",
      "Name and category",
      "Status",
      "How a visitor gets here",
      "Photos",
      "Where it is",
      "Description",
    ]);
  });
});

describe("the cascade: the new rules win over the old ones", () => {
  it("a text input gets the new border, radius, padding, size and colour, each from a .dest-edit rule that is strictly more specific", () => {
    const form = openEdit();
    const input = form.querySelector('.tourist-record-field input[type="text"]');
    const won = cascade(input, ["border", "border-radius", "padding", "font-size", "color", "min-height", "height"]);
    for (const property of ["border", "border-radius", "padding", "font-size", "color", "min-height"]) {
      expect({ property, from: won[property].selector?.startsWith(".dest-edit"), ahead: won[property].strictlyAhead }).toEqual({ property, from: true, ahead: true });
    }
    expect(won.border.value).toBe("1px solid #e0cdb7");
    expect(won.height.value).toBe("auto"); // not the old 34px
  });

  it("a label gets the new look, not the old black sentence-case one", () => {
    const form = openEdit();
    const label = form.querySelector(".tourist-record-field > span");
    const won = cascade(label, ["font-size", "color", "text-transform", "letter-spacing", "margin-bottom", "font-weight"]);
    expect(won["font-size"].value).toBe("11px");
    expect(won.color.value).toBe("#8a6e55");
    expect(won["text-transform"].value).toBe("uppercase");
    expect(won["letter-spacing"].value).toBe("0.07em");
    expect(won["margin-bottom"].value).toBe("6px");
    for (const property of Object.keys(won)) {
      expect({ property, ahead: won[property].strictlyAhead }).toEqual({ property, ahead: true });
    }
  });

  it("on focus the outline is the orange one and the old blue ring is gone", () => {
    const form = openEdit();
    const input = form.querySelector('.tourist-record-field input[type="text"]');
    const won = cascade(input, ["outline", "outline-offset", "box-shadow", "border-color"], "focus");
    expect(won.outline.value).toBe("2px solid #e0701a");
    expect(won["outline-offset"].value).toBe("-1px");
    expect(won["box-shadow"].value).toBe("none"); // not the old rgba(18, 183, 245, ...) ring
    expect(won["border-color"].value).toBe("#e0cdb7");
    for (const property of Object.keys(won)) {
      expect({ property, ahead: won[property].strictlyAhead }).toEqual({ property, ahead: true });
    }
  });

  it("the paste-a-link input and the Apply pin button get the new look, over the picker's own", () => {
    const form = openEdit();
    const input = form.querySelector(".location-picker-search input");
    const button = form.querySelector(".location-picker-search button");
    const inputWon = cascade(input, ["border", "border-radius", "font-size", "color", "padding", "height"]);
    const buttonWon = cascade(button, ["background", "border", "color", "border-radius", "font-size", "font-weight", "padding", "height", "min-height"]);
    expect(inputWon.border.value).toBe("1px solid #e0cdb7");
    expect(buttonWon.background.value).toBe("#ffffff");
    expect(buttonWon.border.value).toBe("1px solid #e0cdb7");
    expect(buttonWon.color.value).toBe("#453931");
    expect(buttonWon["font-size"].value).toBe("13.5px");
    for (const won of [inputWon, buttonWon]) {
      for (const property of Object.keys(won)) {
        expect({ property, from: won[property].selector?.startsWith(".dest-edit"), ahead: won[property].strictlyAhead }).toEqual({ property, from: true, ahead: true });
      }
    }
  });
});

describe("Description is said once", () => {
  it("the title is there once, the textarea has no visible label and no placeholder of that word, and is still named for assistive technology", () => {
    const form = openEdit();
    expect(within(form).getAllByText("Description")).toHaveLength(1);
    expect(within(form).getByText("Description").tagName).toBe("H3");
    const textarea = form.querySelector("textarea");
    expect(textarea.getAttribute("placeholder")).toBe("");
    expect(within(form).getByRole("textbox", { name: "Description" })).toBe(textarea);
    expect(textarea.closest("label").querySelector("span")).toBeNull();
    expect(within(form).getByText("The paragraph under the name in the app.")).toBeTruthy();
  });
});

describe("the space between Latitude / Longitude and the map", () => {
  // The picker's own CSS file gives the map no margin; the space is the row's, and it is read from Tourism_index.css.
  const ROW = ".dest-edit .location-picker > .dest-row-2";

  it("is 16px in the CSS file", () => {
    expect(declared(ROW)["margin-bottom"]).toBe("16px");
  });

  it("the row is directly above the map in the drawn modal, and the row's margin is the whole space", () => {
    const form = openEdit();
    const row = form.querySelector(".location-picker > .dest-row-2");
    expect(row).not.toBeNull();
    expect(row.matches(ROW)).toBe(true);
    expect(row.nextElementSibling.className).toBe("location-picker-map");
    expect(texts(row.querySelectorAll("label > span"))).toEqual(["Latitude", "Longitude"]);

    const below = cascade(row, ["margin-bottom", "margin"]);
    const above = cascade(row.nextElementSibling, ["margin-top", "margin"]);
    expect(below["margin-bottom"].value).toBe("16px");
    expect(below["margin-bottom"].strictlyAhead).toBe(true);
    expect(below["margin-bottom"].selector.startsWith(".dest-edit")).toBe(true);
    expect(above["margin-top"].value).toBeUndefined(); // nothing pushes the map from its side
    expect(above.margin.value).toBeUndefined();
    expect(Number.parseFloat(below["margin-bottom"].value)).toBe(16);
  });

  it("nothing outside the modal gets that margin: the rule starts with .dest-edit and the picker alone has none", () => {
    const { container } = render(<LocationPicker latitude="14.2" longitude="121.7" onChange={jest.fn()} beforeMap={<div className="dest-row-2" />} />);
    const row = container.querySelector(".location-picker > .dest-row-2");
    expect(row.matches(ROW)).toBe(false);
    expect(cascade(row, ["margin-bottom"])["margin-bottom"].value).toBeUndefined();
  });
});

describe("the LocationPicker outside the destination modal", () => {
  const PICKER_SELECTORS = [".location-picker-search input", ".location-picker-search button"];

  it("no rule of Tourism_index.css touches it except under .dest-edit", () => {
    const touching = tourismRules.filter((rule) => rule.selector.includes("location-picker"));
    expect(touching.length).toBeGreaterThan(0); // the fixture reached its case
    for (const rule of touching) {
      expect({ selector: rule.selector, scoped: rule.selector.startsWith(".dest-edit ") }).toEqual({ selector: rule.selector, scoped: true });
    }
  });

  it("LocationPicker.css itself is as it was: the green button and the grey-bordered input, and no word of the destination modal", () => {
    expect(declared(".location-picker-search button")).toMatchObject({
      height: "38px",
      border: "0",
      "border-radius": "7px",
      background: "#064f34",
      padding: "0 13px",
      "font-size": "12px",
      "font-weight": "800",
      color: "#ffffff",
    });
    expect(declared(".location-picker-search input")).toMatchObject({
      height: "38px",
      border: "1px solid #cbd5d1",
      "border-radius": "7px",
      padding: "0 11px",
      "font-size": "12px",
      "font-weight": "700",
      color: "#334155",
    });
    expect(pickerCss).not.toMatch(/dest-|\.dest/);
  });

  it("drawn on its own, the button is still the green one and the input the grey-bordered one", () => {
    const { container } = render(<LocationPicker latitude="14.2" longitude="121.7" onChange={jest.fn()} />);
    expect(container.closest(".dest-edit")).toBeNull();
    const button = container.querySelector(".location-picker-search button");
    const input = container.querySelector(".location-picker-search input");
    expect(button.textContent).toBe("Apply Pin");

    const buttonWon = cascade(button, ["background", "border", "height", "font-size", "font-weight", "color"]);
    const inputWon = cascade(input, ["border", "height", "font-size", "color"]);
    expect(buttonWon.background.value).toBe("#064f34");
    expect(buttonWon.border.value).toBe("0");
    expect(buttonWon.height.value).toBe("38px");
    expect(buttonWon["font-size"].value).toBe("12px");
    expect(buttonWon["font-weight"].value).toBe("800");
    expect(inputWon.border.value).toBe("1px solid #cbd5d1");
    expect(inputWon.height.value).toBe("38px");
    for (const won of [buttonWon, inputWon]) {
      for (const property of Object.keys(won)) {
        expect({ property, from: won[property].selector?.startsWith(".location-picker"), ahead: true }).toEqual({ property, from: true, ahead: true });
      }
    }
    // and none of the selectors the modal uses finds it
    for (const selector of [...FIELD_SELECTORS, ".dest-edit .location-picker-search button"]) {
      expect(container.querySelector(selector)).toBeNull();
    }
    expect(PICKER_SELECTORS.every((selector) => container.querySelector(selector))).toBe(true);
  });
});
