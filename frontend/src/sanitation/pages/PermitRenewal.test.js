/**
 * Renewal requirements for business types with no configured requirements.
 *
 * A type such as Ambulant Food Vendor has no requirements until the Sanitation
 * Section provides them. Renewal must show an honest empty state for it and
 * never offer or save a generic list, while types that do have requirements
 * keep their existing behaviour (including the SP/Large matching).
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import PermitRenewal, { getEstablishmentRequirements } from "./PermitRenewal";

// The generic list the page used to substitute when a type had no requirements.
const OLD_GENERIC_FALLBACK = [
  "Xerox copy of DTI/SEC/CDA",
  "Barangay Clearance of owner",
  "Chest X-ray Results (Owner & employees)",
  "CTC/Cedula of owner and employees",
  "1x1 picture of owner and employees",
  "Potability of Water Supply - Physical/Chemical Examination",
  "Potability of Water Supply - Microbiological Examination",
];

const AMBULANT = {
  id: 24,
  name: "Ambulant Food Vendor",
  inspection_frequency: "monthly",
  requirements: [],
};

const WATER_STATION = {
  id: 8,
  name: "Water Refilling Station",
  inspection_frequency: "monthly",
  requirements: [
    { id: 1, requirement_name: "Water Potability Certificate", permit_size: "sp" },
    { id: 2, requirement_name: "Health Certificate of Staff", permit_size: "sp" },
    { id: 3, requirement_name: "Large Coverage Only Item", permit_size: "large" },
  ],
};

const SP_ONLY_TYPE = {
  id: 9,
  name: "Public Market Stall",
  inspection_frequency: "monthly",
  requirements: [{ id: 4, requirement_name: "Stall Cleanliness Clearance", permit_size: "sp" }],
};

const AMBULANT_EST = {
  id: 701,
  business_name: "Fishball Cart",
  business_type: AMBULANT.id,
  business_type_name: AMBULANT.name,
  permit_size: "sp",
  permit_number: "",
};
const WATER_EST = {
  id: 702,
  business_name: "Aqua Station",
  business_type: WATER_STATION.id,
  business_type_name: WATER_STATION.name,
  permit_size: "sp",
  permit_number: "SP-2026-100",
};

const AMBULANT_ROW = {
  id: 9001,
  renewal_id: "REN-9001",
  establishment: AMBULANT_EST.id,
  establishment_name: AMBULANT_EST.business_name,
  owner_name: "Tomas Reyes",
  business_type_id: AMBULANT.id,
  business_type_name: AMBULANT.name,
  permit_size: "sp",
  permit_size_label: "SP",
  permit_number: "",
  barangay: "Daungan",
  expiration_date: "2099-12-31",
  stage: "application_filed",
  stage_label: "Application Filed",
  progress: 0,
  renewal_fee: 0,
  payment_status: "unpaid",
  payment_status_label: "Unpaid",
  submitted_requirements: [],
};

const mockCtx = {
  businessTypes: [AMBULANT, WATER_STATION, SP_ONLY_TYPE],
  establishments: [AMBULANT_EST, WATER_EST],
  renewalData: { rows: [AMBULANT_ROW], summary: {}, stageCounts: [], barangays: [] },
  loading: false,
  error: "",
  refreshRenewalData: jest.fn(() => Promise.resolve()),
  createRenewal: jest.fn(() => Promise.resolve({})),
  updateRenewal: jest.fn(() => Promise.resolve({})),
};

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => mockCtx,
}));

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(cleanup);

/* ------------------------------------------------------------------ */
/* getEstablishmentRequirements                                         */
/* ------------------------------------------------------------------ */

describe("getEstablishmentRequirements", () => {
  const types = [AMBULANT, WATER_STATION, SP_ONLY_TYPE];

  test("returns no requirements for a type with none configured", () => {
    expect(getEstablishmentRequirements(AMBULANT_EST.id, [AMBULANT_EST], types)).toEqual([]);
    expect(
      getEstablishmentRequirements(
        { ...AMBULANT_EST, id: 1, permit_size: "large" },
        [],
        types
      )
    ).toEqual([]);
  });

  test("returns no requirements when no establishment is selected", () => {
    expect(getEstablishmentRequirements("", [AMBULANT_EST, WATER_EST], types)).toEqual([]);
  });

  test("returns a renewal row's configured requirements for its coverage (unchanged)", () => {
    expect(getEstablishmentRequirements(WATER_EST.id, [WATER_EST], types)).toEqual([
      "Water Potability Certificate",
      "Health Certificate of Staff",
    ]);
    expect(
      getEstablishmentRequirements(
        { establishment: 0, business_type_id: WATER_STATION.id, permit_size: "large" },
        [],
        types
      )
    ).toEqual(["Large Coverage Only Item"]);
  });

  test("still falls back to the type's own configured requirements across SP/Large (unchanged)", () => {
    expect(
      getEstablishmentRequirements(
        { establishment: 0, business_type_id: SP_ONLY_TYPE.id, permit_size: "large" },
        [],
        types
      )
    ).toEqual(["Stall Cleanliness Clearance"]);
  });
});

/* ------------------------------------------------------------------ */
/* New Renewal form                                                     */
/* ------------------------------------------------------------------ */

function openNewRenewal() {
  render(<PermitRenewal />);
  fireEvent.click(screen.getByText("New Renewal"));
  return document.querySelector("form.renewal-form-modal");
}

function selectEstablishment(form, id) {
  const select = within(form).getByText("Establishment").closest("label").querySelector("select");
  fireEvent.change(select, { target: { value: String(id) } });
}

function checklist(form) {
  return form.querySelector(".renewal-checklist");
}

describe("New Renewal form", () => {
  test("asks for an establishment before one is chosen, without a generic list", () => {
    const form = openNewRenewal();

    expect(within(checklist(form)).getByText("Select an establishment to load requirements.")).toBeTruthy();
    expect(checklist(form).querySelectorAll("input[type=checkbox]")).toHaveLength(0);
  });

  test("shows an empty state for a type with no configured requirements", () => {
    const form = openNewRenewal();
    selectEstablishment(form, AMBULANT_EST.id);

    expect(within(checklist(form)).getByText("No requirements configured yet.")).toBeTruthy();
    expect(checklist(form).querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    OLD_GENERIC_FALLBACK.forEach((name) =>
      expect(within(form).queryByText(name)).toBeNull()
    );
  });

  test("files the renewal with no fabricated submitted requirements", async () => {
    const form = openNewRenewal();
    selectEstablishment(form, AMBULANT_EST.id);
    fireEvent.submit(form);

    await waitFor(() => expect(mockCtx.createRenewal).toHaveBeenCalledTimes(1));
    expect(mockCtx.createRenewal.mock.calls[0][0].submitted_requirements).toEqual([]);
  });

  test("a type with configured requirements lists and saves them as before", async () => {
    const form = openNewRenewal();
    selectEstablishment(form, WATER_EST.id);

    const labels = [...checklist(form).querySelectorAll("label")].map((label) => label.textContent);
    expect(labels).toEqual(["Water Potability Certificate", "Health Certificate of Staff"]);

    fireEvent.click(within(checklist(form)).getByText("Water Potability Certificate"));
    fireEvent.submit(form);

    await waitFor(() => expect(mockCtx.createRenewal).toHaveBeenCalledTimes(1));
    expect(mockCtx.createRenewal.mock.calls[0][0].submitted_requirements).toEqual([
      "Water Potability Certificate",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Renewal detail                                                        */
/* ------------------------------------------------------------------ */

describe("Renewal detail", () => {
  test("shows an empty state and no toggleable generic items for a type with none configured", () => {
    render(<PermitRenewal />);
    fireEvent.click(screen.getByTitle("View Full Details"));
    const detail = document.querySelector(".renewal-detail-modal");

    expect(within(detail).getByText("No requirements configured yet.")).toBeTruthy();
    expect(detail.querySelectorAll(".renewal-req-item")).toHaveLength(0);
    OLD_GENERIC_FALLBACK.forEach((name) =>
      expect(within(detail).queryByText(name)).toBeNull()
    );
    expect(mockCtx.updateRenewal).not.toHaveBeenCalled();
  });
});
