import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdRecords, { buildHouseholdEditPayload } from "./HouseholdRecords";

const mockUpdateHousehold = jest.fn();
const mockCreateHousehold = jest.fn();

beforeEach(() => {
  mockUpdateHousehold.mockClear();
  mockCreateHousehold.mockClear();
});

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({
    barangays: [],
    householdRecords: [
      {
        id: 11,
        household_code: "HH-W1",
        household_head: "Santos, Ana",
        barangay: "Abo-abo",
        address: "Lot 7, sitio Mabini",
        male_count: 4,
        female_count: 6,
        total_members: 10,
        toilet_type: "pour_flush",
        toilet_type_label: "Pour Flush",
        septic_tank_type: "vault_sealed",
        water_source: "  Deep Well,  Private hand pump  ",
        water_level: "level_2",
        water_level_label: "Level II",
        waste_disposal: "composted",
        waste_disposal_label: "Composted",
        status: "good_standing",
        status_label: "Good Standing",
        remarks: "Keep existing note",
        latitude: 14.19,
        longitude: 121.73,
        last_survey_date: "2025-07-04",
      },
    ],
    householdDashboardData: null,
    loading: false,
    error: null,
    createHousehold: mockCreateHousehold,
    updateHousehold: mockUpdateHousehold,
  }),
}));

const snapshot = {
  household_head: "Santos, Ana",
  barangay: "Abo-abo",
  address: "Lot 7, sitio Mabini",
  male_count: 4,
  female_count: 6,
  toilet_type: "pour_flush",
  septic_tank_type: "vault_sealed",
  water_source: "  Deep Well,  Private hand pump  ",
  water_level: "level_2",
  waste_disposal: "composted",
  remarks: "Keep existing note",
  latitude: 14.19,
  longitude: 121.73,
  last_survey_date: "2025-07-04",
};

test("address-only edit produces a differential payload and preserves raw legacy fields", () => {
  const payload = buildHouseholdEditPayload(
    {
      household_head: "Santos, Ana",
      barangay: "Abo-abo",
      address: "New address",
      male_count: 4,
      female_count: 6,
      toilet_type: "pour_flush",
      water_source: snapshot.water_source,
      water_level: "level_2",
      waste_disposal: "composted",
      remarks: "Keep existing note",
      latitude: 14.19,
      longitude: 121.73,
      last_survey_date: "2025-07-04",
    },
    snapshot
  );

  expect(payload).toEqual({ address: "New address" });
});

test("no-op edit produces no write payload", () => {
  expect(
    buildHouseholdEditPayload(
      {
        household_head: "Santos, Ana",
        barangay: "Abo-abo",
        address: snapshot.address,
        male_count: 4,
        female_count: 6,
        toilet_type: "pour_flush",
        water_source: snapshot.water_source,
        water_level: "level_2",
        waste_disposal: "composted",
        remarks: snapshot.remarks,
        latitude: 14.19,
        longitude: 121.73,
        last_survey_date: snapshot.last_survey_date,
      },
      snapshot
    )
  ).toEqual({});
});

test("address-only edit interaction sends only the changed address", async () => {
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByTitle("Edit Household Record"));
  const address = screen.getByPlaceholderText("House no., Street, sitio");
  fireEvent.change(address, { target: { value: "New address" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() => expect(mockUpdateHousehold).toHaveBeenCalledWith(11, { address: "New Address" }));
  expect(mockCreateHousehold).not.toHaveBeenCalled();
});

test("no-op edit interaction performs no request", () => {
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByTitle("Edit Household Record"));
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  expect(mockUpdateHousehold).not.toHaveBeenCalled();
  expect(mockCreateHousehold).not.toHaveBeenCalled();
});

test("remarks-only edit interaction sends only the changed remarks", async () => {
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByTitle("Edit Household Record"));
  fireEvent.change(screen.getByPlaceholderText("Additional notes..."), {
    target: { value: "Intentional W1 note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() =>
    expect(mockUpdateHousehold).toHaveBeenCalledWith(11, {
      remarks: "Intentional W1 note",
    })
  );
  expect(mockCreateHousehold).not.toHaveBeenCalled();
});

test("new household interaction preserves POST payload behavior", async () => {
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByRole("button", { name: "Add Household" }));
  fireEvent.change(screen.getByPlaceholderText("Last name"), {
    target: { value: "Reyes" },
  });
  fireEvent.change(screen.getByPlaceholderText("First name"), {
    target: { value: "Maria" },
  });
  fireEvent.change(screen.getByRole("option", { name: "Select barangay..." }).parentElement, {
    target: { value: "Abo-abo" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
  fireEvent.click(screen.getByRole("radio", { name: "Level 2", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Save Household" }));

  await waitFor(() =>
    expect(mockCreateHousehold).toHaveBeenCalledWith({
      first_name: "Maria",
      last_name: "Reyes",
      household_head: "Reyes, Maria",
      barangay: "Abo-abo",
      address: "",
      male_count: 0,
      female_count: 0,
      toilet_type: "none",
      water_level: "level_2",
      water_source: "Other",
      waste_disposal: "collected",
      status: "good_standing",
      last_survey_date: new Date().toISOString().slice(0, 10),
      remarks: "",
    })
  );
  expect(mockUpdateHousehold).not.toHaveBeenCalled();
});

test("explicitly replacing a legacy custom source sends only the approved replacement", async () => {
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByTitle("Edit Household Record"));
  expect(screen.getByText(/Legacy water source:/).textContent).toContain(snapshot.water_source);
  fireEvent.click(screen.getByRole("radio", { name: "Deep well", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(mockUpdateHousehold).toHaveBeenCalledWith(11, { water_source: "Deep well" }));
});
