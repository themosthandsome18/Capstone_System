import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";
import { deriveTourismTheme, hexToRgb } from "../theme/deriveTourismTheme";
import { balanceHeadCount, fieldInput, fillAddRecordUpToTravel, goToStep, setCount } from "../testing/addRecordFlow";

// A record opened from the table in Record Management is LOOKED AT: the data is the tourist's, who has already paid. The admin and the Tourism
// Office have one button, Edit, which opens ONLY the head count, the Length of Stay and the resort; every other field stays locked, in Edit mode
// too (that is the most important thing in this file). A role that may not edit has no Edit button at all. Add Record is the same wizard and is
// NOT changed.
let mockRole = "admin";

let mockRouterState = null;
jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: "/tourist-data", state: mockRouterState }),
    useNavigate: () => jest.fn(),
    useOutletContext: () => ({}),
  }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ role: mockRole }) }));
jest.mock("../context/TourismDataContext", () => ({
  useTourismData: jest.fn(),
  useBookingListPolling: jest.fn(),
}));
jest.mock("../../shared/csvExport", () => ({ exportCsv: jest.fn(), datedCsvFilename: jest.fn() }));

const REFERENCE = {
  countries: [{ id: 1, name: "Philippines", type: "local" }],
  regions: [{ id: 4, name: "CALABARZON" }],
  provinces: [{ id: 7, name: "Quezon", region_id: 4 }],
  resorts: [{ resort_id: 3, resort_name: "Sample Beach" }],
  itineraries: [{ id: 11, name: "Weekend Trail", is_active: true }],
  travelModes: [{ id: 21, name: "Jeepney Ride", is_active: true }],
  boatTypes: [{ id: 31, name: "Banca", requires_capacity_fare: false, is_active: true }],
  visitPurposes: [{ id: 41, name: "Holiday Break", is_active: true }],
};

const RECORD = {
  survey_id: "SV-VIEW",
  first_name: "Alma",
  last_name: "Reyes",
  email: "alma@example.test",
  contact_number: "+639171234567",
  country_id: 1,
  region_id: 4,
  province_id: 7,
  resort_id: 3,
  itinerary_id: 11,
  travel_mode_id: 21,
  boat_type_id: 31,
  boat_capacity_fare: "",
  visit_purpose_id: 41,
  arrival_date: "2099-06-01",
  filipino_count: 2,
  foreigner_count: 0,
  maubanin_count: 0,
  total_visitors: 2,
  total_male: 1,
  total_female: 1,
  special_group_count: 0,
  age_0_7: 0,
  age_8_59: 2,
  age_60_above: 0,
  discounted_count: 0,
  status: "pending",
};

let updateRecord;
let createRecord;

beforeEach(() => {
  mockRole = "admin";
  mockRouterState = null;
  updateRecord = jest.fn().mockResolvedValue({});
  createRecord = jest.fn().mockResolvedValue({});
  useTourismData.mockReturnValue({
    referenceTables: REFERENCE,
    bookingManagement: { rows: [RECORD], summary: {}, pagination: { page: 1, totalPages: 1, total: 1 } },
    reportingYears: ["2099"],
    createRecord,
    updateRecord,
    deleteRecord: jest.fn(),
    previewOnlineBookingImport: jest.fn(),
    importOnlineBookingFile: jest.fn(),
    refreshBookingManagement: jest.fn().mockResolvedValue({ pagination: { page: 1 } }),
  });
});

async function openView() {
  render(<BookingManagement />);
  const row = await waitFor(() => screen.getByText("SV-VIEW").closest("tr"));
  fireEvent.click(row.querySelector(".booking-icon-btn.view"));
  await screen.findByText("Tourist Record Details");
}

async function openAdd() {
  mockRouterState = { openAddModal: true, ts: 9001 };
  render(<BookingManagement />);
  await screen.findByText("Data Management Add Record");
}

const STEPS = ["Tourist Info", "Location", "Travel Details", "Head Count", "Review"];
const footerButtons = () => Array.from(document.querySelector(".wizard-footer").querySelectorAll("button")).map((b) => b.textContent.trim());
const footerText = () => document.querySelector(".wizard-footer").textContent;
const stepTitle = () => document.querySelector(".wizard-step-title").textContent;
const sidebarTitle = () => document.querySelector(".wizard-sidebar-title").textContent;

describe("a record that is only looked at", () => {
  it("is called Tourist Record Details, and no longer says Edit", async () => {
    await openView();
    expect(sidebarTitle()).toBe("Tourist Record Details");
    expect(screen.queryByText(/Details & Edit/i)).toBeNull();
    expect(screen.queryByText("Data Management Add Record")).toBeNull();
  });

  it.each(STEPS.map((label, i) => [i + 1, label]))(
    "step %i (%s), for a role that may not edit: no Edit, Back, Update Record, Save Record, Continue or Cancel, and no 'Progress saved automatically'; only Close",
    async (number, label) => {
      mockRole = "resort";
      await openView();
      goToStep(label);
      expect(stepTitle()).toBe(`Step ${number} of 5 • ${label}`);
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Back$/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Update Record/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Save Record/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Cancel$/ })).toBeNull();
      expect(screen.queryByText("Progress saved automatically")).toBeNull();
      expect(footerButtons()).toEqual(["Close"]);
      expect(footerText()).not.toMatch(/saved/i);
    }
  );

  it.each(["admin", "tourism"])(
    "step by step, for %s: Edit and Close, and none of Back, Update Record, Save Record, Continue or Cancel, and no 'Progress saved automatically'",
    async (role) => {
      mockRole = role;
      await openView();
      for (const [index, label] of STEPS.entries()) {
        goToStep(label);
        expect(stepTitle()).toBe(`Step ${index + 1} of 5 \u2022 ${label}`);
        expect(footerButtons()).toEqual(["Edit", "Close"]);
        expect(screen.queryByRole("button", { name: /^Back$/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Update Record|Save Record/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Cancel$/ })).toBeNull();
        expect(screen.queryByText("Progress saved automatically")).toBeNull();
      }
    }
  );

  it("a role that may not edit never sees Edit, not even disabled", async () => {
    for (const role of ["resort", "sanitation", "tourist", ""]) {
      mockRole = role;
      const { unmount } = render(<BookingManagement />);
      const row = await waitFor(() => screen.getByText("SV-VIEW").closest("tr"));
      fireEvent.click(row.querySelector(".booking-icon-btn.view"));
      await screen.findByText("Tourist Record Details");
      expect(footerButtons()).toEqual(["Close"]);
      unmount();
    }
  });

  it("the last step shows the whole record, with none of its four Edit buttons of the sections", async () => {
    mockRole = "resort";
    await openView();
    goToStep("Review");
    ["Tourist Info", "Location", "Travel Details", "Head Count"].forEach((title) =>
      expect(screen.getByRole("heading", { name: title })).toBeTruthy()
    );
    const review = document.querySelector(".wizard-body").textContent;
    expect(review).toContain("Alma");
    expect(review).toContain("Reyes");
    expect(document.querySelectorAll(".wizard-review-edit-btn")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Edit" })).toHaveLength(0);
  });

  it("keeps the five steps, the progress bar and Step 5 of 5, and the steps can still be opened", async () => {
    await openView();
    expect(stepTitle()).toBe("Step 5 of 5 • Review");
    expect(document.querySelectorAll(".wizard-step-item")).toHaveLength(5);
    expect(document.querySelector(".wizard-progress-bar")).not.toBeNull();
    expect(document.querySelector(".wizard-progress-label").textContent).toBe("100% done");
    STEPS.slice(0, 4).forEach((label, i) => {
      goToStep(label);
      expect(stepTitle()).toBe(`Step ${i + 1} of 5 • ${label}`);
    });
  });

  it("step 5 reads 'Review / The whole record', not 'Check and save'", async () => {
    await openView();
    const item = screen.getByText("Review", { selector: ".wizard-step-label strong" }).closest(".wizard-step-label");
    expect(item.querySelector("small").textContent).toBe("The whole record");
    expect(document.body.textContent).not.toContain("Check and save");
  });

  it.each(STEPS.slice(0, 4).map((label, i) => [i + 1, label]))(
    "step %i (%s): nothing in it can be changed by a person (every input, select and button is :disabled)",
    async (number, label) => {
      await openView();
      goToStep(label);
      const controls = Array.from(document.querySelectorAll(".wizard-body input, .wizard-body select, .wizard-body textarea, .wizard-body button"));
      expect(controls.length).toBeGreaterThan(0);
      const notLocked = controls.filter((control) => !control.matches(":disabled")).map((control) => control.outerHTML.slice(0, 80));
      expect(notLocked).toEqual([]);
    }
  );

  it("on the last step the sections have no Edit buttons of their own; the one Edit is the footer's", async () => {
    await openView();
    goToStep("Review");
    expect(document.querySelectorAll(".wizard-review-edit-btn")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit" }).closest(".wizard-footer")).not.toBeNull();
  });

  it("Close closes it, and nothing was sent", async () => {
    await openView();
    fireEvent.click(within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.querySelector(".wizard-shell")).toBeNull());
    expect(updateRecord).not.toHaveBeenCalled();
    expect(createRecord).not.toHaveBeenCalled();
  });
});


// ───────────────────────────── Edit mode ─────────────────────────────
// Admin and the Tourism Office press Edit: the head count (11 fields), the Length of Stay and the resort open. Nothing else does.
const ALLOWED_LABELS = [
  "Resort", "Length of Stay", "Filipino Count", "Maubanin", "Foreigner Count", "Total Male", "Total Female", "Age 0-7", "Age 8-59", "Age 60+",
  "Special Needs", "Discounted (PHP 64)",
];
const labelOf = (control) => {
  const field = control.closest(".wizard-field");
  return field ? field.querySelector("label").textContent.replace(/\s*\*$/, "").trim() : control.textContent.trim();
};
const openForEdit = async () => {
  await openView();
  fireEvent.click(within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Edit" }));
  await screen.findByText("Editing a Tourist Record");
};
const enabledControls = () =>
  Array.from(document.querySelectorAll(".wizard-body input, .wizard-body select, .wizard-body textarea, .wizard-body button")).filter(
    (control) => !control.matches(":disabled")
  );

describe("a record in Edit mode: the closed fields are STILL closed", () => {
  it("Edit turns the footer into Cancel and Save, and Save waits for a change", async () => {
    await openForEdit();
    expect(footerButtons()).toEqual(["Cancel", "Save"]);
    expect(within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Save" }).matches(":disabled")).toBe(true);
    expect(within(document.querySelector(".wizard-footer")).queryByRole("button", { name: "Close" })).toBeNull();
  });

  // what is open in each step of Edit mode: exactly this, and nothing else (Tourist Info and Travel Details: nothing at all; Location: the resort and
  // the Length of Stay, NOT Region or Province; Head Count: the count; Review: no field)
  const OPEN_IN_STEP = [
    ["Tourist Info", []],
    ["Location", ["Length of Stay", "Resort"]],
    ["Travel Details", []],
    ["Head Count", ["Age 0-7", "Age 60+", "Age 8-59", "Discounted (PHP 64)", "Filipino Count", "Foreigner Count", "Maubanin", "Special Needs", "Total Female", "Total Male"]],
    ["Review", []],
  ];
  it.each(OPEN_IN_STEP)("step %s: the only fields a person can use are %j", async (label, expected) => {
    await openForEdit();
    goToStep(label);
    const open = enabledControls().filter((control) => !control.matches(".wizard-review-edit-btn"));
    const named = open.filter((control) => !control.closest(".tourist-auto-fill-row")).map(labelOf);
    expect(named.sort()).toEqual([...expected].sort());
    expect(named.filter((name) => !ALLOWED_LABELS.includes(name))).toEqual([]);
  });

  it("the name, the email, the contact, the country, the place, the boat, the purpose, the date and the status are disabled, and say so", async () => {
    await openForEdit();
    for (const label of ["Tourist Info", "Location", "Travel Details"]) {
      goToStep(label);
      expect(document.querySelector(".wizard-locked").matches(":disabled")).toBe(true);
    }
    goToStep("Tourist Info");
    expect(document.querySelector(".wizard-locked-note").textContent).toMatch(/tourist's own information/);
    ["First name", "Last name", "email@example.com", "9XXXXXXXXX"].forEach((placeholder) =>
      expect(screen.getByPlaceholderText(placeholder).matches(":disabled")).toBe(true)
    );
    goToStep("Travel Details");
    expect(document.querySelector('.wizard-body input[type="date"]').matches(":disabled")).toBe(true);
    Array.from(document.querySelectorAll(".wizard-body select")).forEach((select) => expect(select.matches(":disabled")).toBe(true));
    goToStep("Location");
    expect(screen.getByText("Select region", { selector: "option" }).closest("select").matches(":disabled")).toBe(true);
    expect(screen.getByText("Select province", { selector: "option" }).closest("select").matches(":disabled")).toBe(true);
    expect(screen.getByText("Select resort", { selector: "option" }).closest("select").matches(":disabled")).toBe(false);
  });

  it("typing into a closed field changes nothing (the form refuses it even if a control were enabled)", async () => {
    await openForEdit();
    goToStep("Tourist Info");
    const first = screen.getByPlaceholderText("First name");
    fireEvent.change(first, { target: { value: "Someone Else" } });
    expect(first.value).toBe("Alma");
  });

  it("Cancel drops what was typed and goes back to looking at the record", async () => {
    await openForEdit();
    setCount("Filipino Count", 5);
    expect(fieldInput("Filipino Count").value).toBe("5");
    fireEvent.click(within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Cancel" }));
    await screen.findByText("Tourist Record Details");
    expect(footerButtons()).toEqual(["Edit", "Close"]);
    goToStep("Head Count");
    expect(fieldInput("Filipino Count").value).toBe("2");
    expect(updateRecord).not.toHaveBeenCalled();
  });
});

describe("a record in Edit mode: live, confirm, send", () => {
  // the live warning of the head count (there is no banner above the fields: the fee, old and new, is in the confirmation)
  const problem = () => document.querySelector(".record-edit-problem")?.textContent ?? "";
  const saveButton = () => within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Save" });

  it("has no banner above the fields: no 'Editing: only the head count...' box, and no pax or fee in a header", async () => {
    await openForEdit();
    for (const label of ["Head Count", "Location", "Tourist Info"]) {
      goToStep(label);
      expect(document.querySelector(".record-edit-panel")).toBeNull();
      expect(document.querySelector(".record-edit-now")).toBeNull();
      expect(document.querySelector(".wizard-body").textContent).not.toMatch(/Editing: only the/);
    }
    setCount("Filipino Count", 3);
    expect(document.querySelector(".wizard-body").textContent).not.toMatch(/Environmental Fee\s*₱/);
  });

  it("the fee, as it was and as it will be, is in the confirmation", async () => {
    await openForEdit();
    setCount("Filipino Count", 3);
    balanceHeadCount(3);
    setCount("Discounted (PHP 64)", 1);
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Confirm the changes" });
    const fee = Array.from(dialog.querySelectorAll("tbody tr")).find((row) => row.dataset.change === "fee");
    expect(Array.from(fee.children).map((cell) => cell.textContent.trim())).toEqual(["Environmental Fee", "₱160", "→", "₱224"]); // 2 x 80, then (3 - 1) x 80 + 1 x 64
  });

  it("the head count is checked live by validateTotals: the total must equal the genders and the ages", async () => {
    await openForEdit();
    setCount("Filipino Count", 3);
    expect(problem()).toContain("must equal total male + total female");
    expect(screen.getByRole("alert").textContent).toContain("must equal total male + total female");
    expect(saveButton().matches(":disabled")).toBe(true);
    balanceHeadCount(3);
    expect(problem()).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(saveButton().matches(":disabled")).toBe(false);
  });

  it("a discounted count above the visitors is said at once, and Save waits", async () => {
    await openForEdit();
    setCount("Discounted (PHP 64)", 9);
    expect(problem()).toContain("Discounted count cannot be greater than total visitors");
    expect(screen.getByRole("alert").textContent).toContain("Discounted count cannot be greater than total visitors");
    expect(saveButton().matches(":disabled")).toBe(true);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("the discounted count is never filled in for the person: a blank is a problem, and the ages do not move it", async () => {
    await openForEdit();
    setCount("Age 8-59", 1);
    setCount("Age 0-7", 1);
    expect(fieldInput("Discounted (PHP 64)").value).toBe("0");
    fireEvent.change(fieldInput("Discounted (PHP 64)"), { target: { value: "" } });
    expect(problem()).toContain("Discounted is required");
    expect(saveButton().matches(":disabled")).toBe(true);
  });

  it("Save shows ONLY what changed, as it was and as it will be, and nothing is sent until Confirm", async () => {
    await openForEdit();
    setCount("Filipino Count", 1);
    setCount("Total Male", 1);
    setCount("Total Female", 0);
    setCount("Age 8-59", 1);
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Confirm the changes" });
    const rows = Array.from(dialog.querySelectorAll("tbody tr")).map((row) => Array.from(row.children).map((cell) => cell.textContent.trim()));
    expect(rows).toEqual([
      ["Pax", "2", "\u2192", "1"],
      ["Environmental Fee", "\u20B1160", "\u2192", "\u20B180"],
      ["Filipinos", "2", "\u2192", "1"],
      ["Female", "1", "\u2192", "0"],
      ["Age 8-59", "2", "\u2192", "1"],
    ]);
    expect(updateRecord).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("dialog", { name: "Confirm the changes" })).toBeNull();
  });

  it("names the resort and the length of stay by their words, old and new", async () => {
    useTourismData.mockReturnValue({
      ...useTourismData(),
      referenceTables: {
        ...REFERENCE,
        resorts: [...REFERENCE.resorts, { resort_id: 4, resort_name: "Orlan Beach Resort" }],
        itineraries: [...REFERENCE.itineraries, { id: 12, name: "Overnight Stay", is_active: true }],
      },
    });
    await openForEdit();
    goToStep("Location");
    fireEvent.change(screen.getByText("Select resort", { selector: "option" }).closest("select"), { target: { value: "4" } });
    fireEvent.change(screen.getByText("Select length of stay", { selector: "option" }).closest("select"), { target: { value: "12" } });
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Confirm the changes" });
    const rows = Array.from(dialog.querySelectorAll("tbody tr")).map((row) => Array.from(row.children).map((cell) => cell.textContent.trim()));
    expect(rows).toEqual([
      ["Length of stay", "Weekend Trail", "\u2192", "Overnight Stay"],
      ["Resort", "Sample Beach", "\u2192", "Orlan Beach Resort"],
    ]);
  });

  it("Confirm sends the 13 fields and ONLY those, and the closed fields are not in it", async () => {
    await openForEdit();
    setCount("Filipino Count", 1);
    setCount("Total Male", 1);
    setCount("Total Female", 0);
    setCount("Age 8-59", 1);
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Confirm the changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [surveyId, payload] = updateRecord.mock.calls[0];
    expect(surveyId).toBe("SV-VIEW");
    expect(Object.keys(payload).sort()).toEqual(
      [
        "foreigner_count", "filipino_count", "maubanin_count", "total_visitors", "total_male", "total_female", "age_0_7", "age_8_59", "age_60_above",
        "special_group_count", "discounted_count", "itinerary_id", "resort_id",
      ].sort()
    );
    for (const closed of ["first_name", "last_name", "full_name", "email", "contact_number", "country_id", "region_id", "province_id", "arrival_date", "travel_mode_id", "boat_type_id", "boat_capacity_fare", "visit_purpose_id", "status", "survey_id", "consent_confirmed", "parking_space", "country_of_origin"]) {
      expect(payload).not.toHaveProperty(closed);
    }
    expect(payload).toMatchObject({ total_visitors: 1, filipino_count: 1, total_male: 1, total_female: 0, age_8_59: 1, itinerary_id: 11, resort_id: 3 });
    await waitFor(() => expect(document.querySelector(".wizard-shell")).toBeNull()); // saved: it closes
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("when the server refuses, the WHOLE answer is shown (every field it names, and the words about the discounted count), and nothing closes", async () => {
    updateRecord.mockRejectedValueOnce(
      Object.assign(new Error("Bad Request"), {
        status: 400,
        details: {
          discounted_count: ["The discounted count (4) cannot be greater than the number of visitors (3). Lower the discounted count in the same change: it is not changed for you, because the fee follows it."],
          email: ["This field cannot be changed here. A record may only change: foreigner_count, filipino_count."],
          arrival_date: ["This field cannot be changed here. A record may only change: foreigner_count, filipino_count."],
        },
      })
    );
    await openForEdit();
    setCount("Filipino Count", 1);
    setCount("Total Male", 1);
    setCount("Total Female", 0);
    setCount("Age 8-59", 1);
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole("dialog", { name: "Confirm the changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and save" }));
    const alert = await within(dialog).findByRole("alert");
    const lines = Array.from(alert.querySelectorAll("li")).map((li) => li.textContent);
    // the discounted message as the server wrote it; then the refused fields named TOGETHER; then what a record may change, ONCE
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^discounted_count: The discounted count \(4\) cannot be greater than the number of visitors \(3\)\. Lower the discounted count/);
    expect(lines[1]).toBe("These fields cannot be changed here: email, arrival_date.");
    expect(lines[2]).toBe("A record may only change: foreigner_count, filipino_count.");
    expect(alert.textContent).toContain("Nothing was saved");
    expect(alert.textContent).not.toMatch(/something went wrong/i);
    expect(document.querySelector(".wizard-shell")).not.toBeNull();
  });
});

describe("an archived record", () => {
  it("is not edited: Edit is shown but disabled, and the footer says to bring it back to the table first", async () => {
    useTourismData.mockReturnValue({
      ...useTourismData(),
      bookingManagement: { rows: [{ ...RECORD, is_archived: true }], summary: {}, pagination: { page: 1, totalPages: 1, total: 1 } },
    });
    await openView();
    const edit = within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Edit" });
    expect(edit.matches(":disabled")).toBe(true);
    expect(document.querySelector(".wizard-footer").textContent).toMatch(/This record is archived\. Bring it back to the table \(unarchive it\) before changing it\./);
    fireEvent.click(edit);
    expect(screen.queryByText("Editing a Tourist Record")).toBeNull();
  });

  it("a record that is not archived has no such words", async () => {
    await openView();
    expect(document.querySelector(".wizard-footer").textContent).not.toMatch(/archived/i);
  });
});

describe("Add Record is as it was", () => {
  it("is called Data Management Add Record, and keeps Progress saved automatically, Continue and Cancel on the first step", async () => {
    await openAdd();
    expect(sidebarTitle()).toBe("Data Management Add Record");
    expect(screen.getByText("Progress saved automatically")).toBeTruthy();
    expect(footerButtons()).toEqual(expect.arrayContaining(["Continue ›", "Cancel"]));
    expect(screen.queryByRole("button", { name: /^Back$/ })).toBeNull(); // nothing to go back to on the first step
  });

  it("the fields can be written: nothing is locked, and what is typed stays", async () => {
    await openAdd();
    const controls = Array.from(document.querySelectorAll(".wizard-body input, .wizard-body select"));
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((control) => expect(control.matches(":disabled")).toBe(false));
    const first = screen.getByPlaceholderText("First name");
    fireEvent.change(first, { target: { value: "Nora" } });
    expect(first.value).toBe("Nora");
  });

  it("Continue goes to the next step, and Back appears there", async () => {
    await openAdd();
    fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Nora" } });
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Santos" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "nora@example.test" } });
    fireEvent.change(screen.getByPlaceholderText("9XXXXXXXXX"), { target: { value: "9170000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Select length of stay", { selector: "option" });
    expect(stepTitle()).toBe("Step 2 of 5 • Location");
    expect(screen.getByRole("button", { name: /^Back$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeTruthy();
    expect(screen.getByText("Progress saved automatically")).toBeTruthy();
  });

  it("Cancel closes it", async () => {
    await openAdd();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    await waitFor(() => expect(document.querySelector(".wizard-shell")).toBeNull());
  });

  it("the last step keeps its four Edit buttons, Back, Close and Save Record, and Save Record saves", async () => {
    await openAdd();
    fillAddRecordUpToTravel({ boat: "31" });
    setCount("Filipino Count", 2);
    balanceHeadCount(2);
    goToStep("Review");
    expect(stepTitle()).toBe("Step 5 of 5 • Review");
    expect(document.querySelectorAll(".wizard-review-edit-btn")).toHaveLength(4);
    expect(sidebarTitle()).toBe("Data Management Add Record");
    const small = screen.getByText("Review", { selector: ".wizard-step-label strong" }).closest(".wizard-step-label").querySelector("small");
    expect(small.textContent).toBe("Check and save");
    expect(footerButtons()).toEqual(expect.arrayContaining(["Back", "Close", "✓ Save Record"]));
    expect(footerButtons()).not.toContain("✓ Update Record");
    fireEvent.click(screen.getByRole("button", { name: /Save Record/ }));
    await waitFor(() => expect(createRecord).toHaveBeenCalledTimes(1));
    expect(updateRecord).not.toHaveBeenCalled();
  });
});

describe("Close takes its colour from the theme (read from the computed style, in two themes)", () => {
  // jsdom applies a stylesheet but cannot resolve var(): a declaration with var() is dropped. So the real wizard stylesheet is written into
  // the page with every var(--th-...) replaced by the value the theme gives it, the way a browser resolves it, and the colour is then read
  // with getComputedStyle (the cascade, the specificity and any inline style all count; the class name does not).
  const wizardCss = readFileSync(join(__dirname, "BookingManagement.wizard.css"), "utf8");
  const resolve = (css, vars) => css.replace(/var\((--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (match, name, fallback) => vars[name] ?? fallback ?? match);
  const rgb = (hex) => `rgb(${hexToRgb(hex).join(", ")})`;

  const BLUE = "#1F5FBF";
  const PURPLE = "#7A2BB8";

  async function closeButtonUnder(primary) {
    const vars = deriveTourismTheme(primary);
    const style = document.createElement("style");
    style.textContent = resolve(wizardCss, vars);
    document.head.appendChild(style);
    await openView();
    const close = within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Close" });
    return { close, vars, remove: () => style.remove() };
  }

  it.each([["blue", BLUE], ["purple", PURPLE]])("under a %s theme, Close is that theme's primary colour with a readable label", async (_name, primary) => {
    const { close, vars, remove } = await closeButtonUnder(primary);
    try {
      const computed = getComputedStyle(close);
      expect(computed.backgroundColor).toBe(rgb(vars["--th-primary"]));
      expect(computed.backgroundColor).toBe(rgb(primary));
      expect(computed.color).toBe("rgb(255, 255, 255)");
    } finally {
      remove();
    }
  });

  it("the two themes give two different colours, and neither is a fixed orange", async () => {
    const seen = [];
    for (const primary of [BLUE, PURPLE]) {
      const { close, remove } = await closeButtonUnder(primary);
      seen.push(getComputedStyle(close).backgroundColor);
      remove();
      document.body.innerHTML = "";
    }
    expect(seen[0]).not.toBe(seen[1]);
    const ORANGES = ["rgb(249, 115, 22)", "rgb(255, 165, 0)", "rgb(234, 88, 12)", "rgb(255, 139, 33)", "rgb(245, 124, 0)"];
    seen.forEach((color) => expect(ORANGES).not.toContain(color));
  });
});
