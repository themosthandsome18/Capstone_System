import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HouseholdRecords from "./HouseholdRecords";

const mockUpdate = jest.fn();
const mockCreate = jest.fn();
let mockRecords;
const stored = {
  id: 31, household_code: "HH-C", household_head: "Santos, Ana", barangay: "Abo-abo",
  address: "Original", male_count: 7, female_count: 2, total_members: 9,
  toilet_type: "water_sealed", septic_tank_type: "septic_tank",
  water_source: "  Deep Well, Private pump  ", water_level: "level_2",
  waste_disposal: "composted", status: "for_completion", remarks: "Keep notes",
  latitude: 14.192345, longitude: 121.734567, last_survey_date: "2025-07-04",
};
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({ barangays: [], householdRecords: mockRecords,
    householdDashboardData: null, loading: false, error: null,
    createHousehold: mockCreate, updateHousehold: mockUpdate }),
}));
beforeEach(() => { mockRecords = [{ ...stored }]; mockUpdate.mockClear(); mockCreate.mockClear(); });
function edit(record = stored) {
  mockRecords = [{ ...record }]; render(<HouseholdRecords />);
  fireEvent.click(screen.getByTitle("Edit Household Record"));
}
const group = (name) => screen.getByRole("radiogroup", { name });
const radio = (name) => screen.getByRole("radio", { name, exact: true });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
function add() {
  render(<HouseholdRecords />);
  fireEvent.click(screen.getByRole("button", { name: "Add Household" }));
  fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Reyes" } });
  fireEvent.change(screen.getByRole("option", { name: "Select barangay..." }).parentElement, { target: { value: "Abo-abo" } });
}

test("fixed fields are radio controls with exact choices and legacy messages", () => {
  edit();
  expect(within(group("Septic Tank Type *")).getAllByRole("radio").map((r) => r.value)).toEqual(["bottomless", "vault_sealed"]);
  expect(screen.queryByRole("radio", { name: "Septic tank", exact: true })).toBeNull();
  expect(screen.getByText(/Legacy value: Septic tank/)).toBeInTheDocument();
  expect(screen.getByText(/Legacy water source:/).textContent).toContain(stored.water_source);
  expect(within(group("Water Source *")).getAllByRole("radio").map((r) => r.value)).toEqual([
    "Deep well", "Poso-shallow well", "Spring", "Barangay water system", "Other",
  ]);
  expect(within(group("Water Level *")).getAllByRole("radio").map((r) => r.value)).toEqual(["level_1", "level_2", "level_3"]);
  expect(radio("Level 2")).toBeChecked();
  expect(radio("Other")).not.toBeChecked();
  expect(group("Toilet Type *").querySelector("select")).toBeNull();
  expect(group("Waste Disposal*").querySelector("select")).toBeNull();
  expect(screen.getByRole("option", { name: "Select barangay..." }).parentElement.tagName).toBe("SELECT");
  expect(screen.queryByText(/auto-assigned|assigned automatically/i)).toBeNull();
});

test("unrelated address edit preserves legacy septic, exact raw source and all other fields", async () => {
  edit();
  expect(screen.getByText(/Legacy value: Septic tank/)).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("House no., Street, sitio"), { target: { value: "New address" } });
  save();
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { address: "New Address" }));
});

test.each(["water_sealed", "pour_flush"])("legacy %s applicable transition requires replacement", (toilet) => {
  edit({ ...stored, toilet_type: toilet });
  fireEvent.click(radio(toilet === "water_sealed" ? "Pour Flush" : "Water-Sealed"));
  save();
  expect(screen.getByText(/septic tank type is required/i)).toBeInTheDocument();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test.each([["Bottomless", "bottomless"], ["Vault-sealed", "vault_sealed"]])("explicit %s replacement persists", async (label, value) => {
  edit(); fireEvent.click(radio(label)); save();
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { septic_tank_type: value }));
});

test.each([["Pit Latrine", "pit_latrine"], ["None", "none"]])("legacy transition to %s explicitly clears septic", async (label, value) => {
  edit(); fireEvent.click(radio(label));
  expect(screen.queryByRole("radiogroup", { name: "Septic Tank Type *" })).toBeNull();
  save();
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { toilet_type: value, septic_tank_type: null }));
});

test("source-only replacement sends one field, retains level and uses one selection", async () => {
  edit(); fireEvent.click(radio("Deep well")); fireEvent.click(radio("Other"));
  expect(radio("Deep well")).not.toBeChecked(); expect(radio("Other")).toBeChecked();
  expect(radio("Level 2")).toBeChecked(); save();
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { water_source: "Other" }));
});

test("level-only edit retains exact custom source and sends one field", async () => {
  edit(); fireEvent.click(radio("Level 1"));
  expect(screen.getByText(/Legacy water source:/).textContent).toContain(stored.water_source);
  save(); await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { water_level: "level_1" }));
});

test("Male Female Total share a row; Total is live read-only and omitted from PATCH", async () => {
  edit();
  const members = screen.getByRole("group", { name: "Household Members" });
  const male = within(members).getByLabelText("Male");
  const female = within(members).getByLabelText("Female");
  const total = within(members).getByLabelText("Total");
  expect(total.tagName).toBe("OUTPUT"); expect(total).toHaveTextContent("9");
  fireEvent.change(male, { target: { value: "8" } }); expect(total).toHaveTextContent("10");
  fireEvent.change(female, { target: { value: "3" } }); expect(total).toHaveTextContent("11");
  save(); await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { male_count: 8, female_count: 3 }));
});

test.each([["Bottomless", "bottomless"], ["Vault-sealed", "vault_sealed"]])("new %s POST uses independent selected source and level without total", async (label, value) => {
  add(); fireEvent.click(radio("Water-Sealed")); fireEvent.click(radio(label));
  fireEvent.click(radio("Level 2"));
  for (const source of ["Deep well", "Poso-shallow well", "Spring", "Barangay water system", "Other"]) {
    fireEvent.click(radio(source)); expect(radio("Level 2")).toBeChecked();
  }
  fireEvent.click(screen.getByRole("button", { name: "Save Household" }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ septic_tank_type: value, water_source: "Other", water_level: "level_2" }));
  expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("total_members");
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("radio focus and keyboard space select an approved value", () => {
  edit(); const bottomless = radio("Bottomless"); bottomless.focus();
  expect(bottomless).toHaveFocus(); userEvent.keyboard(" ");
  expect(bottomless).toBeChecked(); expect(bottomless.closest("label")).toHaveClass("is-selected");
});

test("legacy no-op sends neither PATCH nor POST", () => {
  edit(); expect(screen.getByText(/Legacy value: Septic tank/)).toBeInTheDocument(); save();
  expect(mockUpdate).not.toHaveBeenCalled(); expect(mockCreate).not.toHaveBeenCalled();
});

test("legacy blank source and unsupported level are visible and preserved", async () => {
  edit({ ...stored, water_source: "", water_level: "none" });
  expect(screen.getByText(/Legacy water source:/)).toBeInTheDocument();
  expect(screen.getByText(/Legacy water level: none/)).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("House no., Street, sitio"), { target: { value: "New address" } });
  save(); await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { address: "New Address" }));
});

test("new records require both source and independently chosen level", () => {
  add(); fireEvent.click(screen.getByRole("button", { name: "Save Household" }));
  expect(screen.getByText("Select a water source.")).toBeInTheDocument();
  fireEvent.click(radio("Other"));
  fireEvent.click(screen.getByRole("button", { name: "Save Household" }));
  expect(screen.getByText("Select a water level.")).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
});
