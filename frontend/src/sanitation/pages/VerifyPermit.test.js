/**
 * The public permit verification page confirms a permit and nothing more.
 *
 * It is reachable by anyone who scans or types a permit code, so it must never
 * show the owner, contact number, address or location, even if an older server
 * still sends them.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

let mockCode = "SP-2026-900";
jest.mock(
  "react-router-dom",
  () => ({ useParams: () => ({ code: mockCode }) }),
  { virtual: true }
);
jest.mock("../../shared/apiClient", () => ({ API_BASE_URL: "http://api.test/api" }));

// eslint-disable-next-line import/first
import VerifyPermit from "./VerifyPermit";

const VERIFIED = {
  verified: true,
  establishment: {
    business_name: "Verify Bakery",
    business_type_name: "Public Market Stall",
    barangay: "Daungan",
    permit_number: "SP-2026-900",
  },
  permit: {
    permit_number: "SP-2026-900",
    permit_status: "active",
    permit_status_label: "Active",
    permit_issued_date: "2026-01-05",
    permit_expiry_date: "2027-01-05",
  },
};

function mockFetchOnce(body, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => body });
}

afterEach(() => {
  delete global.fetch;
  mockCode = "SP-2026-900";
});

test("shows only the permit confirmation fields", async () => {
  mockFetchOnce(VERIFIED);
  render(<VerifyPermit />);

  expect(await screen.findByText("Verify Bakery")).toBeTruthy();
  expect(screen.getByText("Public Market Stall")).toBeTruthy();
  expect(screen.getByText("Daungan")).toBeTruthy();
  expect(screen.getByText("SP-2026-900")).toBeTruthy();
  expect(screen.getByText("Active")).toBeTruthy();
  expect(screen.getByText("2026-01-05")).toBeTruthy();
  expect(screen.getByText("2027-01-05")).toBeTruthy();
  expect(screen.queryByText("Owner / Proprietor")).toBeNull();
  expect(screen.queryByText("Address")).toBeNull();
});

test("never renders owner, contact, address or coordinates from an older server", async () => {
  mockFetchOnce({
    ...VERIFIED,
    establishment: {
      ...VERIFIED.establishment,
      owner_name: "Hidden Owner Person",
      contact_number: "09179998877",
      address: "77 Private Lane",
      latitude: 14.1911,
      longitude: 121.7311,
    },
  });
  const { container } = render(<VerifyPermit />);
  await screen.findByText("Verify Bakery");

  ["Hidden Owner Person", "09179998877", "77 Private Lane", "14.1911", "121.7311"].forEach(
    (secret) => expect(container.textContent).not.toContain(secret)
  );
});

test("the headline follows the permit status, not an inspection result", async () => {
  mockFetchOnce({
    ...VERIFIED,
    permit: { ...VERIFIED.permit, permit_status: "suspended", permit_status_label: "Suspended" },
  });
  render(<VerifyPermit />);

  expect(await screen.findByText("Verified: Permit Not Valid")).toBeTruthy();
});

test("the permit code is URL-encoded in the request", async () => {
  mockCode = "SP 2026/900";
  mockFetchOnce(VERIFIED);
  render(<VerifyPermit />);
  await screen.findByText("Verify Bakery");

  expect(global.fetch).toHaveBeenCalledWith(
    "http://api.test/api/mobile/sanitation/permits/verify/?code=SP%202026%2F900"
  );
});
