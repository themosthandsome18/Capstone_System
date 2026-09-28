/**
 * Community reports now carry the reporter's typed location in its own
 * location_address field. Staff must see it next to the barangay, and it must
 * be searchable like the other report text.
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ user: { username: "tester", display_name: "Maria Santos" } }),
}));
jest.mock("../services/sanitationApi", () => ({
  fetchSanitationInspectors: () => Promise.resolve([]),
}));

const mockRows = [
  {
    id: 7001,
    complaint_id: "SAN-7001",
    complainant_name: "Juana Reporter",
    contact_number: "09171234567",
    category: "Severe Sewage Overflow",
    barangay: "Daungan",
    location_address: "Corner of Rizal St., across from the market",
    description: "The septic tank is overflowing.",
    status: "pending",
    status_label: "Pending",
    priority: "high",
    priority_label: "High",
    reported_date: "2026-09-27",
  },
  {
    id: 7002,
    complaint_id: "SAN-7002",
    complainant_name: "Pedro Reporter",
    contact_number: "09179998888",
    category: "Improper Garbage Disposal",
    barangay: "Poblacion",
    location_address: "Purok 3, behind the church",
    description: "Garbage is piling up.",
    status: "pending",
    status_label: "Pending",
    priority: "medium",
    priority_label: "Medium",
    reported_date: "2026-09-26",
  },
];

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({
    complaintData: { rows: mockRows, summary: {} },
    loading: false,
    error: "",
    refreshComplaintData: jest.fn(),
    updateComplaint: jest.fn(),
    deleteComplaint: jest.fn(),
  }),
}));

// eslint-disable-next-line import/first
import ComplaintsManagement from "./ComplaintsManagement";

test("the selected report shows its typed location next to the barangay", () => {
  const { container } = render(<ComplaintsManagement />);
  const detail = container.querySelector(".community-detail-panel, .community-detail") || container;

  expect(
    within(detail).getAllByText("Corner of Rizal St., across from the market").length
  ).toBeGreaterThan(0);
});

test("reports can be found by their typed location", () => {
  render(<ComplaintsManagement />);

  fireEvent.change(screen.getByPlaceholderText(/Search by location/), {
    target: { value: "behind the church" },
  });

  const cardIds = [...document.querySelectorAll(".community-report-card .community-card-meta small:first-child")]
    .map((node) => node.textContent);
  expect(cardIds).toEqual(["SAN-7002"]);
});
