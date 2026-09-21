/**
 * Establishment Records, Phase 1 redesign.
 *
 * Specifies the intended behaviour: the establishment is the primary subject,
 * the client's 9 business type categories are shown over the real business
 * types, registration records no permit, Edit only saves what staff changed,
 * and View keeps the internal Establishment ID apart from the Permit Number.
 *
 * Fixtures include two production-shaped records that the redesigned form
 * cannot represent cleanly: id 448 (holds a permit, no dates recorded) and
 * id 449 (holds a permit, compliance "No Permit", out-of-range coordinates).
 * Both must survive unrelated edits unchanged.
 *
 * Same harness notes as EstablishmentRecords.characterization.test.js.
 */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ search: "" }), useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../shared/LocationPicker", () => ({ onChange }) => (
  <button
    type="button"
    onClick={() => {
      onChange("latitude", "14.188000");
      onChange("longitude", "121.732000");
    }}
  >
    Mock Apply Pin
  </button>
));
jest.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
jest.mock("../../shared/csvExport", () => ({
  datedCsvFilename: (name) => `${name}.csv`,
  exportCsv: jest.fn(),
}));

import EstablishmentRecords, { generatePermitNumber } from "./EstablishmentRecords";
import { exportCsv } from "../../shared/csvExport";
import {
  BUSINESS_TYPE_DISPLAY_LABELS,
  CLIENT_BUSINESS_TYPE_CATEGORIES,
  businessTypeDisplayLabel,
} from "../utils/businessTypeLabels";

const REAL_BUSINESS_TYPES = [
  [8, "Water Refilling Station"],
  [9, "Agro-industrial Establishment (Poultry / Piggery Farm)"],
  [10, "Sub-contractor"],
  [11, "Restaurant / Food Establishment"],
  [12, "Massage / Physical Therapy"],
  [13, "Public Market Stall"],
  [15, "Food Establishment"],
  [16, "Commercial Non Food"],
  [17, "Drug Store"],
  [18, "Resort / Picnic Ground"],
  [19, "Boatman"],
  [20, "Funeral Parlor"],
  [21, "Burial Ground"],
  [22, "Private Laboratory & Clinic"],
  [23, "Karaoke / Video Bar / CSW"],
].map(([id, name]) => ({ id, name, inspection_frequency: "monthly", requirements: [] }));

const PERMITTED = {
  id: 501,
  business_name: "Existing Bakery",
  owner_name: "Juan Dela Cruz",
  business_type: 13,
  business_type_name: "Public Market Stall",
  permit_size: "large",
  permit_size_label: "Large",
  barangay: "Daungan",
  address: "12 Rizal St",
  contact_number: "09171234567",
  has_permit: true,
  permit_number: "LG-2026-007",
  permit_issued_date: "2026-02-01",
  permit_expiry_date: "2026-12-31",
  compliance_status: "for_completion",
  compliance_status_label: "For Completion",
  permit_status: "conditional",
  permit_status_label: "Conditional",
  latitude: 14.191234,
  longitude: 121.735678,
  remarks: "Existing remarks",
  open_complaints: 0,
  account_username: null,
};

const NO_PERMIT = {
  ...PERMITTED,
  id: 502,
  business_name: "Night Owl Videoke",
  owner_name: "Ben Cruz",
  business_type: 23,
  business_type_name: "Karaoke / Video Bar / CSW",
  permit_size: "sp",
  permit_size_label: "SP",
  address: "3 Quezon St",
  has_permit: false,
  permit_number: "",
  permit_issued_date: null,
  permit_expiry_date: null,
  compliance_status: "no_permit",
  compliance_status_label: "No Permit",
  permit_status: "no_permit",
  permit_status_label: "No Permit",
  latitude: null,
  longitude: null,
  remarks: "",
};

// Production id=448 shape: holds a permit but no dates were ever recorded.
const PERMIT_WITHOUT_DATES = {
  ...PERMITTED,
  id: 448,
  business_name: "Cagbalete Beach Resort",
  business_type: 18,
  business_type_name: "Resort / Picnic Ground",
  permit_size: "sp",
  permit_size_label: "SP",
  permit_number: "SP-2025-448",
  permit_issued_date: null,
  permit_expiry_date: null,
  compliance_status: "good_standing",
  compliance_status_label: "Good Standing",
  permit_status: "active",
  permit_status_label: "Active",
};

// Production id=449 shape: has_permit and compliance disagree; bad coordinates.
const INCONSISTENT = {
  ...PERMITTED,
  id: 449,
  business_name: "Perly's Drug Store",
  owner_name: "Perly Santos",
  business_type: 17,
  business_type_name: "Drug Store",
  permit_size: "sp",
  permit_size_label: "SP",
  permit_number: "SP-2026-449",
  compliance_status: "no_permit",
  compliance_status_label: "No Permit",
  permit_status: "active",
  permit_status_label: "Active",
  latitude: 99,
  longitude: -400,
};

const ALL = [PERMITTED, NO_PERMIT, PERMIT_WITHOUT_DATES, INCONSISTENT];

const IMPORTER_AND_LEGACY_TYPE_MAPPINGS = [
  ["Pool / Resort", "Public Places"],
  ["Industrial Establishment", "Industrial Establishment"],
  ["Agricultural / Industrial Establishment", "Agro-Industrial Establishment"],
  ["Ambulant Food Vendor", "Ambulant Food Vendor"],
  ["Public Transport", "Public Transport"],
  ["Food / Commercial", "Food Establishment"],
  ["Fishing Vessel / Boat", "Public Transport"],
  ["Commercial Service Worker", "Commercial / NF"],
  ["Tiange", "Commercial / NF"],
  ["Poultry Farm", "Agro-Industrial Establishment"],
  ["Restaurant / Food Service", "Food Establishment"],
  ["Barbershop / Salon", "Commercial / NF"],
  ["Gasoline Station", "Industrial Establishment"],
  ["Motorshop", "Industrial Establishment"],
];

const mockCtx = {
  establishments: ALL,
  businessTypes: REAL_BUSINESS_TYPES,
  inspections: [],
  complaintData: { rows: [] },
  renewalData: { rows: [] },
  loading: false,
  error: "",
  createEstablishment: jest.fn(),
  updateEstablishment: jest.fn(),
  deleteEstablishment: jest.fn(),
};

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => mockCtx,
}));

const TODAY = new Date().toISOString().slice(0, 10);
const END_OF_YEAR = new Date().getFullYear() + "-12-31";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderPage() {
  return render(<EstablishmentRecords />);
}

function tableRows() {
  return [...document.querySelectorAll(".establishment-table-wrap tbody tr")];
}

function visibleIds() {
  return tableRows()
    .map((row) => row.querySelector("td").textContent)
    .filter((text) => /^\d+$/.test(text))
    .map(Number);
}

function rowFor(id) {
  return tableRows().find((row) => row.querySelector("td").textContent === String(id));
}

function businessTypeFilter() {
  return [...document.querySelectorAll(".establishment-tools select")].find(
    (select) => select.options[0].textContent === "All Business Types"
  );
}

function openCreateForm() {
  renderPage();
  fireEvent.click(screen.getByText(/Add Establishment/));
  return document.querySelector("form.establishment-modal");
}

function openEditForm(id) {
  renderPage();
  fireEvent.click(within(rowFor(id)).getByTitle("Edit establishment"));
  return document.querySelector("form.establishment-modal");
}

function openView(id) {
  renderPage();
  fireEvent.click(within(rowFor(id)).getByTitle("View establishment"));
  return document.querySelector(".establishment-detail-modal");
}

function field(form, labelText) {
  return within(form).getByText(labelText).closest("label").querySelector("input, select");
}

function setField(form, labelText, value) {
  fireEvent.change(field(form, labelText), { target: { value } });
}

const submit = (form) =>
  fireEvent.click(within(form).getByText(/Save & Register|Save Changes/));

async function submittedEdit(form) {
  submit(form);
  await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
  return mockCtx.updateEstablishment.mock.calls[0];
}

/** The value shown in a View info tile, looked up by its label. */
function tileValue(modal, label) {
  const tile = [...modal.querySelectorAll(".establishment-info-tile")].find(
    (element) => element.querySelector("span").textContent === label
  );
  return tile ? tile.querySelector("strong").textContent : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx.establishments = ALL;
  mockCtx.businessTypes = REAL_BUSINESS_TYPES;
});

/* ================================================================== */
/* Client business type categories                                     */
/* ================================================================== */

describe("client business type categories", () => {
  test("exactly the 9 confirmed categories, in the client's order", () => {
    expect(CLIENT_BUSINESS_TYPE_CATEGORIES).toEqual([
      "Commercial / NF",
      "Food Establishment",
      "Industrial Establishment",
      "Agro-Industrial Establishment",
      "Institutional Establishment",
      "Water Refilling Station",
      "Public Transport",
      "Ambulant Food Vendor",
      "Public Places",
    ]);
  });

  test("every real business type maps onto one of the 9 categories", () => {
    Object.values(BUSINESS_TYPE_DISPLAY_LABELS).forEach((label) =>
      expect(CLIENT_BUSINESS_TYPE_CATEGORIES).toContain(label)
    );
  });

  test.each(IMPORTER_AND_LEGACY_TYPE_MAPPINGS)(
    "%s maps legacy/importer data to %s without changing the stored type name",
    (storedName, category) => {
      expect(businessTypeDisplayLabel(storedName)).toBe(category);
    }
  );

  test("known importer and legacy names do not add raw filter categories", () => {
    mockCtx.businessTypes = [
      ...REAL_BUSINESS_TYPES,
      ...IMPORTER_AND_LEGACY_TYPE_MAPPINGS.map(([name], index) => ({
        id: 1000 + index,
        name,
        inspection_frequency: "monthly",
        requirements: [],
      })),
    ];

    renderPage();
    expect([...businessTypeFilter().options].map((option) => option.textContent)).toEqual([
      "All Business Types",
      ...CLIENT_BUSINESS_TYPE_CATEGORIES,
    ]);
  });

  test("an unknown underlying type does not create a tenth filter category", () => {
    mockCtx.businessTypes = [
      ...REAL_BUSINESS_TYPES,
      {
        id: 1999,
        name: "Future Unmapped Type",
        inspection_frequency: "monthly",
        requirements: [],
      },
    ];

    renderPage();
    expect([...businessTypeFilter().options].map((option) => option.textContent)).toEqual([
      "All Business Types",
      ...CLIENT_BUSINESS_TYPE_CATEGORIES,
    ]);
  });
});

/* ================================================================== */
/* Records table                                                        */
/* ================================================================== */

describe("Establishment Records table", () => {
  test("shows ID, Business Name, Owner / Proprietor, Business Type, Address, Status, Action", () => {
    renderPage();
    const headers = [...document.querySelectorAll(".establishment-table-wrap th")].map(
      (th) => th.textContent
    );
    expect(headers).toEqual([
      "ID",
      "Business Name",
      "Owner / Proprietor",
      "Business Type",
      "Address",
      "Status",
      "Action",
    ]);
  });

  test("Business Type shows the client category and SP/Large appears nowhere in the row", () => {
    renderPage();
    const cells = [...rowFor(501).querySelectorAll("td")].map((td) => td.textContent);
    expect(cells.slice(0, 6)).toEqual([
      "501",
      "Existing Bakery",
      "Juan Dela Cruz",
      "Food Establishment",
      "12 Rizal St",
      "For Completion",
    ]);
    expect(cells.join(" ")).not.toMatch(/\bLarge\b|\bSP\b/);
  });

  test("the Business Type filter lists all 9 categories after All Business Types", () => {
    renderPage();
    const options = [...businessTypeFilter().options].map((o) => o.textContent);
    expect(options).toEqual(["All Business Types", ...CLIENT_BUSINESS_TYPE_CATEGORIES]);
  });

  test("filtering by a category matches every real type under it", () => {
    renderPage();
    fireEvent.change(businessTypeFilter(), { target: { value: "Public Places" } });
    // Karaoke (502) and Resort (448) are both Public Places.
    expect(visibleIds().sort()).toEqual([448, 502]);

    fireEvent.change(businessTypeFilter(), { target: { value: "Institutional Establishment" } });
    expect(visibleIds()).toEqual([449]);
  });

  test("Ambulant Food Vendor can be filtered but has no records yet", () => {
    renderPage();
    fireEvent.change(businessTypeFilter(), { target: { value: "Ambulant Food Vendor" } });
    expect(visibleIds()).toEqual([]);
    expect(screen.getByText("No establishment records found.")).toBeTruthy();
  });

  test("search matches the category, the real type name and the permit number", () => {
    renderPage();
    const search = screen.getByPlaceholderText(/Search by name/);

    fireEvent.change(search, { target: { value: "institutional" } });
    expect(visibleIds()).toEqual([449]);

    fireEvent.change(search, { target: { value: "drug store" } });
    expect(visibleIds()).toEqual([449]);

    fireEvent.change(search, { target: { value: "LG-2026-007" } });
    expect(visibleIds()).toEqual([501]);
  });

  test("CSV export leads with the Establishment ID and labels SP/Large as permit coverage", () => {
    renderPage();
    fireEvent.change(businessTypeFilter(), { target: { value: "Food Establishment" } });
    fireEvent.click(screen.getByText(/Export CSV/));

    expect(exportCsv).toHaveBeenCalledTimes(1);
    const [, headers, rows] = exportCsv.mock.calls[0];
    expect(headers[0]).toBe("Establishment ID");
    expect(headers).toContain("Permit Coverage (SP/Large)");
    expect(headers).not.toContain("Permit Size");

    // Only the filtered record is exported.
    expect(rows).toHaveLength(1);
    const row = Object.fromEntries(headers.map((header, index) => [header, rows[0][index]]));
    expect(row["Establishment ID"]).toBe(501);
    expect(row["Permit Number"]).toBe("LG-2026-007");
    expect(row["Business Type"]).toBe("Food Establishment");
    expect(row["Underlying Business Type"]).toBe("Public Market Stall");
    expect(row["Permit Coverage (SP/Large)"]).toBe("Large");
  });
});

/* ================================================================== */
/* Register New Establishment                                          */
/* ================================================================== */

describe("Register New Establishment", () => {
  test("is organised as Establishment Profile then Location / Reference", () => {
    const form = openCreateForm();
    const headings = [...form.querySelectorAll(".establishment-form-section h3")].map(
      (h) => h.textContent
    );
    expect(headings).toEqual(["Establishment Profile", "Location / Reference"]);
    expect(
      within(form).getByText(/registered with no sanitary permit on record/)
    ).toBeTruthy();
  });

  test("Business Type groups the real types under the 9 client categories", () => {
    const form = openCreateForm();
    const select = field(form, "Business Type");
    const groups = [...select.querySelectorAll("optgroup")];

    expect(groups.map((g) => g.label)).toEqual(CLIENT_BUSINESS_TYPE_CATEGORIES);

    const namesIn = (label) =>
      [...groups.find((g) => g.label === label).querySelectorAll("option")].map(
        (o) => o.textContent
      );
    expect(namesIn("Food Establishment")).toEqual([
      "Restaurant / Food Establishment",
      "Public Market Stall",
      "Food Establishment",
    ]);
    expect(namesIn("Public Places")).toEqual([
      "Resort / Picnic Ground",
      "Funeral Parlor",
      "Burial Ground",
      "Karaoke / Video Bar / CSW",
    ]);

    // No real type exists for Ambulant Food Vendor yet, so nothing can be chosen.
    const ambulant = groups.find((g) => g.label === "Ambulant Food Vendor");
    const ambulantOptions = [...ambulant.querySelectorAll("option")];
    expect(ambulantOptions).toHaveLength(1);
    expect(ambulantOptions[0].disabled).toBe(true);
  });

  test("a new registration submits the real type id and never touches another record", async () => {
    const form = openCreateForm();
    setField(form, "Business Name", "Mauban Water Station");
    setField(form, "Owner / Proprietor", "Lito Reyes");
    setField(form, "Business Type", "8");
    setField(form, "Barangay", "Daungan");
    setField(form, "Complete Address", "5 Pier Rd");
    setField(form, "Contact Number", "09170001111");
    fireEvent.click(within(form).getByText("Mock Apply Pin"));
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    expect(mockCtx.createEstablishment.mock.calls[0][0]).toEqual({
      business_name: "Mauban Water Station",
      owner_name: "Lito Reyes",
      business_type: 8,
      barangay: "Daungan",
      address: "5 Pier Rd",
      contact_number: "09170001111",
      latitude: 14.188,
      longitude: 121.732,
      has_permit: false,
      permit_number: "",
      permit_issued_date: null,
      permit_expiry_date: null,
      compliance_status: "no_permit",
      permit_status: "no_permit",
    });
    expect(mockCtx.updateEstablishment).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* Edit preserves production data                                      */
/* ================================================================== */

describe("Edit Establishment preserves existing data", () => {
  test("changing only the contact number sends only the contact number", async () => {
    const form = openEditForm(501);
    setField(form, "Contact Number", "09990000000");
    const [id, payload] = await submittedEdit(form);

    expect(id).toBe(501);
    expect(payload).toEqual({ contact_number: "09990000000" });
  });

  test("profile edits save correctly without resending permit or location data", async () => {
    const form = openEditForm(501);
    setField(form, "Business Name", "existing bakery and cafe");
    setField(form, "Owner / Proprietor", "maria dela cruz");
    setField(form, "Complete Address", "14 rizal st");
    setField(form, "Barangay", "Polo");
    const [, payload] = await submittedEdit(form);

    expect(payload).toEqual({
      business_name: "Existing Bakery And Cafe",
      owner_name: "Maria Dela Cruz",
      address: "14 Rizal St",
      barangay: "Polo",
    });
  });

  test("a permit held with no recorded dates (id 448) is not given invented dates", async () => {
    const form = openEditForm(448);
    expect(field(form, "Permit Issued Date").value).toBe("");
    expect(field(form, "Permit Expiry Date").value).toBe("");
    expect(field(form, "Permit Number").value).toBe("SP-2025-448");

    setField(form, "Complete Address", "Brgy. Cagbalete I");
    const [, payload] = await submittedEdit(form);
    expect(payload).toEqual({ address: "Brgy. Cagbalete I" });
  });

  test("an inconsistent production record (id 449) loads as stored and survives an unrelated save", async () => {
    const form = openEditForm(449);
    const compliance = field(form, "Compliance Status");
    expect(compliance.value).toBe("no_permit");
    expect(compliance.options[compliance.selectedIndex].textContent).toBe("No Permit");
    expect(field(form, "Has Permit?").value).toBe("yes");

    setField(form, "Owner / Proprietor", "perly santos jr.");
    const [id, payload] = await submittedEdit(form);

    expect(id).toBe(449);
    // Status, permit and the out-of-range coordinates are left exactly as stored.
    expect(payload).toEqual({ owner_name: "Perly Santos Jr." });
  });

  test("applying a new map pin sends only the new coordinates", async () => {
    const form = openEditForm(449);
    fireEvent.click(within(form).getByText("Mock Apply Pin"));
    const [, payload] = await submittedEdit(form);
    expect(payload).toEqual({ latitude: 14.188, longitude: 121.732 });
  });

  test("Permit Coverage is labelled as internal grouping and changing it sends only permit_size", async () => {
    const form = openEditForm(501);
    expect(within(form).queryByText("Permit Size")).toBeNull();
    expect(
      within(form).getByText(/not the physical size of the establishment/)
    ).toBeTruthy();

    setField(form, "Permit Coverage (SP / Large)", "sp");
    const [, payload] = await submittedEdit(form);
    expect(payload).toEqual({ permit_size: "sp" });
  });

  test("changing Business Type sends only the real numeric type id", async () => {
    const form = openEditForm(501);
    setField(form, "Business Type", "18");
    const [, payload] = await submittedEdit(form);
    expect(payload).toEqual({ business_type: 18 });
  });

  test("deliberately clearing remarks is saved", async () => {
    const form = openEditForm(501);
    setField(form, "Remarks", "");
    const [, payload] = await submittedEdit(form);
    expect(payload).toEqual({ remarks: "" });
  });

  test("required profile fields are still enforced on edit", async () => {
    const form = openEditForm(501);
    setField(form, "Business Name", "   ");
    submit(form);
    await waitFor(() =>
      expect(document.querySelector(".sanitation-error-text").textContent).toBe(
        "Business name is required."
      )
    );
    expect(mockCtx.updateEstablishment).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* View Establishment                                                  */
/* ================================================================== */

describe("View Establishment", () => {
  test("sections follow the establishment-first hierarchy", () => {
    const modal = openView(501);
    expect(modal.querySelector(".establishment-detail-header span").textContent).toBe(
      "Establishment Profile"
    );
    const sections = [...modal.querySelectorAll(".establishment-detail-section-title")].map(
      (h) => h.textContent
    );
    expect(sections).toEqual([
      "Establishment Details",
      "Location / Reference",
      "Sanitary Permit",
      "Compliance Overview",
    ]);
    // Existing related information is still shown.
    expect(within(modal).getByText("Record Timeline")).toBeTruthy();
  });

  test("the establishment timeline retains updated_at precedence over created_at", () => {
    mockCtx.establishments = [
      {
        ...PERMITTED,
        id: 504,
        created_at: "2026-01-01T12:00:00Z",
        updated_at: "2026-12-31T12:00:00Z",
      },
    ];

    const modal = openView(504);
    const establishmentRow = [...modal.querySelectorAll(".establishment-timeline-row")].find(
      (row) => row.querySelector("strong").textContent === "Establishment record encoded"
    );
    expect(establishmentRow.querySelector("small").textContent).toBe("Dec 31, 2026");
  });

  test("the Establishment ID and the Permit Number are shown as different things", () => {
    const modal = openView(501);
    expect(
      within(modal).getByText(
        "Establishment ID: 501 (internal record number, not a permit number)"
      )
    ).toBeTruthy();
    expect(tileValue(modal, "Establishment ID")).toBe("501");
    expect(tileValue(modal, "Permit Number")).toBe("LG-2026-007");
    expect(within(modal).getByText(/links to Establishment ID 501/)).toBeTruthy();
  });

  test("details, location and compliance come from the stored record", () => {
    const modal = openView(501);
    expect(tileValue(modal, "Owner / Proprietor")).toBe("Juan Dela Cruz");
    expect(tileValue(modal, "Business Type")).toBe("Food Establishment");
    expect(within(modal).getByText("Public Market Stall")).toBeTruthy(); // real type
    expect(tileValue(modal, "Contact Number")).toBe("09171234567");
    expect(tileValue(modal, "Complete Address")).toBe("12 Rizal St");
    expect(tileValue(modal, "Location Coordinates")).toBe("14.191234, 121.735678");
    expect(within(modal).queryByText("Recorded Coordinates")).toBeNull();
    expect(within(modal).queryByText(/GPS Coordinates|Verified Coordinates/)).toBeNull();
    expect(tileValue(modal, "Map Reference")).toBe("Open in Google Maps");
    expect(within(modal).getByText("Open in Google Maps").getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=14.191234,121.735678"
    );
    expect(tileValue(modal, "Permit Status")).toBe("Conditional");
    expect(tileValue(modal, "Permit Coverage (internal SP / Large)")).toBe("Large");
    expect(tileValue(modal, "Compliance Status")).toBe("For Completion");
    expect(tileValue(modal, "Open Complaints")).toBe("0");
    expect(within(modal).queryByText("Permit Size")).toBeNull();
  });

  test("a record with no permit says so instead of showing invented permit values", () => {
    const modal = openView(502);
    expect(
      within(modal).getByText("No sanitary permit is on record for this establishment.")
    ).toBeTruthy();
    expect(tileValue(modal, "Permit Number")).toBe("No permit number recorded");
    expect(tileValue(modal, "Permit Issued Date")).toBe("No date recorded");
    expect(tileValue(modal, "Permit Expiry Date")).toBe("No date recorded");
    expect(within(modal).getByText("No permit on record")).toBeTruthy();
    expect(tileValue(modal, "Location Coordinates")).toBe("No location coordinates recorded");
    expect(tileValue(modal, "Map Reference")).toBe("No map reference recorded");
  });

  test("backend-generated coordinates use non-verified location wording", () => {
    mockCtx.establishments = [
      {
        ...NO_PERMIT,
        id: 503,
        business_name: "Unpinned New Establishment",
        // This mirrors the current server result after an unpinned create.
        latitude: 14.189341,
        longitude: 121.733219,
      },
    ];

    const modal = openView(503);
    expect(tileValue(modal, "Location Coordinates")).toBe("14.189341, 121.733219");
    expect(tileValue(modal, "Map Reference")).toBe("Open in Google Maps");
    expect(within(modal).queryByText(/Recorded Coordinates|GPS Coordinates|Verified Coordinates/)).toBeNull();
  });

  test("out-of-bounds stored coordinates are preserved but are not map-linked", () => {
    const modal = openView(449);
    expect(tileValue(modal, "Location Coordinates")).toBe("99, -400");
    expect(tileValue(modal, "Map Reference")).toBe("No valid map reference available");
    expect(within(modal).queryByText("Open in Google Maps")).toBeNull();
  });

  test("a permit with no recorded dates (id 448) shows the dates as not recorded", () => {
    const modal = openView(448);
    expect(tileValue(modal, "Permit Number")).toBe("SP-2025-448");
    expect(tileValue(modal, "Permit Issued Date")).toBe("No date recorded");
    expect(tileValue(modal, "Permit Expiry Date")).toBe("No date recorded");
    expect(within(modal).getByText("Permit: SP-2025-448")).toBeTruthy();
    expect(
      within(modal).queryByText("No sanitary permit is on record for this establishment.")
    ).toBeNull();
  });

  test("Edit from View opens the edit form with the stored values", () => {
    const modal = openView(501);
    fireEvent.click(within(modal).getByText("Edit"));

    const form = document.querySelector("form.establishment-modal");
    expect(within(form).getByText("Edit Establishment")).toBeTruthy();
    expect(field(form, "Business Name").value).toBe("Existing Bakery");
    expect(field(form, "Permit Number").value).toBe("LG-2026-007");
  });

  test("only the explicit Issue & Generate Permit Now action pre-fills a new permit", async () => {
    const modal = openView(502);
    fireEvent.click(within(modal).getByText("+ Issue & Generate Permit Now"));

    const form = document.querySelector("form.establishment-modal");
    const expectedNumber = generatePermitNumber(ALL, "sp");
    expect(field(form, "Has Permit?").value).toBe("yes");
    expect(field(form, "Permit Number").value).toBe(expectedNumber);

    const [id, payload] = await submittedEdit(form);
    expect(id).toBe(502);
    expect(payload).toEqual({
      has_permit: true,
      permit_number: expectedNumber,
      permit_issued_date: TODAY,
      permit_expiry_date: END_OF_YEAR,
      compliance_status: "good_standing",
      permit_status: "active",
    });
  });

  test("plain Edit of a no-permit record pre-fills nothing", () => {
    renderPage();
    fireEvent.click(within(rowFor(502)).getByTitle("Edit establishment"));
    const form = document.querySelector("form.establishment-modal");
    expect(field(form, "Has Permit?").value).toBe("no");
    expect(field(form, "Permit Number").value).toBe("");
    cleanup();
  });
});
