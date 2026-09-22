/**
 * Inspection checklist for business types with no configured requirements.
 *
 * A type such as Ambulant Food Vendor has no requirements until the Sanitation
 * Section provides them. The checklist must stay empty for it instead of being
 * filled with a generic list, while types that do have requirements keep
 * loading exactly their configured ones.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ user: { username: "tester", display_name: "Maria Santos" } }),
}));
jest.mock("../../shared/csvExport", () => ({
  datedCsvFilename: (name) => `${name}.csv`,
  exportCsv: jest.fn(),
}));

import InspectionManagement from "./InspectionManagement";

// The generic list the page used to substitute when no requirements matched.
const OLD_GENERIC_FALLBACK = [
  "1x1 picture of owner and employees",
  "Barangay Clearance of owner",
  "CTC/Cedula of owner and employees",
  "Certificate of 40-hour Training Course (Owner)",
  "Certificate of Potability of Product Water",
  "Chest X-ray Results (Owner & employees)",
  "DOH Operational Permit Certificate",
  "Potability of Water Supply - Microbiological Examination",
  "Potability of Water Supply - Physical/Chemical Examination",
  "Xerox copy of DTI/SEC/CDA",
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
    { id: 1, requirement_name: "Water Potability Certificate", permit_size: "sp", is_required: true },
    { id: 2, requirement_name: "Health Certificate of Staff", permit_size: "sp", is_required: true },
    { id: 3, requirement_name: "Large Coverage Only Item", permit_size: "large", is_required: true },
  ],
};

function establishment(id, name, type, overrides = {}) {
  return {
    id,
    business_name: name,
    owner_name: "Owner",
    business_type: type.id,
    business_type_name: type.name,
    permit_size: "sp",
    barangay: "Daungan",
    address: "Pier Rd",
    inspection_frequency: "monthly",
    compliance_status: "no_permit",
    ...overrides,
  };
}

const mockCtx = {
  establishments: [
    establishment(701, "Fishball Cart", AMBULANT),
    establishment(702, "Aqua Station", WATER_STATION),
  ],
  inspections: [],
  businessTypes: [AMBULANT, WATER_STATION],
  loading: false,
  error: "",
  createInspection: jest.fn(() => Promise.resolve({})),
  updateInspection: jest.fn(() => Promise.resolve({})),
};

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => mockCtx,
}));

function openInspection(businessName) {
  render(<InspectionManagement />);
  fireEvent.click(screen.getByLabelText(`Conduct inspection for ${businessName}`));
  return document.querySelector(".inspection-modal");
}

function checklistNames(modal) {
  return [...modal.querySelectorAll(".inspection-checklist-box .check-row span")].map(
    (span) => span.textContent
  );
}

async function submittedPayload(modal) {
  fireEvent.click(within(modal).getByText("Submit Inspection"));
  await waitFor(() => expect(mockCtx.createInspection).toHaveBeenCalledTimes(1));
  return mockCtx.createInspection.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(cleanup);

describe("business type with no configured requirements", () => {
  test("shows an honest empty state instead of a generic checklist", () => {
    const modal = openInspection("Fishball Cart");

    expect(within(modal).getByText("No requirements configured yet.")).toBeTruthy();
    expect(checklistNames(modal)).toEqual([]);
    OLD_GENERIC_FALLBACK.forEach((name) =>
      expect(within(modal).queryByText(name)).toBeNull()
    );
  });

  test("submits no fabricated checklist items", async () => {
    const payload = await submittedPayload(openInspection("Fishball Cart"));

    expect(payload.establishment).toBe(701);
    expect(payload.checklist_items).toEqual([]);
  });

  test("the same holds for Large coverage", async () => {
    mockCtx.establishments = [
      establishment(701, "Fishball Cart", AMBULANT, { permit_size: "large" }),
    ];
    try {
      const modal = openInspection("Fishball Cart");
      expect(checklistNames(modal)).toEqual([]);
      const payload = await submittedPayload(modal);
      expect(payload.checklist_items).toEqual([]);
    } finally {
      mockCtx.establishments = [
        establishment(701, "Fishball Cart", AMBULANT),
        establishment(702, "Aqua Station", WATER_STATION),
      ];
    }
  });
});

describe("business type with configured requirements (unchanged)", () => {
  test("loads exactly the configured requirements for its permit coverage", () => {
    const modal = openInspection("Aqua Station");

    expect(checklistNames(modal)).toEqual([
      "Water Potability Certificate",
      "Health Certificate of Staff",
    ]);
    expect(within(modal).queryByText("No requirements configured yet.")).toBeNull();
    OLD_GENERIC_FALLBACK.forEach((name) =>
      expect(within(modal).queryByText(name)).toBeNull()
    );
  });

  test("submits the configured checklist items", async () => {
    const payload = await submittedPayload(openInspection("Aqua Station"));

    expect(payload.checklist_items.map((item) => item.requirement_name)).toEqual([
      "Water Potability Certificate",
      "Health Certificate of Staff",
    ]);
  });
});
