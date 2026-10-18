import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdRecords, { buildHouseholdEditPayload, printHouseholdProfile } from "./HouseholdRecords";
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
let mockRecords;
const stored = {
 id: 31, household_code: "HH-ADDRESS", household_head: "Santos, Ana", barangay: "Abo-abo",
 address: "  Lot 7, original SITIO / untouched  ", house_number: "01-A", sitio: "lower sitio",
 male_count: 1, female_count: 2, total_members: 3, toilet_type: "none", septic_tank_type: null,
 water_source: "Other", water_level: "level_2", waste_disposal: "collected", status: "violation",
 remarks: "Keep notes", last_survey_date: "2026-10-18",
};
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/SanitationDataContext", () => ({ useSanitationData: () => ({
 barangays: [], householdRecords: mockRecords, householdDashboardData: null, loading: false,
 error: null, createHousehold: mockCreate, updateHousehold: mockUpdate,
}) }));
beforeEach(() => { mockRecords = [{ ...stored }]; mockUpdate.mockClear(); mockCreate.mockClear(); });
function edit(record = stored) {
 mockRecords = [{ ...record }]; render(<HouseholdRecords />);
 fireEvent.click(screen.getByTitle("Edit Household Record"));
}
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
test("creation sends separate text fields and barangay without a fabricated combined address", async () => {
 render(<HouseholdRecords />); fireEvent.click(screen.getByRole("button", { name: "Add Household" }));
 fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Reyes" } });
 change("House Number", "01-b"); change("Sitio", "lower sitio"); change("Barangay *", "Abo-abo");
 fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
 fireEvent.click(screen.getByRole("radio", { name: "Level 2", exact: true }));
 fireEvent.click(screen.getByRole("button", { name: "Save Household" }));
 await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
 expect(mockCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ house_number: "01-b", sitio: "lower sitio", barangay: "Abo-abo", address: "" }));
});
test("details display all address information", () => {
 render(<HouseholdRecords />); fireEvent.click(screen.getByTitle("View Household Details"));
 for (const value of ["House Number", "01-A", "Sitio", "lower sitio"]) expect(screen.getByText(value)).toBeInTheDocument();
 expect(screen.getByText(stored.address, { normalizer: (text) => text })).toBeInTheDocument();
});
test.each([["House Number", "house_number", "B-9"], ["Sitio", "sitio", "new sitio"],
 ["Barangay *", "barangay", "Alitap"], ["Existing combined address", "address", "  exact CASE / new  "]])(
 "editing %s sends only the changed field", async (label, key, value) => {
 edit(); change(label, value); save();
 await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { [key]: value }));
});
test.each([["House Number", "house_number"], ["Sitio", "sitio"]])(
 "clearing %s sends only an explicit empty string", async (label, key) => {
 edit(); change(label, ""); save();
 await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(31, { [key]: "" }));
});
test.each([stored, { ...stored, house_number: undefined, sitio: undefined }])(
 "no-op preserves exact historical address and sends no request", (record) => {
 edit(record); expect(screen.getByLabelText("Existing combined address").value).toBe(stored.address);
 save(); expect(mockUpdate).not.toHaveBeenCalled(); expect(mockCreate).not.toHaveBeenCalled();
});
test("older payloads do not fabricate components and controls limit length", () => {
 const { house_number, sitio, ...legacy } = stored;
 edit(legacy);
 for (const label of ["House Number", "Sitio"]) {
 expect(screen.getByLabelText(label)).toHaveValue("");
 expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", "120");
 expect(screen.getByLabelText(label)).not.toBeRequired();
 }
});
test("house numbers compare as text", () => {
 expect(buildHouseholdEditPayload({ house_number: "1" }, { house_number: "01" })).toEqual({ house_number: "1" });
});
test("printing retains all address fields", () => {
 const write = jest.fn();
 const open = jest.spyOn(window, "open").mockReturnValue({ document: { write, close: jest.fn() }, focus: jest.fn(), print: jest.fn() });
 printHouseholdProfile(stored);
 for (const value of ["01-A", "lower sitio", "Abo-abo", stored.address]) expect(write.mock.calls[0][0]).toContain(value);
 open.mockRestore();
});
