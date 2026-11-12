import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import BookingManagement from "./BookingManagement";
import { useTourismData } from "../context/TourismDataContext";
import { deriveTourismTheme, hexToRgb } from "../theme/deriveTourismTheme";
import { balanceHeadCount, fillAddRecordUpToTravel, goToStep, setCount } from "../testing/addRecordFlow";

// A record opened from the table in Record Management is only LOOKED AT: the data is the tourist's, who has already paid, and the admin
// changes nothing. Add Record is the same wizard and is NOT changed.

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
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));
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
    "step %i (%s): no Edit, Back, Update Record, Save Record, Continue or Cancel, and no 'Progress saved automatically'; only Close",
    async (number, label) => {
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

  it("the last step shows the whole record, with none of its four Edit buttons", async () => {
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

  it("Close closes it, and nothing was sent", async () => {
    await openView();
    fireEvent.click(within(document.querySelector(".wizard-footer")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.querySelector(".wizard-shell")).toBeNull());
    expect(updateRecord).not.toHaveBeenCalled();
    expect(createRecord).not.toHaveBeenCalled();
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
