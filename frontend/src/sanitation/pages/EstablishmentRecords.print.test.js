import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ search: "" }), useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../shared/LocationPicker", () => () => null);
jest.mock("qrcode.react", () => ({
  QRCodeSVG: ({ id, value }) => <svg id={id} data-value={value} />,
}));
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ role: "sanitation" }),
}));
jest.mock("../../shared/csvExport", () => ({
  datedCsvFilename: (name) => `${name}.csv`,
  exportCsv: jest.fn(),
}));
jest.mock("../services/sanitationApi", () => ({
  issueOwnerTrackingCode: jest.fn(),
}));

import EstablishmentRecords from "./EstablishmentRecords";

const BASE = {
  id: 901,
  business_name: "Print Proof Store",
  owner_name: "Print Owner",
  business_type: 17,
  business_type_name: "Drug Store",
  permit_size: "sp",
  permit_size_label: "SP",
  barangay: "Daungan",
  address: "Print Proof Address",
  contact_number: "09171234567",
  has_permit: true,
  permit_number: "SP-2026-0901",
  permit_issued_date: "2026-01-10",
  permit_expiry_date: "2026-12-31",
  compliance_status: "good_standing",
  compliance_status_label: "Good Standing",
  permit_status: "active",
  permit_status_label: "Active",
  latitude: null,
  longitude: null,
  remarks: "",
  open_complaints: 0,
  account_username: null,
};

const mockCtx = {
  establishments: [BASE],
  businessTypes: [],
  inspections: [],
  complaintData: { rows: [] },
  renewalData: { rows: [] },
  loading: false,
  error: "",
  createEstablishment: jest.fn(),
  updateEstablishment: jest.fn(),
  deleteEstablishment: jest.fn(),
  refreshEstablishments: jest.fn(),
};

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => mockCtx,
}));

let printWindow;
let writtenHtml;

function fakePrintWindow() {
  printWindow = {
    document: {
      write: jest.fn((html) => {
        writtenHtml = html;
      }),
      close: jest.fn(),
    },
    focus: jest.fn(),
    print: jest.fn(),
  };
  return printWindow;
}

function printRecord(overrides = {}) {
  mockCtx.establishments = [{ ...BASE, ...overrides }];
  render(<EstablishmentRecords />);

  const row = document.querySelector(".establishment-table-wrap tbody tr");
  fireEvent.click(within(row).getByTitle("View establishment"));
  const modal = screen.getByRole("dialog");
  fireEvent.click(within(modal).getByRole("button", { name: /^Print$/ }));

  expect(printWindow.print).toHaveBeenCalledTimes(1);
  return new DOMParser().parseFromString(writtenHtml, "text/html");
}

function printedField(documentNode, label) {
  const box = [...documentNode.querySelectorAll(".grid .box")].find(
    (item) => item.querySelector("span")?.textContent === label
  );
  return box?.querySelector("strong")?.textContent;
}

function expectPermitNumberInBothLocations(documentNode, expected) {
  expect(documentNode.querySelector(".print-qr-permit strong")?.textContent).toBe(expected);
  expect(printedField(documentNode, "Permit Number")).toBe(expected);
}

beforeEach(() => {
  writtenHtml = "";
  jest.spyOn(window, "open").mockImplementation(() => fakePrintWindow());
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test("prints the exact stored permit number in both locations and keeps its QR", () => {
  const documentNode = printRecord({ permit_number: "SP-2026-0901" });

  expectPermitNumberInBothLocations(documentNode, "SP-2026-0901");
  expect(documentNode.querySelector(".print-qr-code svg")).not.toBeNull();
  expect(documentNode.querySelector(".print-qr-url")?.textContent).toContain(
    "/verify-permit/SP-2026-0901"
  );
  expect(printedField(documentNode, "Permit Status")).toBe("Active");
});

test.each([
  ["null", null],
  ["undefined", undefined],
  ["empty", ""],
  ["whitespace-only", "   "],
])("prints the missing-number text for a %s permit number even when the permit is active", (_, value) => {
  const documentNode = printRecord({
    has_permit: true,
    permit_number: value,
    permit_status: "active",
    permit_status_label: "Active",
  });

  expectPermitNumberInBothLocations(documentNode, "No permit number recorded");
  expect(printedField(documentNode, "Permit Status")).toBe("Active");
  expect(documentNode.querySelector(".print-qr-code svg")).toBeNull();
  expect(documentNode.querySelector(".print-qr-url")?.textContent).toBe(
    "No permit number recorded; no verification QR."
  );
});

test("uses the same missing-number text when has_permit is false", () => {
  const documentNode = printRecord({
    has_permit: false,
    permit_number: "",
    permit_status: "no_permit",
    permit_status_label: "No Permit",
  });

  expectPermitNumberInBothLocations(documentNode, "No permit number recorded");
  expect(printedField(documentNode, "Permit Status")).toBe("No Permit");
  expect(documentNode.querySelector(".print-qr-code svg")).toBeNull();
});

test("preserves an HTML-sensitive nonblank permit number as text and escapes the output", () => {
  const permitNumber = `SP-<&"'-2026`;
  const documentNode = printRecord({ permit_number: permitNumber });

  expectPermitNumberInBothLocations(documentNode, permitNumber);
  expect(writtenHtml).toContain("SP-&lt;&amp;&quot;&#039;-2026");
  expect(writtenHtml).not.toContain(`<strong>${permitNumber}</strong>`);
  expect(documentNode.querySelector(".print-qr-code svg")).not.toBeNull();
  expect(documentNode.querySelector(".print-qr-url")?.textContent).toContain(
    `/verify-permit/${encodeURIComponent(permitNumber)}`
  );
});
