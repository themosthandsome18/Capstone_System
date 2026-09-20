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
 * Known harness limitation: react-router-dom v7 ships ESM that CRA 5's Jest
 * resolver cannot load, so the router is stubbed here rather than changing
 * shared Jest config. The component only consumes useLocation/useNavigate.
 */
import React from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ search: "" }), useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../shared/LocationPicker", () => () => null);
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
  test("every field has its current default before staff enters anything", () => {
    const form = openCreateForm();

    expect(within(form).getByText("Register New Establishment")).toBeTruthy();

    const defaults = {
      "Business Name": field(form, "Business Name").value,
      "Owner / Proprietor": field(form, "Owner / Proprietor").value,
      Barangay: field(form, "Barangay").value,
      "Complete Address": field(form, "Complete Address").value,
      "Contact Number": field(form, "Contact Number").value,
      "Business Type": field(form, "Business Type").value,
      "Permit Size": field(form, "Permit Size").value,
      "Has Permit?": field(form, "Has Permit?").value,
      "Permit Number": field(form, "Permit Number").value,
      "Compliance Status": field(form, "Compliance Status").value,
      "Permit Status": field(form, "Permit Status").value,
      "Permit Issued Date": field(form, "Permit Issued Date").value,
      "Permit Expiry Date": field(form, "Permit Expiry Date").value,
      Latitude: field(form, "Latitude").value,
      Longitude: field(form, "Longitude").value,
      Remarks: field(form, "Remarks").value,
    };
    console.log("NEW FORM DEFAULTS:", JSON.stringify(defaults, null, 2));

    // Empty by default
    expect(defaults["Business Name"]).toBe("");
    expect(defaults["Owner / Proprietor"]).toBe("");
    expect(defaults.Barangay).toBe("");
    expect(defaults["Complete Address"]).toBe("");
    expect(defaults["Contact Number"]).toBe("");
    expect(defaults["Business Type"]).toBe("");
    expect(defaults["Permit Number"]).toBe("");
    expect(defaults["Permit Issued Date"]).toBe("");
    expect(defaults["Permit Expiry Date"]).toBe("");
    expect(defaults.Latitude).toBe("");
    expect(defaults.Longitude).toBe("");
    expect(defaults.Remarks).toBe("");

    // Non-empty defaults - the permissive starting state
    expect(defaults["Permit Size"]).toBe("sp");
    expect(defaults["Has Permit?"]).toBe("yes");
    expect(defaults["Compliance Status"]).toBe("good_standing");
    expect(defaults["Permit Status"]).toBe("active");
  });

  test("status selects hide the no_permit option while Has Permit = yes", () => {
    const form = openCreateForm();
    const compliance = [...field(form, "Compliance Status").options].map((o) => o.value);
    const permit = [...field(form, "Permit Status").options].map((o) => o.value);
    console.log("COMPLIANCE OPTS (has_permit=yes):", JSON.stringify(compliance));
    console.log("PERMIT OPTS (has_permit=yes):", JSON.stringify(permit));
    expect(compliance).toEqual(["good_standing", "upcoming", "for_completion", "violation"]);
    expect(permit).toEqual(["active", "renewal_due", "conditional", "suspended"]);
  });

  test("requirements panel is empty until a business type is chosen, then filters by permit size", () => {
    const form = openCreateForm();
    expect(within(form).getByText("Select a business type to load requirements.")).toBeTruthy();

    setField(form, "Business Type", "13");
    expect(within(form).getByText("Public Market Stall SP req")).toBeTruthy();

    setField(form, "Permit Size", "large");
    expect(within(form).getByText("Public Market Stall LG req")).toBeTruthy();
    expect(within(form).queryByText("Public Market Stall SP req")).toBeNull();
  });
});

/* ================================================================== */
/* FOCUS AREA 2 - submitted payload                                    */
/* ================================================================== */

describe("FOCUS 2: submission payload", () => {
  test("required-fields-only submit sends the permissive defaults and an auto permit number", async () => {
    const form = openCreateForm();
    fillRequired(form);
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    console.log("PAYLOAD (defaults untouched):", JSON.stringify(payload, null, 2));

    expect(payload.business_type).toBe(13);
    expect(typeof payload.business_type).toBe("number");
    expect(payload.permit_size).toBe("sp");
    expect(payload.has_permit).toBe(true);
    expect(payload.compliance_status).toBe("good_standing");
    expect(payload.permit_status).toBe("active");

    // Permit number is auto-generated at submit even though the field was left blank.
    // Fixture permit numbers are LG-2026-007 and "", so the SP sequence starts at 001.
    expect(payload.permit_number).toBe(SEQ_AFTER_FIXTURES);

    // Dates are NOT auto-filled on this path; they submit as null.
    expect(payload.permit_issued_date).toBeNull();
    expect(payload.permit_expiry_date).toBeNull();

    // Coordinates omitted by staff submit as null (backend then fills them in).
    expect(payload.latitude).toBeNull();
    expect(payload.longitude).toBeNull();

    expect(payload.remarks).toBe("");
    expect(payload.contact_number).toBe("");
    expect("id" in payload).toBe(false);
  });

  test("payload carries exactly the current field set (no extra keys)", async () => {
    const form = openCreateForm();
    fillRequired(form);
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const keys = Object.keys(mockCtx.createEstablishment.mock.calls[0][0]).sort();
    console.log("PAYLOAD KEYS:", JSON.stringify(keys));
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
      "permit_size",
      "permit_status",
      "remarks",
    ]);
  });

  test("text fields are title-cased on entry (apostrophes get an upper-cased letter)", async () => {
    const form = openCreateForm();
    fillRequired(form, { "Business Name": "perly's sari-sari store" });
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const name = mockCtx.createEstablishment.mock.calls[0][0].business_name;
    console.log("TITLE-CASED business_name:", JSON.stringify(name));
    expect(name).toBe("Perly'S Sari-Sari Store");
  });

  test("coordinates typed into the number inputs are submitted as numbers", async () => {
    const form = openCreateForm();
    fillRequired(form);
    setField(form, "Latitude", "14.188");
    setField(form, "Longitude", "121.732");
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    expect(payload.latitude).toBe(14.188);
    expect(payload.longitude).toBe(121.732);
    expect(typeof payload.latitude).toBe("number");
  });
});

/* ================================================================== */
/* FOCUS AREA 3 - Has Permit behaviour                                 */
/* ================================================================== */

describe("FOCUS 3: Has Permit behaviour", () => {
  test("With Permit: permit fields are visible and enabled", () => {
    const form = openCreateForm();
    [
      "Permit Number",
      "Permit Issued Date",
      "Permit Expiry Date",
      "Compliance Status",
      "Permit Status",
    ].forEach((label) => {
      const el = field(form, label);
      expect(el).not.toBeNull(); // visible
      expect(el.disabled).toBe(false); // enabled
    });
    expect(within(form).getByText(/Auto-Generate/)).toBeTruthy();
  });

  test("No Permit: fields stay VISIBLE but become DISABLED, values cleared, statuses forced", () => {
    const form = openCreateForm();

    // Seed values first so we can observe clearing.
    setField(form, "Permit Number", "SP-2026-999");
    setField(form, "Permit Issued Date", "2026-03-03");
    setField(form, "Permit Expiry Date", "2026-09-09");
    expect(field(form, "Permit Number").value).toBe("SP-2026-999");

    setField(form, "Has Permit?", "no");

    const state = [
      "Permit Number",
      "Permit Issued Date",
      "Permit Expiry Date",
      "Compliance Status",
      "Permit Status",
    ].reduce((acc, label) => {
      const el = field(form, label);
      acc[label] = { visible: el !== null, disabled: el.disabled, value: el.value };
      return acc;
    }, {});
    console.log("NO-PERMIT FIELD STATE:", JSON.stringify(state, null, 2));

    expect(state["Permit Number"]).toEqual({ visible: true, disabled: true, value: "" });
    expect(state["Permit Issued Date"]).toEqual({ visible: true, disabled: true, value: "" });
    expect(state["Permit Expiry Date"]).toEqual({ visible: true, disabled: true, value: "" });
    expect(state["Compliance Status"].value).toBe("no_permit");
    expect(state["Permit Status"].value).toBe("no_permit");

    // Auto-Generate button is hidden (the only element actually removed)
    expect(within(form).queryByText(/Auto-Generate/)).toBeNull();
    // Warning banner appears
    expect(within(form).getByText(/No Permit \/ For Immediate Inspection/)).toBeTruthy();
  });

  test("No Permit: cleared permit values are still PRESENT in the payload as empty/null", async () => {
    const form = openCreateForm();
    fillRequired(form);
    setField(form, "Permit Number", "SP-2026-999");
    setField(form, "Has Permit?", "no");
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    console.log("NO-PERMIT PAYLOAD:", JSON.stringify(payload, null, 2));
    expect(payload.has_permit).toBe(false);
    expect(payload.permit_number).toBe("");
    expect(payload.permit_issued_date).toBeNull();
    expect(payload.permit_expiry_date).toBeNull();
    expect(payload.compliance_status).toBe("no_permit");
    expect(payload.permit_status).toBe("no_permit");
  });

  test("toggling No Permit -> With Permit back-fills permit number and BOTH dates", () => {
    const form = openCreateForm();
    setField(form, "Has Permit?", "no");
    setField(form, "Has Permit?", "yes");

    const backfilled = {
      permit_number: field(form, "Permit Number").value,
      issued: field(form, "Permit Issued Date").value,
      expiry: field(form, "Permit Expiry Date").value,
      compliance: field(form, "Compliance Status").value,
      permit_status: field(form, "Permit Status").value,
    };
    console.log("BACK-FILLED ON RE-ENABLE:", JSON.stringify(backfilled));
    expect(backfilled.permit_number).toBe(SEQ_AFTER_FIXTURES);
    expect(backfilled.issued).toBe(TODAY);
    expect(backfilled.expiry).toBe(END_OF_YEAR);
    expect(backfilled.compliance).toBe("good_standing");
    expect(backfilled.permit_status).toBe("active");
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

  test("Auto-Generate OVERWRITES a value already typed into Permit Number", () => {
    const form = openCreateForm();
    setField(form, "Permit Number", "MANUALLY-TYPED-123");
    expect(field(form, "Permit Number").value).toBe("MANUALLY-TYPED-123");

    fireEvent.click(within(form).getByText(/Auto-Generate/));
    const after = field(form, "Permit Number").value;
    console.log("AFTER AUTO-GENERATE OVER EXISTING VALUE:", after);
    expect(after).toBe(SEQ_AFTER_FIXTURES);
  });

  test("a manually typed permit number is preserved through submit when non-blank", async () => {
    const form = openCreateForm();
    fillRequired(form);
    setField(form, "Permit Number", "CUSTOM-ABC-001");
    submit(form);
    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    expect(mockCtx.createEstablishment.mock.calls[0][0].permit_number).toBe("CUSTOM-ABC-001");
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

  test("out-of-range latitude/longitude PROCEED (number inputs bypass the Mauban bounds check)", async () => {
    const form = openCreateForm();
    fillRequired(form);
    setField(form, "Latitude", "99");
    setField(form, "Longitude", "-400");
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    console.log("OUT-OF-RANGE COORDS SUBMITTED:", payload.latitude, payload.longitude);
    expect(payload.latitude).toBe(99);
    expect(payload.longitude).toBe(-400);
  });

  test("expiry earlier than issued date PROCEEDS (no ordering rule)", async () => {
    const form = openCreateForm();
    fillRequired(form);
    setField(form, "Permit Issued Date", "2026-12-01");
    setField(form, "Permit Expiry Date", "2026-01-01");
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    console.log(
      "REVERSED DATES SUBMITTED:",
      payload.permit_issued_date,
      "->",
      payload.permit_expiry_date
    );
    expect(payload.permit_issued_date).toBe("2026-12-01");
    expect(payload.permit_expiry_date).toBe("2026-01-01");
  });

  test("missing permit dates while Has Permit = yes PROCEED as null", async () => {
    const form = openCreateForm();
    fillRequired(form);
    expect(field(form, "Permit Issued Date").value).toBe("");
    submit(form);

    await waitFor(() => expect(mockCtx.createEstablishment).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createEstablishment.mock.calls[0][0];
    expect(payload.has_permit).toBe(true);
    expect(payload.permit_issued_date).toBeNull();
    expect(payload.permit_expiry_date).toBeNull();
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
  test("all 15 real options are present with their numeric IDs", () => {
    const form = openCreateForm();
    const opts = [...field(form, "Business Type").options].map(
      (o) => o.value + ":" + o.textContent
    );
    console.log("FORM BUSINESS TYPE OPTIONS:", JSON.stringify(opts, null, 2));

    expect(opts[0]).toBe(":Select business type");
    expect(opts.slice(1)).toEqual(REAL_BUSINESS_TYPES.map((t) => t.id + ":" + t.name));
    expect(opts).toHaveLength(16);
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

    const loaded = {
      business_name: field(form, "Business Name").value,
      owner_name: field(form, "Owner / Proprietor").value,
      business_type: field(form, "Business Type").value,
      permit_size: field(form, "Permit Size").value,
      barangay: field(form, "Barangay").value,
      contact_number: field(form, "Contact Number").value,
      has_permit: field(form, "Has Permit?").value,
      permit_number: field(form, "Permit Number").value,
      issued: field(form, "Permit Issued Date").value,
      expiry: field(form, "Permit Expiry Date").value,
      compliance: field(form, "Compliance Status").value,
      permit_status: field(form, "Permit Status").value,
      latitude: field(form, "Latitude").value,
      longitude: field(form, "Longitude").value,
      remarks: field(form, "Remarks").value,
    };
    console.log("EDIT FORM LOADED VALUES:", JSON.stringify(loaded, null, 2));

    expect(loaded.business_type).toBe("13"); // real ID, not a label
    expect(loaded.permit_size).toBe("large"); // real operational value
    expect(loaded.has_permit).toBe("yes");
    expect(loaded.permit_number).toBe("LG-2026-007");
    expect(loaded.issued).toBe("2026-02-01");
    expect(loaded.expiry).toBe("2026-12-31");
    expect(loaded.compliance).toBe("for_completion");
    expect(loaded.permit_status).toBe("conditional");
    expect(loaded.latitude).toBe("14.191234");
    expect(loaded.longitude).toBe("121.735678");
    expect(loaded.remarks).toBe("Existing remarks");
  });

  test("saving an unchanged edit submits the same underlying values", async () => {
    const form = openEditForm(0);
    submit(form);

    await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
    const [id, payload] = mockCtx.updateEstablishment.mock.calls[0];
    console.log("EDIT SUBMITTED:", id, JSON.stringify(payload, null, 2));
    expect(id).toBe(501);
    expect(payload.business_type).toBe(13);
    expect(payload.permit_size).toBe("large");
    expect(payload.has_permit).toBe(true);
    expect(payload.permit_number).toBe("LG-2026-007");
    expect(payload.compliance_status).toBe("for_completion");
    expect(payload.permit_status).toBe("conditional");
    expect(payload.latitude).toBe(14.191234);
    expect(payload.longitude).toBe(121.735678);
    expect(mockCtx.createEstablishment).not.toHaveBeenCalled();
  });

  test("editing a NO-PERMIT record keeps it no-permit and leaves coordinates blank", () => {
    const form = openEditForm(1); // NO_PERMIT_ESTABLISHMENT
    const loaded = {
      business_type: field(form, "Business Type").value,
      has_permit: field(form, "Has Permit?").value,
      permit_number: field(form, "Permit Number").value,
      issued: field(form, "Permit Issued Date").value,
      expiry: field(form, "Permit Expiry Date").value,
      compliance: field(form, "Compliance Status").value,
      latitude: field(form, "Latitude").value,
      longitude: field(form, "Longitude").value,
    };
    console.log("EDIT NO-PERMIT LOADED:", JSON.stringify(loaded));
    expect(loaded.business_type).toBe("23");
    expect(loaded.has_permit).toBe("no");
    expect(loaded.permit_number).toBe("");
    expect(loaded.issued).toBe("");
    expect(loaded.expiry).toBe("");
    expect(loaded.compliance).toBe("no_permit");
    expect(loaded.latitude).toBe("");
    expect(loaded.longitude).toBe("");
  });

  test("CHARACTERIZATION: editing a with-permit record that has NULL dates silently back-fills them", async () => {
    // Mirrors production record id=448: has_permit=true but both dates null.
    const original = mockCtx.establishments;
    mockCtx.establishments = [
      { ...EXISTING_ESTABLISHMENT, permit_issued_date: null, permit_expiry_date: null },
    ];
    try {
      const form = openEditForm(0);
      const issued = field(form, "Permit Issued Date").value;
      const expiry = field(form, "Permit Expiry Date").value;
      console.log("NULL-DATE EDIT BACK-FILL -> issued:", issued, "expiry:", expiry);
      expect(issued).toBe(TODAY);
      expect(expiry).toBe(END_OF_YEAR);

      submit(form);
      await waitFor(() => expect(mockCtx.updateEstablishment).toHaveBeenCalledTimes(1));
      const payload = mockCtx.updateEstablishment.mock.calls[0][1];
      // Merely opening and saving the record writes dates that were never entered.
      expect(payload.permit_issued_date).toBe(TODAY);
      expect(payload.permit_expiry_date).toBe(END_OF_YEAR);
    } finally {
      mockCtx.establishments = original;
    }
  });
});
