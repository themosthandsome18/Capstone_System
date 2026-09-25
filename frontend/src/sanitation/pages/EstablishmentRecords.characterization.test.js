/**
 * CHARACTERIZATION TESTS - Register New Establishment flow.
 *
 * These tests record what the Add/Edit Establishment form CURRENTLY does.
 * They are deliberately NOT a specification of desired behaviour: several
 * assertions below lock in behaviour that may later be judged undesirable
 * (permissive defaults, absent validation). When an intentional fix changes
 * one of these, update the test in the SAME commit as the fix so the change
 * is visible in review.
 *
 * Phase 1 of the Establishment Records redesign intentionally changed the
 * Register and Edit behaviour (FOCUS 1, 2, 3, 7, 8): registration now captures
 * the establishment profile only and records no permit, permit controls live in
 * Edit, and Edit sends only the fields staff changed. Those expectations were
 * updated in the same change; see EstablishmentRecords.test.js for the rest.
 *
 * Known harness limitation: react-router-dom v7 ships ESM that CRA 5's Jest
 * resolver cannot load, so the router is stubbed here rather than changing
 * shared Jest config. The component only consumes useLocation/useNavigate.
 */
import React from "react";
import {
  cleanup,
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ search: "" }), useNavigate: () => jest.fn() }),
  { virtual: true }
);
// Stands in for the map pin: applying it hands coordinates to the form exactly
// the way the real LocationPicker does (strings normalised to 6 decimals).
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

import EstablishmentRecords, { generatePermitNumber } from "./EstablishmentRecords";

/* ------------------------------------------------------------------ */
/* Fixtures - mirror the 15 real SanitaryBusinessType rows in production */
/* ------------------------------------------------------------------ */

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
].map(([id, name]) => ({
  id,
  name,
  inspection_frequency: "monthly",
  requirements: [
    { id: id * 100 + 1, permit_size: "sp", requirement_name: name + " SP req" },
    { id: id * 100 + 2, permit_size: "large", requirement_name: name + " LG req" },
  ],
}));

const EXISTING_ESTABLISHMENT = {
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
  account_username: null,
};

const NO_PERMIT_ESTABLISHMENT = {
  ...EXISTING_ESTABLISHMENT,
  id: 502,
  business_name: "No Permit Store",
  business_type: 23,
  business_type_name: "Karaoke / Video Bar / CSW",
  permit_size: "sp",
  has_permit: false,
  permit_number: "",
  permit_issued_date: null,
  permit_expiry_date: null,
  compliance_status: "no_permit",
  permit_status: "no_permit",
  latitude: null,
  longitude: null,
  remarks: "",
};

const mockCtx = {
  establishments: [EXISTING_ESTABLISHMENT, NO_PERMIT_ESTABLISHMENT],
  businessTypes: REAL_BUSINESS_TYPES,
  inspections: [],
  complaintData: { rows: [] },
  renewalData: { rows: [] },
  loading: false,
  error: "",
  createEstablishment: jest.fn().mockResolvedValue({}),
  updateEstablishment: jest.fn().mockResolvedValue({}),
  deleteEstablishment: jest.fn(),
};

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => mockCtx,
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = new Date().getFullYear();
const END_OF_YEAR = YEAR + "-12-31";
const SEQ_AFTER_FIXTURES = "SP-" + YEAR + "-001";

function openCreateForm() {
  render(<EstablishmentRecords />);
  fireEvent.click(screen.getByText(/Add Establishment/));
  return document.querySelector("form.establishment-modal");
}

function openEditForm(rowIndex) {
  const { container } = render(<EstablishmentRecords />);
  const rows = container.querySelectorAll(".establishment-table-wrap table tbody tr");
  fireEvent.click(within(rows[rowIndex]).getByTitle("Edit establishment"));
  return document.querySelector("form.establishment-modal");
}

/** Resolve a form control by its visible label text. */
function field(form, labelText) {
  return within(form).getByText(labelText).closest("label").querySelector("input, select");
}

function setField(form, labelText, value) {
  fireEvent.change(field(form, labelText), { target: { value } });
}

/** Fill only the five fields the frontend actually requires. */
function fillRequired(form, overrides = {}) {
  const values = {
    "Business Name": "New Test Shop",
    "Owner / Proprietor": "Ana Reyes",
    Barangay: "Daungan",
    "Complete Address": "1 Test St",
    "Business Type": "13",
    ...overrides,
  };
  Object.entries(values).forEach(([label, value]) => {
    if (value !== null) setField(form, label, value);
  });
}

const submit = (form) =>
  fireEvent.click(within(form).getByText(/Save & Register|Save Changes/));

const formErrorText = () =>
  document.querySelector(".sanitation-error-text")
    ? document.querySelector(".sanitation-error-text").textContent
    : null;

beforeEach(() => jest.clearAllMocks());

/* ================================================================== */
/* FOCUS AREA 1 - defaults on a newly opened form                      */
/* ================================================================== */

describe("FOCUS 1: new Register form defaults", () => {
  test("only establishment profile fields are shown, all empty by default", () => {
    const form = openCreateForm();

    expect(within(form).getByText("Register New Establishment")).toBeTruthy();

    const defaults = {
      "Business Name": field(form, "Business Name").value,
      "Owner / Proprietor": field(form, "Owner / Proprietor").value,
      Barangay: field(form, "Barangay").value,
      "Complete Address": field(form, "Complete Address").value,
      "Contact Number": field(form, "Contact Number").value,
      "Business Type": field(form, "Business Type").value,
    };
    Object.values(defaults).forEach((value) => expect(value).toBe(""));
  });

  test("permit, compliance, coverage, coordinate and remarks controls are not on the Register form", () => {
    const form = openCreateForm();
    [
      "Permit Size",
      "Permit Coverage (SP / Large)",
      "Has Permit?",
      "Permit Number",
      "Compliance Status",
      "Permit Status",
      "Permit Issued Date",
      "Permit Expiry Date",
      "Latitude",
      "Longitude",
      "Remarks",
    ].forEach((label) => expect(within(form).queryByText(label)).toBeNull());
    expect(within(form).queryByText(/Auto-Generate/)).toBeNull();
  });

  test("the Register form no longer shows an SP/Large-filtered requirement preview", () => {
    const form = openCreateForm();
    setField(form, "Business Type", "13");

    expect(within(form).queryByText(/AUTO-LOADED REQUIREMENTS/)).toBeNull();
    expect(within(form).queryByText("Public Market Stall SP req")).toBeNull();
    expect(within(form).queryByText("Public Market Stall LG req")).toBeNull();
  });
});

/* ================================================================== */
/* FOCUS AREA 2 - submitted payload                                    */
/* ================================================================== */

describe("FOCUS 2: submission payload", () => {
  test("required-fields-only submit registers the establishment with no permit on record", async () => {
    const form = openCreateForm();
    fillRequired(form);
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];

    expect(payload.business_type).toBe(13);
    expect(typeof payload.business_type).toBe("number");
    // No permit number, dates or "Good Standing" are invented at registration.
    expect(payload.has_permit).toBe(false);
    expect(payload.permit_number).toBe("");
    expect(payload.permit_issued_date).toBeNull();
    expect(payload.permit_expiry_date).toBeNull();
    expect(payload.compliance_status).toBe("not_yet_inspected");
    expect(payload.permit_status).toBe("no_permit");

    // Coordinates left unset submit as null (backend then fills them in).
    expect(payload.latitude).toBeNull();
    expect(payload.longitude).toBeNull();

    expect(payload.contact_number).toBe("");
    expect("id" in payload).toBe(false);
  });

  test("payload carries exactly the registration field set; SP/Large and remarks are left to backend defaults", async () => {
    const form = openCreateForm();
    fillRequired(form);
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const keys = Object.keys(mockCtx.createEstablishment.mock.calls[0][0]).sort();
    expect(keys).toEqual([
      "address",
      "barangay",
      "business_name",
      "business_type",
      "compliance_status",
      "contact_number",
      "has_permit",
      "latitude",
      "longitude",
      "owner_name",
      "permit_expiry_date",
      "permit_issued_date",
      "permit_number",
      "permit_status",
    ]);
  });

  test("text fields are title-cased on entry, and apostrophes are preserved", async () => {
    const form = openCreateForm();
    fillRequired(form, { "Business Name": "perly's sari-sari store" });
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const name = mockCtx.createEstablishment.mock.calls[0][0].business_name;
    expect(name).toBe("Perly's Sari-Sari Store");
  });

  test("coordinates applied from the map pin are submitted as numbers", async () => {
    const form = openCreateForm();
    fillRequired(form);
    fireEvent.click(within(form).getByText("Mock Apply Pin"));
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    expect(payload.latitude).toBe(14.188);
    expect(payload.longitude).toBe(121.732);
    expect(typeof payload.latitude).toBe("number");
  });
});

/* ================================================================== */
/* FOCUS AREA 3 - Has Permit behaviour (now in Edit only)              */
/* ================================================================== */

describe("FOCUS 3: Has Permit behaviour", () => {
  test("With Permit: permit fields are visible and enabled", () => {
    const form = openEditForm(0); // EXISTING_ESTABLISHMENT holds a permit
    [
      "Permit Number",
      "Permit Issued Date",
      "Permit Expiry Date",
      "Compliance Status",
      "Permit Status",
    ].forEach((label) => {
      const el = field(form, label);
      expect(el).not.toBeNull();
      expect(el.disabled).toBe(false);
    });
    expect(within(form).getByText(/Auto-Generate/)).toBeTruthy();
  });

  test("No Permit: fields stay VISIBLE but become DISABLED, values cleared, statuses forced", () => {
    const form = openEditForm(0);
    expect(field(form, "Permit Number").value).toBe("LG-2026-007");

    setField(form, "Has Permit?", "no");

    ["Permit Number", "Permit Issued Date", "Permit Expiry Date"].forEach((label) => {
      const el = field(form, label);
      expect(el.disabled).toBe(true);
      expect(el.value).toBe("");
    });
    // The permit toggle no longer decides compliance: the stored finding stands.
    expect(field(form, "Compliance Status").value).toBe("for_completion");
    expect(field(form, "Permit Status").value).toBe("no_permit");
    expect(within(form).queryByText(/Auto-Generate/)).toBeNull();
    expect(within(form).getByText(/No Permit \/ For Immediate Inspection/)).toBeTruthy();
  });

  test("No Permit: the explicitly cleared permit values are sent", async () => {
    const form = openEditForm(0);
    setField(form, "Has Permit?", "no");
    submit(form);

    await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.updateEstablishment.mock.calls[0][1];
    expect(payload.has_permit).toBe(false);
    expect(payload.permit_number).toBe("");
    expect(payload.permit_issued_date).toBeNull();
    expect(payload.permit_expiry_date).toBeNull();
    // Only permit fields are sent; the compliance finding is left alone.
    expect(payload).not.toHaveProperty("compliance_status");
    expect(payload.permit_status).toBe("no_permit");
  });

  test("toggling No Permit -> With Permit back-fills permit number and BOTH dates", () => {
    const form = openEditForm(1); // NO_PERMIT_ESTABLISHMENT (coverage sp)
    setField(form, "Has Permit?", "yes");

    expect(field(form, "Permit Number").value).toBe(SEQ_AFTER_FIXTURES);
    expect(field(form, "Permit Issued Date").value).toBe(TODAY);
    expect(field(form, "Permit Expiry Date").value).toBe(END_OF_YEAR);
    // Issuing a permit does not grant Good Standing.
    expect(field(form, "Compliance Status").value).toBe("no_permit");
    expect(field(form, "Permit Status").value).toBe("active");
  });
});

/* ================================================================== */
/* FOCUS AREA 4 - generatePermitNumber                                 */
/* ================================================================== */

describe("FOCUS 4: generatePermitNumber", () => {
  test("prefix is SP for sp / default and LG for large", () => {
    expect(generatePermitNumber([], "sp")).toBe("SP-" + YEAR + "-001");
    expect(generatePermitNumber([], "large")).toBe("LG-" + YEAR + "-001");
    expect(generatePermitNumber([])).toBe("SP-" + YEAR + "-001");
    expect(generatePermitNumber([], "LARGE")).toBe("LG-" + YEAR + "-001");
    expect(generatePermitNumber([], "anything-else")).toBe("SP-" + YEAR + "-001");
  });

  test("year comes from the client clock and sequence is max+1, zero-padded to 3", () => {
    const list = [
      { permit_number: "SP-" + YEAR + "-001" },
      { permit_number: "SP-" + YEAR + "-007" },
      { permit_number: "SP-" + YEAR + "-003" },
    ];
    expect(generatePermitNumber(list, "sp")).toBe("SP-" + YEAR + "-008");
    expect(generatePermitNumber([{ permit_number: "SP-" + YEAR + "-042" }], "sp")).toBe(
      "SP-" + YEAR + "-043"
    );
  });

  test("sequence is scoped per prefix and per year; other prefixes/years are ignored", () => {
    const list = [
      { permit_number: "LG-" + YEAR + "-050" },
      { permit_number: "SP-" + (YEAR - 1) + "-090" },
      { permit_number: "SP-" + YEAR + "-002" },
    ];
    expect(generatePermitNumber(list, "sp")).toBe("SP-" + YEAR + "-003");
    expect(generatePermitNumber(list, "large")).toBe("LG-" + YEAR + "-051");
  });

  test("blank / malformed / missing permit numbers are skipped", () => {
    const list = [
      { permit_number: "" },
      { permit_number: null },
      {},
      { permit_number: "NO PERMIT" },
      { permit_number: "SP-" + YEAR + "-abc" },
      { permit_number: "SP-" + YEAR + "-004" },
    ];
    expect(generatePermitNumber(list, "sp")).toBe("SP-" + YEAR + "-005");
  });

  test("sequence is derived from the MAX, so deleting the highest reuses its number", () => {
    const before = [
      { permit_number: "SP-" + YEAR + "-001" },
      { permit_number: "SP-" + YEAR + "-002" },
    ];
    expect(generatePermitNumber(before, "sp")).toBe("SP-" + YEAR + "-003");
    const afterDeletingHighest = [{ permit_number: "SP-" + YEAR + "-001" }];
    expect(generatePermitNumber(afterDeletingHighest, "sp")).toBe("SP-" + YEAR + "-002");
  });

  test("identical inputs yield an identical number (no uniqueness/statefulness)", () => {
    const list = [{ permit_number: "SP-" + YEAR + "-005" }];
    const a = generatePermitNumber(list, "sp");
    const b = generatePermitNumber(list, "sp");
    console.log("TWO CALLS, SAME INPUT:", a, b);
    expect(a).toBe(b);
  });

  test("Auto-Generate (in Edit) OVERWRITES a value already typed into Permit Number", () => {
    const form = openEditForm(0); // coverage "large", so the LG sequence is used
    setField(form, "Permit Number", "MANUALLY-TYPED-123");
    expect(field(form, "Permit Number").value).toBe("MANUALLY-TYPED-123");

    fireEvent.click(within(form).getByText(/Auto-Generate/));
    expect(field(form, "Permit Number").value).toBe(
      generatePermitNumber(mockCtx.establishments, "large")
    );
  });

  test("a manually typed permit number (in Edit) is sent as typed", async () => {
    const form = openEditForm(0);
    setField(form, "Permit Number", "CUSTOM-ABC-001");
    submit(form);
    await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
    expect(mockCtx.updateEstablishment.mock.calls[0][1].permit_number).toBe("CUSTOM-ABC-001");
  });
});

/* ================================================================== */
/* FOCUS AREA 5 - validation                                           */
/* ================================================================== */

describe("FOCUS 5: validation (blocks vs proceeds)", () => {
  test.each([
    ["Business Name", "Business name is required."],
    ["Owner / Proprietor", "Owner / proprietor is required."],
    ["Barangay", "Barangay is required."],
    ["Complete Address", "Address is required."],
    ["Business Type", "Business type is required."],
  ])("missing %s BLOCKS submission", async (label, expectedError) => {
    const form = openCreateForm();
    fillRequired(form, { [label]: null }); // omit this one field
    submit(form);

    await waitFor(() => expect(formErrorText()).toBe(expectedError));
    expect(mockCtx.createEstablishment).not.toHaveBeenCalled();
  });

  test("invalid contact number PROCEEDS (no format validation)", async () => {
    const form = openCreateForm();
    fillRequired(form);
    setField(form, "Contact Number", "not-a-phone-!!!");
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    expect(mockCtx.createEstablishment.mock.calls[0][0].contact_number).toBe("not-a-phone-!!!");
    expect(formErrorText()).toBeNull();
  });

  test("raw latitude/longitude inputs are gone; coordinates only come from the bounds-checked map pin", () => {
    const createForm = openCreateForm();
    expect(within(createForm).queryByText("Latitude")).toBeNull();
    expect(within(createForm).queryByText("Longitude")).toBeNull();
    cleanup();

    const editForm = openEditForm(0);
    expect(within(editForm).queryByText("Latitude")).toBeNull();
    expect(within(editForm).getByText("Mock Apply Pin")).toBeTruthy();
  });

  test("expiry earlier than issued date PROCEEDS in Edit (no ordering rule)", async () => {
    const form = openEditForm(0);
    setField(form, "Permit Issued Date", "2026-12-01");
    setField(form, "Permit Expiry Date", "2026-01-01");
    submit(form);

    await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.updateEstablishment.mock.calls[0][1];
    expect(payload.permit_issued_date).toBe("2026-12-01");
    expect(payload.permit_expiry_date).toBe("2026-01-01");
  });

  test("whitespace-only required values are trimmed and BLOCK submission", async () => {
    const form = openCreateForm();
    fillRequired(form, { "Business Name": "   " });
    submit(form);
    await waitFor(() => expect(formErrorText()).toBe("Business name is required."));
    expect(mockCtx.createEstablishment).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/* FOCUS AREA 7 - business-type regression                             */
/* ================================================================== */

describe("FOCUS 7: form uses REAL business types, not display labels", () => {
  test("all 15 real options are present with their numeric IDs, grouped by category", () => {
    const form = openCreateForm();
    const select = field(form, "Business Type");
    const selectable = [...select.options].filter((o) => o.value && !o.disabled);

    expect(select.options[0].value + ":" + select.options[0].textContent).toBe(
      ":Select business type"
    );
    expect(selectable.map((o) => o.value + ":" + o.textContent).sort()).toEqual(
      REAL_BUSINESS_TYPES.map((t) => t.id + ":" + t.name).sort()
    );
    // Every real option sits under one of the client's categories.
    selectable.forEach((o) => expect(o.parentElement.tagName).toBe("OPTGROUP"));
  });

  test("Karaoke / Video Bar / CSW remains a real, selectable option", () => {
    const form = openCreateForm();
    const opts = [...field(form, "Business Type").options].map((o) => o.textContent);
    expect(opts).toContain("Karaoke / Video Bar / CSW");
  });

  test("client-facing display labels are NOT offered as form options", () => {
    const form = openCreateForm();
    const labels = [...field(form, "Business Type").options].map((o) => o.textContent);
    [
      "Public Places",
      "Public Transport",
      "Commercial / NF",
      "Institutional Establishment",
      "Industrial Establishment",
      "Agro-Industrial Establishment",
    ].forEach((displayLabel) => expect(labels).not.toContain(displayLabel));
  });

  test("selecting Karaoke submits numeric 23, never the label 'Public Places'", async () => {
    const form = openCreateForm();
    fillRequired(form, { "Business Type": "23" });
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const submitted = mockCtx.createEstablishment.mock.calls[0][0].business_type;
    console.log("SUBMITTED business_type for Karaoke:", JSON.stringify(submitted), typeof submitted);
    expect(submitted).toBe(23);
    expect(typeof submitted).toBe("number");
    expect(submitted).not.toBe("Public Places");
  });
});

/* ================================================================== */
/* FOCUS AREA 8 - edit an existing record                              */
/* ================================================================== */

describe("FOCUS 8: edit flow loads existing values", () => {
  test("existing values load without conversion", () => {
    const form = openEditForm(0); // EXISTING_ESTABLISHMENT
    expect(within(form).getByText("Edit Establishment")).toBeTruthy();

    expect(field(form, "Business Type").value).toBe("13"); // real ID, not a label
    expect(field(form, "Permit Coverage (SP / Large)").value).toBe("large");
    expect(field(form, "Has Permit?").value).toBe("yes");
    expect(field(form, "Permit Number").value).toBe("LG-2026-007");
    expect(field(form, "Permit Issued Date").value).toBe("2026-02-01");
    expect(field(form, "Permit Expiry Date").value).toBe("2026-12-31");
    expect(field(form, "Compliance Status").value).toBe("for_completion");
    expect(field(form, "Permit Status").value).toBe("conditional");
    expect(field(form, "Remarks").value).toBe("Existing remarks");
  });

  test("saving an unchanged edit sends nothing and closes the form", async () => {
    const form = openEditForm(0);
    submit(form);

    await waitFor(() =>
      expect(document.querySelector("form.establishment-modal")).toBeNull()
    );
    expect(mockCtx.updateEstablishment).not.toHaveBeenCalled();
    expect(mockCtx.createEstablishment).not.toHaveBeenCalled();
  });

  test("editing a NO-PERMIT record keeps it no-permit", () => {
    const form = openEditForm(1); // NO_PERMIT_ESTABLISHMENT
    expect(field(form, "Business Type").value).toBe("23");
    expect(field(form, "Has Permit?").value).toBe("no");
    expect(field(form, "Permit Number").value).toBe("");
    expect(field(form, "Permit Issued Date").value).toBe("");
    expect(field(form, "Permit Expiry Date").value).toBe("");
    expect(field(form, "Compliance Status").value).toBe("no_permit");
  });

  test("editing a with-permit record that has NULL dates no longer back-fills them", async () => {
    // Mirrors production record id=448: has_permit=true but both dates null.
    const original = mockCtx.establishments;
    mockCtx.establishments = [
      { ...EXISTING_ESTABLISHMENT, permit_issued_date: null, permit_expiry_date: null },
    ];
    try {
      const form = openEditForm(0);
      expect(field(form, "Permit Issued Date").value).toBe("");
      expect(field(form, "Permit Expiry Date").value).toBe("");

      setField(form, "Contact Number", "09998887777");
      submit(form);
      await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
      expect(mockCtx.updateEstablishment.mock.calls[0][1]).toEqual({
        contact_number: "09998887777",
      });
    } finally {
      mockCtx.establishments = original;
    }
  });
});

/* ================================================================== */
/* REGRESSION - apostrophes in establishment names                     */
/* ================================================================== */

describe("REGRESSION: title-casing preserves apostrophes", () => {
  /** Type `typed` into a text field and read back what the form now holds. */
  function titleCasedValue(labelText, typed) {
    const form = openCreateForm();
    setField(form, labelText, typed);
    return field(form, labelText).value;
  }

  test.each([
    // The reported bug: the letter after an apostrophe was upper-cased.
    ["perly's sari-sari store", "Perly's Sari-Sari Store"],
    ["PERLY'S SARI-SARI STORE", "PERLY'S SARI-SARI STORE"],
    ["aling nena's carinderia", "Aling Nena's Carinderia"],
    ["d'best pizza", "D'best Pizza"],
    // Curly apostrophe, as produced by phone keyboards and Word.
    ["perly\u2019s store", "Perly\u2019s Store"],
    // Existing behaviour that must not change.
    ["sari-sari store", "Sari-Sari Store"],
    ["mauban water refilling station", "Mauban Water Refilling Station"],
    ["  leading and trailing  ", "  Leading And Trailing  "],
    ["double  spaced  words", "Double  Spaced  Words"],
    ["j.r. hardware", "J.R. Hardware"],
    ["7-eleven mauban", "7-Eleven Mauban"],
    ["st. peter chapel (main)", "St. Peter Chapel (Main)"],
    ["Already Title Cased", "Already Title Cased"],
    ["", ""],
  ])("Business Name %j -> %j", (typed, expected) => {
    expect(titleCasedValue("Business Name", typed)).toBe(expected);
  });

  test("the same rule applies to Owner / Proprietor and Complete Address", () => {
    const form = openCreateForm();
    setField(form, "Owner / Proprietor", "maria o'brien");
    setField(form, "Complete Address", "12 santo niño st.");

    expect(field(form, "Owner / Proprietor").value).toBe("Maria O'brien");
    expect(field(form, "Complete Address").value).toBe("12 Santo Niño St.");
  });

  test("the preserved apostrophe survives into the submitted payload", async () => {
    const form = openCreateForm();
    fillRequired(form, {
      "Business Name": "perly's sari-sari store",
      "Owner / Proprietor": "maria o'brien",
    });
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    expect(payload.business_name).toBe("Perly's Sari-Sari Store");
    expect(payload.owner_name).toBe("Maria O'brien");
  });

  test("an existing record's name is not re-mangled when re-saved from the edit form", async () => {
    const original = mockCtx.establishments;
    mockCtx.establishments = [
      { ...original[0], id: 501, business_name: "Perly's Sari-Sari Store" },
    ];
    try {
      const form = openEditForm(0);
      expect(field(form, "Business Name").value).toBe("Perly's Sari-Sari Store");

      // Saving an unrelated change must not re-send (and so cannot re-mangle) the name.
      setField(form, "Contact Number", "09175550000");
      submit(form);
      await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
      expect(mockCtx.updateEstablishment.mock.calls[0][1]).toEqual({
        contact_number: "09175550000",
      });

      // An edit that touches the name keeps the apostrophe intact.
      cleanup();
      jest.clearAllMocks();
      const nameForm = openEditForm(0);
      setField(nameForm, "Business Name", "perly's sari-sari store & grill");
      submit(nameForm);
      await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
      expect(mockCtx.updateEstablishment.mock.calls[0][1].business_name).toBe(
        "Perly's Sari-Sari Store & Grill"
      );
    } finally {
      mockCtx.establishments = original;
    }
  });
});
