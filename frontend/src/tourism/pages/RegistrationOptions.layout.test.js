import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RegistrationOptions from "./RegistrationOptions";
import { EmergencyHotlinesPanel } from "./EmergencyHotlines";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

// The name / tier-text boxes of the five tabs take the WHOLE width of their form (the
// tier texts are up to 42 letters long); the other inputs keep their width; and in the
// fare tab the edit form has space below it. jsdom has no layout, so this reads what the
// real stylesheet rules say, through computed style, for the real rendered forms.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");

// One rule of the real stylesheet, by its exact selector: the text from the selector to its closing brace.
function ruleOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const match = css.match(new RegExp(`^${escaped}\\s*\\{[^}]*\\}`, "m"));
  if (!match) throw new Error(`no rule "${selector}" in the stylesheet`);
  return match[0];
}

let styleTag;
beforeEach(() => {
  styleTag = document.createElement("style");
  // the generic rule that gives every settings input 160px, then the two rules this change adds
  styleTag.textContent = [
    ruleOf(".settings-field input"),
    ruleOf(".options-form .settings-field-wide input"),
    ruleOf(".boat-fare-panel .options-edit-form,\n.boat-fare-panel .options-add-form"),
  ].join("\n");
  document.head.appendChild(styleTag);
});
afterEach(() => styleTag.remove());

const row = (id, name, extra = {}) => ({ id, name, is_active: true, record_count: 0, rename_protected: false, ...extra });
const fare = (id, name, display_order, record_count) => ({ id, name, display_order, is_active: true, record_count });
const lists = {
  itinerary: [row(7, "6 Nights", { stay_nights: 6, record_count: 4 })],
  "travel-mode": [row(3, "Public Bus", { record_count: 6 })],
  "boat-type": [row(2, "Passenger Boat", { record_count: 7, requires_capacity_fare: false })],
  "visit-purpose": [row(2, "Vacation", { record_count: 9 })],
};
const fares = [fare(21, "Oscar 1-2 pax (One-Way P1000, Two-way P1400)", 10, 2)];

function reply(body) {
  return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}

beforeEach(() => {
  useAuth.mockReturnValue({ role: "admin" });
  useTourismData.mockImplementation(() => ({ refreshReferenceTables: jest.fn(), referenceTables: { boatTypes: [] } }));
  global.fetch = jest.fn((url) => {
    const p = url.replace(/^.*\/api/, "");
    const ref = p.match(/^\/reference-options\/([a-z-]+)\/$/);
    if (ref) return reply(lists[ref[1]]);
    if (p === "/boat-capacity-fares/") return reply(fares);
    if (p === "/emergency-contacts/") return reply([]);
    return Promise.resolve({ ok: false, status: 404, text: async () => "{}", json: async () => ({}) });
  });
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  delete window.HTMLElement.prototype.scrollIntoView;
});

const width = (el) => window.getComputedStyle(el).getPropertyValue("width");
const boxSizing = (el) => window.getComputedStyle(el).getPropertyValue("box-sizing");

const FIVE = [
  ["Travel Itinerary", "6 Nights", "New option name", "Option name", /add option/i],
  ["Vehicle Classification", "Public Bus", "New option name", "Option name", /add option/i],
  ["Boat Classification", "Passenger Boat", "New option name", "Option name", /add option/i],
  ["Visit Purpose", "Vacation", "New option name", "Option name", /add option/i],
  ["Boat Capacity and Fare", "Oscar 1-2 pax (One-Way P1000, Two-way P1400)", "New tier text", "Tier text", /add option/i],
];

async function open(tab, rowName) {
  render(<RegistrationOptions />);
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  await waitFor(() => expect(screen.getByRole("tab", { name: tab }).getAttribute("aria-selected")).toBe("true"));
  await screen.findByText(rowName, { selector: "td" });
}

describe("d) the name / tier-text box takes the whole width of its form, in all five tabs", () => {
  it("the stylesheet rule is there, and the generic 160px rule it overrides is still the generic one", () => {
    expect(ruleOf(".settings-field input")).toMatch(/width:\s*160px/); // not touched
    expect(ruleOf(".options-form .settings-field-wide input")).toMatch(/width:\s*100%/);
    expect(ruleOf(".options-form .settings-field-wide input")).toMatch(/box-sizing:\s*border-box/);
  });

  it.each(FIVE)("%s: the EDIT form's name box is 100% wide (and not 160px)", async (tab, rowName, _add, editLabel) => {
    await open(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));
    const input = screen.getByLabelText(editLabel);
    expect(width(input)).toBe("100%");
    expect(width(input)).not.toBe("160px");
    expect(boxSizing(input)).toBe("border-box"); // so its padding does not push it out of the form
    expect(input.closest("label").className).toContain("settings-field-wide");
    expect(input.closest("form, section").className).toContain("options-form");
  });

  it.each(FIVE)("%s: the ADD form's name box is 100% wide too", async (tab, rowName, addLabel, _edit, addButton) => {
    await open(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: addButton }));
    expect(width(screen.getByLabelText(addLabel))).toBe("100%");
  });

  it("a long tier text (42 letters and more) has the room: the box is the form's width, not a fixed 160px", async () => {
    await open("Boat Capacity and Fare", FIVE[4][1]);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${FIVE[4][1]}` }));
    const input = screen.getByLabelText("Tier text");
    expect(input.value.length).toBeGreaterThan(42);
    expect(width(input)).toBe("100%");
  });

  it("the stay-length box of the itinerary keeps its own width: only the name boxes changed", async () => {
    await open("Travel Itinerary", "6 Nights");
    fireEvent.click(screen.getByRole("button", { name: "Edit 6 Nights" }));
    const stay = screen.getByLabelText("Stay length in nights");
    expect(width(stay)).toBe("160px");
    expect(stay.closest("label").className).not.toContain("settings-field-wide");
  });

  it("the filter box and every other input of the page keep theirs", async () => {
    await open("Travel Itinerary", "6 Nights");
    expect(screen.getByLabelText("Filter by status").closest("label").className).not.toContain("settings-field-wide");
  });

  it("the Emergency Hotlines forms, which share the same classes, are NOT changed", async () => {
    render(<EmergencyHotlinesPanel />);
    await screen.findByText(/No contacts to show|Contacts, in the order/);
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const input = screen.getByLabelText("Contact name");
    expect(input.closest("label").className).not.toContain("settings-field-wide");
    expect(width(input)).toBe("160px"); // as it was
  });
});

describe("space between the edit form and the list", () => {
  it("fare tab: the edit form has 24px below it, and it is not inside the page's flex layout", async () => {
    await open("Boat Capacity and Fare", FIVE[4][1]);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${FIVE[4][1]}` }));
    const form = screen.getByRole("form", { name: `Edit ${FIVE[4][1]}` });
    expect(window.getComputedStyle(form).getPropertyValue("margin-bottom")).toBe("24px");
    expect(form.parentElement.className).toContain("boat-fare-panel"); // a plain box: no gap of its own
    // and the list that follows it comes right after in the same box
    expect(form.nextElementSibling.getAttribute("aria-label")).toBe("Boat Capacity and Fare tiers");
  });

  it.each(FIVE.slice(0, 4))("%s: the edit form is a direct child of the page, which spaces its children by 24px (gap-6), so it gets no extra margin", async (tab, rowName) => {
    await open(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));
    const form = document.querySelector(`section[aria-label="Edit ${rowName}"]`);
    expect(form.parentElement.className).toContain("reports-page");
    expect(window.getComputedStyle(form).getPropertyValue("margin-bottom")).toBe(""); // none of its own: no doubling
    expect(css).toMatch(/\.reports-page\s*\{\s*@apply flex flex-col gap-6;/); // where the 24px comes from
  });

  it("the extra margin is for the fare panel only: no other rule gives the add or edit form class a margin", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]*options-(?:edit|add)-form[^{]*\{[^}]*\}/g) || [];
    expect(rules.map((r) => r.replace(/\s+/g, " ").trim())).toEqual([
      ".boat-fare-panel .options-edit-form, .boat-fare-panel .options-add-form { margin-bottom: 24px; }",
    ]);
  });

  it("fare tab: the ADD form has the same 24px below it as the edit form", async () => {
    await open("Boat Capacity and Fare", FIVE[4][1]);
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    const form = screen.getByRole("form", { name: "Add a tier" });
    expect(window.getComputedStyle(form).getPropertyValue("margin-bottom")).toBe("24px");
    expect(form.parentElement.className).toContain("boat-fare-panel");
    expect(form.nextElementSibling.getAttribute("aria-label")).toBe("Boat Capacity and Fare tiers");
    const addGap = window.getComputedStyle(form).getPropertyValue("margin-bottom");
    // the same value as the edit form
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: `Edit ${FIVE[4][1]}` }));
    const edit = screen.getByRole("form", { name: `Edit ${FIVE[4][1]}` });
    expect(window.getComputedStyle(edit).getPropertyValue("margin-bottom")).toBe(addGap);
  });

  it.each(FIVE.slice(0, 4))("%s: the ADD form is a direct child of the page (gap-6) and gets NO margin of its own, so the gap is not doubled", async (tab, rowName, _addLabel, _editLabel, addButton) => {
    await open(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: addButton }));
    const form = document.querySelector(`form[aria-label="Add to ${tab}"]`);
    expect(form).not.toBeNull();
    expect(form.parentElement.className).toContain("reports-page");
    expect(form.className).not.toContain("options-add-form");
    expect(window.getComputedStyle(form).getPropertyValue("margin-bottom")).toBe("");
  });

  it("the space between the add or edit form and the list is the same 24px in all five tabs: a margin in the fare tab, the page's gap in the four others", async () => {
    // fare tab: the margin
    await open("Boat Capacity and Fare", FIVE[4][1]);
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    const fareGap = window.getComputedStyle(screen.getByRole("form", { name: "Add a tier" })).getPropertyValue("margin-bottom");
    expect(fareGap).toBe("24px");
    // the four others: gap-6 of the page, which is 1.5rem = 24px in the stylesheet's own words
    expect(css).toMatch(/\.reports-page\s*\{\s*@apply flex flex-col gap-6;/);
    expect(24).toBe(6 * 4); // Tailwind's gap-6 is 6 x 4px
  });
});
