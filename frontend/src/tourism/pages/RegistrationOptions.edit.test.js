import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RegistrationOptions, { PROTECTED_REASON, REFERENCE_RENAME_EFFECT } from "./RegistrationOptions";
import { renameQuestion } from "./BoatCapacityFarePanel";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

// The edit form of the five tabs of Registration Options behaves the same way in
// all of them: it is at the TOP, the cursor is in it, and it shows ONE message.
// The wording of a rename differs on purpose: in the four reference lists the
// records show the NEW name; in the fare tab they KEEP the old text.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

let lists;
let fares;
let requests;
let failNext;
let refreshReferenceTables;

const row = (id, name, extra = {}) => ({ id, name, is_active: true, record_count: 0, rename_protected: false, ...extra });
const fare = (id, name, display_order, record_count, extra = {}) => ({
  id, name, display_order, is_active: true, record_count, ...extra,
});

function freshLists() {
  return {
    itinerary: [
      row(1, "Overnight", { stay_nights: 1, record_count: 3, rename_protected: true }),
      row(7, "6 Nights", { stay_nights: 6, record_count: 4 }),
    ],
    "travel-mode": [row(1, "Private Vehicle", { record_count: 10, rename_protected: true }), row(3, "Public Bus", { record_count: 6 })],
    "boat-type": [row(1, "Tourist Boat", { record_count: 11, requires_capacity_fare: true }), row(2, "Passenger Boat", { record_count: 7, requires_capacity_fare: false })],
    "visit-purpose": [row(1, "Leisure", { record_count: 5 }), row(2, "Vacation", { record_count: 9 })],
  };
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

function fakeFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^.*\/api/, "");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });
  if (failNext) {
    const failure = failNext;
    failNext = null;
    return reply(failure.status, failure.body);
  }

  const ref = path.match(/^\/reference-options\/([a-z-]+)\/(?:(\d+)\/)?$/);
  if (ref) {
    const list = lists[ref[1]];
    if (!ref[2]) return reply(200, list);
    const option = list.find((o) => o.id === Number(ref[2]));
    if (method === "PATCH") {
      if (body.confirm_affected_records !== option.record_count) {
        return reply(409, { detail: `This change affects ${option.record_count} record(s).`, code: "confirmation_required", record_count: option.record_count });
      }
      if ("name" in body) option.name = body.name;
      if ("stay_nights" in body) option.stay_nights = body.stay_nights;
      return reply(200, option);
    }
  }
  const f = path.match(/^\/boat-capacity-fares\/(?:(\d+)\/)?$/);
  if (f) {
    if (!f[1]) return reply(200, fares);
    const tier = fares.find((x) => x.id === Number(f[1]));
    if (method === "PATCH") {
      if (tier.record_count > 0 && body.confirm_affected_records !== tier.record_count) {
        return reply(409, { detail: "Held.", code: "confirm_required", record_count: tier.record_count });
      }
      tier.name = body.name;
      tier.record_count = 0;
      return reply(200, tier);
    }
  }
  return reply(404, { detail: "no such route" });
}

beforeEach(() => {
  lists = freshLists();
  fares = [fare(21, "Oscar 1-2 pax", 10, 2), fare(22, "Papa 3-4 pax", 20, 0)];
  requests = [];
  failNext = null;
  refreshReferenceTables = jest.fn();
  useAuth.mockReturnValue({ role: "admin" });
  useTourismData.mockImplementation(() => ({
    refreshReferenceTables,
    referenceTables: { boatTypes: [{ id: 1, name: "Tourist Boat", requires_capacity_fare: true, is_active: true }] },
  }));
  global.fetch = jest.fn(fakeFetch);
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  delete window.HTMLElement.prototype.scrollIntoView;
});

// tab label, the row to edit (a name that is not locked), and its edit control
const FOUR = [
  ["Length of Stay", "6 Nights"],
  ["Vehicle Classification", "Public Bus"],
  ["Boat Classification", "Passenger Boat"],
  ["Visit Purpose", "Vacation"],
];
const FIVE = [...FOUR, ["Boat Capacity and Fare", "Oscar 1-2 pax"]];

async function open() {
  render(<RegistrationOptions />);
  await screen.findByRole("table");
}
async function goTo(tab, rowName) {
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  await waitFor(() => expect(screen.getByRole("tab", { name: tab }).getAttribute("aria-selected")).toBe("true"));
  await screen.findByText(rowName, { selector: "td" });
}
// the form itself (not the Edit button, which has the same label)
const sectionForm = (name) => document.querySelector(`section[aria-label="Edit ${name}"], form[aria-label="Edit ${name}"]`);

describe("e) the edit form comes BEFORE the list, in all five tabs", () => {
  it.each(FIVE)("%s: the form precedes the table in the page, is scrolled to, and has the cursor in the name field", async (tab, rowName) => {
    await open();
    await goTo(tab, rowName);
    window.HTMLElement.prototype.scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));

    const form = sectionForm(rowName);
    const table = screen.getByRole("table");
    expect(form).not.toBeNull();
    expect(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // form first, table after
    expect(table.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.HTMLElement.prototype.scrollIntoView.mock.instances[0]).toBe(form);
    const focused = document.activeElement;
    expect(form.contains(focused)).toBe(true);
    expect(focused.tagName).toBe("INPUT");
    expect(focused.value).toBe(rowName); // the name field, filled with the name
  });

  it("when the name is locked the cursor goes to the first field that can be typed in instead", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Overnight" })); // an import's name: locked; its stay length is not
    const form = sectionForm("Overnight");
    expect(screen.getByLabelText("Option name").disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Stay length in nights"));
    expect(form.contains(document.activeElement)).toBe(true);
  });

  it.each(FIVE)("%s: the form is gone after Cancel and the list is where it was", async (tab, rowName) => {
    await open();
    await goTo(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sectionForm(rowName)).toBeNull();
    expect(screen.getByText(rowName, { selector: "td" })).toBeTruthy();
  });
});

describe("d) one message only, in the form, in the four reference tabs too", () => {
  async function reachTheConfirmation(tab, rowName, newName) {
    await open();
    await goTo(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: newName } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    return screen.findByRole("alertdialog");
  }

  it.each(FOUR)("%s: a refused save shows its words once, inside the form, with nothing at the top", async (tab, rowName) => {
    await reachTheConfirmation(tab, rowName, `${rowName} renamed`);
    failNext = { status: 500, body: { detail: "The database is busy. Try again." } };
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await screen.findByText("The database is busy. Try again.");
    expect(screen.getAllByText("The database is busy. Try again.")).toHaveLength(1);
    expect(sectionForm(rowName).contains(screen.getByText("The database is busy. Try again."))).toBe(true);
    expect(document.querySelector(".options-message-area .settings-status.error")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("a locked name's own reason and a refusal that says the same thing are not shown twice", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Overnight" }));
    const form = sectionForm("Overnight");
    expect(within(form).getByText(PROTECTED_REASON)).toBeTruthy(); // the note, once
    fireEvent.change(screen.getByLabelText("Stay length in nights"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alertdialog");
    failNext = { status: 409, body: { detail: PROTECTED_REASON, code: "rename_protected" } };
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getAllByText(PROTECTED_REASON)).toHaveLength(1); // one, not the note AND the refusal
    expect(form.querySelectorAll('[role="note"], [role="alert"]')).toHaveLength(1);
    expect(document.querySelector(".options-message-area .settings-status.error")).toBeNull();
  });

  it("a refused ADD shows its words once, inside the add form", async () => {
    await open();
    failNext = { status: 400, body: { detail: "Another option already has this name (capitals and spaces do not count)." } };
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "Overnight" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));
    await screen.findByText(/already has this name/);
    expect(screen.getAllByText(/already has this name/)).toHaveLength(1);
    expect(document.querySelector(".options-message-area .settings-status.error")).toBeNull();
  });

  it("an action outside a form (deactivate) still shows its refusal at the top", async () => {
    await open();
    failNext = { status: 500, body: { detail: "The database is busy. Try again." } };
    fireEvent.click(screen.getByRole("button", { name: "Deactivate 6 Nights" }));
    await screen.findByText("The database is busy. Try again.");
    expect(document.querySelector(".options-message-area .settings-status.error")).not.toBeNull();
  });
});

describe("D) the wording of a rename: opposite in the fare tab and in the four others", () => {
  it.each(FOUR)("%s: says the records using the option will now show the NEW name, and never that they keep the old text", async (tab, rowName) => {
    await open();
    await goTo(tab, rowName);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: `${rowName} renamed` } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const text = (await screen.findByRole("alertdialog")).textContent;
    expect(text).toContain(REFERENCE_RENAME_EFFECT); // "all records using this option will now show the new name"
    expect(text).not.toMatch(/keep/i);
    expect(text).not.toMatch(/not in the list/i);
    expect(text).toMatch(/It affects \d+ records/); // the count the page has always shown
  });

  it("the fare tab says the opposite: the records keep the old text", async () => {
    await open();
    await goTo("Boat Capacity and Fare", "Oscar 1-2 pax");
    fireEvent.click(screen.getByRole("button", { name: "Edit Oscar 1-2 pax" }));
    fireEvent.change(screen.getByLabelText("Tier text"), { target: { value: "Oscar renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const text = (await screen.findByRole("alertdialog")).querySelector("p").textContent;
    expect(text).toBe(renameQuestion(2));
    expect(text).toMatch(/They will keep it/);
    expect(text).toMatch(/\(not in the list\)/);
    expect(text).not.toContain(REFERENCE_RENAME_EFFECT);
    expect(text).not.toMatch(/will now show the new name/);
  });

  it("the two texts are different from one another", () => {
    expect(renameQuestion(2)).not.toBe(REFERENCE_RENAME_EFFECT);
    expect(renameQuestion(2)).not.toContain("show the new name");
    expect(REFERENCE_RENAME_EFFECT).not.toContain("keep");
  });
});

describe("g) the four reference tabs still rename as they did", () => {
  it.each(FOUR)("%s: confirm and save sends the name and the server's count, the row shows the server's answer, and the fare endpoints are never touched", async (tab, rowName) => {
    await open();
    await goTo(tab, rowName);
    const kind = { "Length of Stay": "itinerary", "Vehicle Classification": "travel-mode", "Boat Classification": "boat-type", "Visit Purpose": "visit-purpose" }[tab];
    const target = lists[kind].find((o) => o.name === rowName);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${rowName}` }));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: `${rowName} renamed` } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and save" }));
    await screen.findByText(`${rowName} renamed`, { selector: "td" });

    const patch = requests.filter((r) => r.method === "PATCH");
    expect(patch).toHaveLength(1);
    expect(patch[0].path).toBe(`/reference-options/${kind}/${target.id}/`);
    expect(patch[0].body).toEqual({ name: `${rowName} renamed`, confirm_affected_records: target.record_count });
    expect(requests.filter((r) => r.path.startsWith("/boat-capacity-fares/"))).toHaveLength(0);
    expect(screen.getByText("The change was saved.")).toBeTruthy();
    expect(sectionForm(rowName)).toBeNull();
  });
});
