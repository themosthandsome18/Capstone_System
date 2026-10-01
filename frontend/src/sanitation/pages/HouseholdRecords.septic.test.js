import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import HouseholdRecords from "./HouseholdRecords";

const mockUpdateHousehold = jest.fn();
const mockCreateHousehold = jest.fn();
let mockHouseholdRecords = [];

const baseRecord = {
  id: 21,
  household_code: "HH-W2",
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
};

beforeEach(() => {
  mockUpdateHousehold.mockClear();
  mockCreateHousehold.mockClear();
  mockHouseholdRecords = [{ ...baseRecord }];
});

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({
    barangays: [],
    householdRecords: mockHouseholdRecords,
    householdDashboardData: null,
    loading: false,
    error: null,
    createHousehold: mockCreateHousehold,
    updateHousehold: mockUpdateHousehold,
  }),
}));

function radiosFor(label) {
  return within(screen.getByRole("radiogroup", { name: label })).getAllByRole("radio");
}
function choose(label, value) {
  fireEvent.click(radiosFor(label).find((radio) => radio.value === value));
}
function selectedFor(label) {
  return radiosFor(label).find((radio) => radio.checked)?.value ?? "";
}

function openExistingRecord(record = baseRecord) {
  mockHouseholdRecords = [{ ...record }];
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByTitle("Edit Household Record"));
}

function openNewRecord() {
  mockHouseholdRecords = [];
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByRole("button", { name: "Add Household" }));
  fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Reyes" } });
  fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Maria" } });
  fireEvent.change(screen.getByRole("option", { name: "Select barangay..." }).parentElement, {
    target: { value: "Abo-abo" },
  });
  choose("Water Source *", "Other");
  choose("Water Level *", "level_2");
}

test("new applicable records show the exact septic choices and require one", () => {
  openNewRecord();
  choose("Toilet Type *", "water_sealed");

  expect(radiosFor("Septic Tank Type *").map((radio) => radio.value)).toEqual([
    "bottomless", "vault_sealed",
  ]);

  fireEvent.click(screen.getByRole("button", { name: "Save Household" }));
  expect(screen.getByText(/septic tank type is required/i)).toBeTruthy();
  expect(mockCreateHousehold).not.toHaveBeenCalled();
});

test.each(["water_sealed", "pour_flush"])(
  "new %s record submits the selected septic value",
  async (toiletType) => {
    openNewRecord();
    choose("Toilet Type *", toiletType);
    choose("Septic Tank Type *", "bottomless");
    fireEvent.click(screen.getByRole("button", { name: "Save Household" }));

    await waitFor(() => expect(mockCreateHousehold).toHaveBeenCalledTimes(1));
    expect(mockCreateHousehold.mock.calls[0][0]).toEqual(
      expect.objectContaining({ toilet_type: toiletType, septic_tank_type: "bottomless" })
    );
    expect(mockUpdateHousehold).not.toHaveBeenCalled();
  }
);

test("existing applicable records initialize their stored septic value", () => {
  openExistingRecord();
  expect(selectedFor("Septic Tank Type *")).toBe("vault_sealed");
});

test("an unrelated edit omits and preserves the existing septic value", async () => {
  openExistingRecord();
  fireEvent.change(screen.getByPlaceholderText("House no., Street, sitio"), {
    target: { value: "New address" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() =>
    expect(mockUpdateHousehold).toHaveBeenCalledWith(21, { address: "New Address" })
  );
});

test("changing only the septic value sends a one-field PATCH", async () => {
  openExistingRecord();
  choose("Septic Tank Type *", "bottomless");
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() =>
    expect(mockUpdateHousehold).toHaveBeenCalledWith(21, {
      septic_tank_type: "bottomless",
    })
  );
});

test.each(["pit_latrine", "none"])(
  "switching to %s hides the selector and explicitly clears septic",
  async (toiletType) => {
    openExistingRecord();
    choose("Toilet Type *", toiletType);

    expect(screen.queryByText("Septic Tank Type *")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(mockUpdateHousehold).toHaveBeenCalledWith(21, {
        toilet_type: toiletType,
        septic_tank_type: null,
      })
    );
  }
);

test("switching between applicable toilets retains the septic selection", () => {
  openExistingRecord();
  choose("Toilet Type *", "water_sealed");
  expect(selectedFor("Septic Tank Type *")).toBe("vault_sealed");
});

test("switching away and back requires a new septic selection", () => {
  openExistingRecord();
  choose("Toilet Type *", "none");
  choose("Toilet Type *", "pour_flush");
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  expect(screen.getByText(/septic tank type is required/i)).toBeTruthy();
  expect(mockUpdateHousehold).not.toHaveBeenCalled();
});

test.each([null, ""])(
  "legacy applicable septic value %p survives an unrelated edit without fabrication",
  async (legacyValue) => {
    openExistingRecord({ ...baseRecord, septic_tank_type: legacyValue });
    fireEvent.change(screen.getByPlaceholderText("House no., Street, sitio"), {
      target: { value: "Legacy address" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(mockUpdateHousehold).toHaveBeenCalledWith(21, { address: "Legacy Address" })
    );
  }
);

test("an unknown stored septic value blocks destructive editing", () => {
  openExistingRecord({ ...baseRecord, septic_tank_type: "legacy_unknown" });
  fireEvent.change(screen.getByPlaceholderText("House no., Street, sitio"), {
    target: { value: "Unsafe rewrite" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  expect(screen.getByText(/unsupported legacy septic tank type/i)).toBeTruthy();
  expect(mockUpdateHousehold).not.toHaveBeenCalled();
});
