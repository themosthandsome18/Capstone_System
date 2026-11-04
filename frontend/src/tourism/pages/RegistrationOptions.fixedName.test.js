/**
 * Registration Options: a name the online booking import matches is marked "Fixed name" in its row, and the reason is on the page ONCE,
 * above the table of each list that has such a name, not under every name. The name is still locked, and the server still answers 409.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RegistrationOptions, { FIXED_NAMES_NOTE, FIXED_NAME_BADGE, FIXED_NAME_HINT } from "./RegistrationOptions";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { rule } from "../testing/cssRules";

jest.mock("react-router-dom", () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

// the words, written out here too: a change of them in the page must be a change of this test
const BADGE = "Fixed name";
const NOTE =
  "Some names are fixed: the online booking import matches on them. Renaming one would make the next import create a second option with the old name, and the reports would be split in two.";
// what the badge keeps as its title, for a mouse
const BADGE_TITLE =
  "The online booking import matches this name. Renaming it would make the next import create a second option with the old name, and the reports would be split in two.";

const row = (id, name, extra = {}) => ({ id, name, is_active: true, record_count: 0, rename_protected: false, ...extra });
const protectedRow = (id, name, extra = {}) => row(id, name, { rename_protected: true, ...extra });

const lists = {
  itinerary: [
    protectedRow(1, "Overnight", { stay_nights: 1 }),
    protectedRow(2, "Same Day", { stay_nights: 0 }),
    protectedRow(3, "2 Nights", { stay_nights: 2 }),
    protectedRow(4, "3 Nights", { stay_nights: 3 }),
    protectedRow(5, "4 Nights", { stay_nights: 4 }),
    protectedRow(6, "5 Nights and above", { stay_nights: 5 }),
    row(7, "6 Nights", { stay_nights: 6 }),
    row(8, "Island Hopping Circuit", { stay_nights: 1 }),
    row(9, "Eco Adventure Trail", { stay_nights: 1 }),
  ],
  "travel-mode": [
    protectedRow(1, "Private Vehicle"),
    protectedRow(2, "Public Utility Vehicle"),
    row(3, "Public Bus"),
    row(4, "Tourist Van"),
  ],
  "boat-type": [row(1, "Tourist Boat", { requires_capacity_fare: true }), row(2, "Passenger Boat", { requires_capacity_fare: false })],
  // 11 purposes, 2 of them protected: the other 9 are free
  "visit-purpose": [
    protectedRow(1, "Team Building"),
    protectedRow(2, "Leisure"),
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) => row(id, `Purpose ${id}`)),
  ],
};

function reply(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}

beforeEach(() => {
  useAuth.mockReturnValue({ role: "admin" });
  useTourismData.mockReturnValue({ refreshReferenceTables: jest.fn() });
  global.fetch = jest.fn((url) => {
    const path = url.replace(/^.*\/api/, "");
    const kind = (path.match(/^\/reference-options\/([a-z-]+)\//) || [])[1];
    if (kind && lists[kind]) return reply(200, lists[kind]);
    if (path.startsWith("/boat-capacity-fares")) return reply(200, [{ id: 1, name: "Up to 10 persons", display_order: 10, is_active: true, record_count: 0 }]);
    return reply(404, { detail: "no such route" });
  });
});

async function open(tabName) {
  render(<RegistrationOptions />);
  await screen.findByRole("table");
  if (tabName) {
    fireEvent.click(screen.getByRole("tab", { name: tabName }));
    await waitFor(() => expect(screen.getByRole("tab", { name: tabName }).getAttribute("aria-selected")).toBe("true"));
    await screen.findByRole("table");
  }
}

const rowOf = (id) => screen.getByTestId(`option-row-${id}`);
const badges = () => screen.queryAllByText(BADGE);
const hints = () => screen.queryAllByText(HINT, { selector: "small" });

describe("the words", () => {
  it("are the ones asked for (the page exports the same)", () => {
    expect(FIXED_NAME_BADGE).toBe(BADGE);
    expect(FIXED_NAMES_NOTE).toBe(NOTE);
    expect(FIXED_NAME_HINT).toBe(BADGE_TITLE);
  });
});

const notes = () => screen.queryAllByText(NOTE);

describe("Length of Stay", () => {
  it("the explanation is on the page once, not six times, and the six badges are still there", async () => {
    await open();

    expect(notes()).toHaveLength(1);
    expect(badges()).toHaveLength(6);
    for (const id of [1, 2, 3, 4, 5, 6]) expect(within(rowOf(id)).getByText(BADGE).className).toBe("options-tag");
  });

  it("it is above the table, under the title of the section, and not in a row", async () => {
    await open();
    const note = notes()[0];
    const table = screen.getByRole("table");

    expect(note.closest("table")).toBeNull();
    expect(note.closest("tr")).toBeNull();
    // after the section's title and before the table, in the page's order
    expect(note.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Length of Stay" }).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.closest(".options-card")).toBe(table.closest(".options-card"));
  });

  it("no row carries the explanation any more: only the badge's title does", async () => {
    await open();

    expect(screen.queryAllByText(BADGE_TITLE)).toHaveLength(0); // as text on the page
    for (const id of [1, 2, 3, 4, 5, 6]) {
      expect(within(rowOf(id)).getByText(BADGE).getAttribute("title")).toBe(BADGE_TITLE);
      expect(rowOf(id).querySelector("small")).toBeNull();
    }
  });

  it("the old words are gone", async () => {
    const { container } = render(<RegistrationOptions />);
    await screen.findByRole("table");

    expect(container.textContent).not.toContain("Name set by the import");
  });

  it("the names that are not the import's have no badge", async () => {
    await open();

    for (const id of [7, 8, 9]) expect(within(rowOf(id)).queryByText(BADGE)).toBeNull();
  });

  it("the name of a fixed one is still locked: there is no input to change it", async () => {
    await open();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /^Edit / }));

    expect(screen.getByLabelText("Option name").disabled).toBe(true);
  });
});

describe("Vehicle Classification", () => {
  it("the two protected names keep their badge, and the explanation is there once", async () => {
    await open("Vehicle Classification");

    expect(badges()).toHaveLength(2);
    expect(notes()).toHaveLength(1);
    expect(within(rowOf(3)).queryByText(BADGE)).toBeNull();
  });
});

describe("Visit Purpose", () => {
  it("2 of the 11 are marked and the explanation is there once; the other 9 have no badge", async () => {
    await open("Visit Purpose");

    expect(screen.getAllByTestId(/^option-row-/)).toHaveLength(11);
    expect(badges()).toHaveLength(2);
    expect(notes()).toHaveLength(1);
    for (const id of [3, 4, 5, 6, 7, 8, 9, 10, 11]) expect(within(rowOf(id)).queryByText(BADGE)).toBeNull();
  });

  it("an unprotected one can still be renamed (its name field works), a protected one cannot", async () => {
    await open("Visit Purpose");

    fireEvent.click(within(rowOf(5)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(rowOf(2)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(true);
  });
});

describe("the two that are not locked", () => {
  it("Boat Type has no badge and no explanation", async () => {
    await open("Boat Classification");

    expect(screen.getAllByTestId(/^option-row-/)).toHaveLength(2);
    expect(badges()).toHaveLength(0);
    expect(notes()).toHaveLength(0);
  });

  it("Boat Capacity and Fare has no badge and no explanation", async () => {
    await open("Boat Capacity and Fare");
    await screen.findByText("Up to 10 persons");

    expect(badges()).toHaveLength(0);
    expect(notes()).toHaveLength(0);
  });
});

describe("it is a hint, not a warning", () => {
  it("the line is of the page's hint kind, not its warning (reason) kind", async () => {
    await open();

    const note = notes()[0];
    expect(note.classList.contains("options-hint")).toBe(true);
    expect(note.classList.contains("options-reason")).toBe(false);
  });

  it("small and in the quiet colour of the other hints, with no warning background", () => {
    expect(rule(".options-hint").color).toBe("var(--th-text-muted)");
    expect(rule(".options-hint")["font-size"]).toBe("12px");
    expect(JSON.stringify(rule(".options-fixed-note"))).not.toMatch(/warning|danger|background|#[0-9a-f]{3,6}/i);
  });
});
