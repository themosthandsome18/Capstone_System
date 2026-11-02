import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdRecords from "./HouseholdRecords";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
let mockRecords;
const stored = {
  id: 11, household_code: "SYN-COUNTS", household_head: "Santos, Ana", barangay: "Abo-abo",
  address: "001", house_number: "01", sitio: "Legacy sitio", male_count: 4, female_count: 6,
  total_members: 10, toilet_type: "pour_flush", septic_tank_type: "septic_tank",
  water_source: "  Deep Well, Private pump  ", water_level: "level_2", waste_disposal: "composted",
  status: "good_standing", remarks: "001", latitude: null, longitude: null, last_survey_date: "2025-07-04",
};
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/SanitationDataContext", () => ({ useSanitationData: () => ({
  barangays: [], householdRecords: mockRecords, householdDashboardData: null, loading: false, error: null,
  createHousehold: mockCreate, updateHousehold: mockUpdate,
}) }));
beforeEach(() => { mockRecords = [stored]; mockCreate.mockClear(); mockUpdate.mockClear(); });
function open(mode, record = stored) {
  mockRecords = [record];
  render(<HouseholdRecords />);
  if (mode === "Edit") fireEvent.click(screen.getByTitle("Edit Household Record"));
  else {
    fireEvent.click(screen.getByRole("button", { name: "Add Household" }));
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Synthetic" } });
    fireEvent.change(screen.getByLabelText("Barangay *"), { target: { value: "Abo-abo" } });
    fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
    fireEvent.click(screen.getByRole("radio", { name: "Level 2", exact: true }));
  }
}
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = (mode) => fireEvent.click(screen.getByRole("button", { name: mode === "Edit" ? "Save Changes" : "Save Household" }));

const invalid = ["-1", "1.9", "1e2", "1oops", "", " ", "1.0", "2147483648", "9007199254740991", "9007199254740992"];
describe.each(["Add", "Edit"])("%s count validation", (mode) => {
  test.each(invalid)("blocks invalid count %p without transforming it or writing", (value) => {
    open(mode);
    // Exercise both fields across the invalid-input matrix.
    const label = invalid.indexOf(value) % 2 === 0 ? "Male" : "Female";
    change(label, value);
    save(mode);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveValue(value);
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Enter a whole number from 0 to 2147483647/)).toBeInTheDocument();
    expect(screen.getByLabelText("Total")).toHaveTextContent("—");
  });

  test.each([["0", "0"], ["3", "7"], ["0002", "01"], ["2147483647", "2147483647"]])(
    "saves valid counts %s and %s as numbers without independently submitting the total", async (male, female) => {
      open(mode); change("Male", male); change("Female", female);
      const total = screen.getByLabelText("Total");
      expect(total.tagName).toBe("OUTPUT");
      expect(total).toHaveTextContent(String(Number(male) + Number(female)));
      save(mode);
      const write = mode === "Edit" ? mockUpdate : mockCreate;
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      const payload = write.mock.calls[0][mode === "Edit" ? 1 : 0];
      expect(payload).toMatchObject({ male_count: Number(male), female_count: Number(female) });
      expect(payload).not.toHaveProperty("total_members");
      expect(payload).not.toHaveProperty("latitude");
      expect(payload).not.toHaveProperty("longitude");
      if (mode === "Edit") expect(payload).toEqual({ male_count: Number(male), female_count: Number(female) });
    }
  );

  test("retains invalid input with feedback, then clears feedback after correction", async () => {
    open(mode); change("Male", "-1"); change("Female", "2.4"); save(mode);
    expect(mockCreate).not.toHaveBeenCalled(); expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Male")).toHaveValue("-1");
    expect(screen.getByLabelText("Female")).toHaveValue("2.4");
    change("Male", "2"); change("Female", "3");
    expect(screen.getByLabelText("Male")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Female")).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Enter a whole number from 0 to 2147483647/)).toBeNull();
    expect(screen.getByLabelText("Total")).toHaveTextContent("5");
    save(mode);
    await waitFor(() => expect(mode === "Edit" ? mockUpdate : mockCreate).toHaveBeenCalledTimes(1));
  });
});

test("unchanged count strings preserve no-op behavior and raw legacy fields", () => {
  open("Edit"); change("Male", "04"); change("Female", "06"); save("Edit");
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockUpdate).not.toHaveBeenCalled();
});


describe.each(["Add", "Edit"])("%s combined count boundaries", (mode) => {
  // total_members is a Python property, not a signed-32-bit database column.
  test.each([
    ["2147483647", "0", "2147483647"],
    ["2147483646", "1", "2147483647"],
    ["2147483647", "1", "2147483648"],
    ["1", "2147483647", "2147483648"],
    ["2147483647", "2147483647", "4294967294"],
  ])("persists only valid component counts %s + %s; derived total is %s", async (male, female, total) => {
    open(mode); change("Male", male); change("Female", female);
    expect(screen.getByLabelText("Total")).toHaveTextContent(total);
    save(mode);
    const write = mode === "Edit" ? mockUpdate : mockCreate;
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const payload = write.mock.calls[0][mode === "Edit" ? 1 : 0];
    expect(payload).toMatchObject({ male_count: Number(male), female_count: Number(female) });
    expect(payload).not.toHaveProperty("total_members");
    expect(payload).not.toHaveProperty("latitude");
    expect(payload).not.toHaveProperty("longitude");
    if (mode === "Edit") expect(payload).toEqual({ male_count: Number(male), female_count: Number(female) });
  });
});

test("unchanged maximum legacy counts remain a no-op above the signed-32-bit total", () => {
  open("Edit", { ...stored, male_count: 2147483647, female_count: 2147483647, total_members: 4294967294 });
  expect(screen.getByLabelText("Total")).toHaveTextContent("4294967294");
  save("Edit");
  expect(mockUpdate).not.toHaveBeenCalled(); expect(mockCreate).not.toHaveBeenCalled();
});

test("unrelated legacy text edit preserves maximum counts and raw legacy values", async () => {
  open("Edit", { ...stored, male_count: 2147483647, female_count: 2147483647, total_members: 4294967294 });
  fireEvent.change(screen.getByPlaceholderText("Additional notes..."), { target: { value: "1" } });
  save("Edit");
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(11, { remarks: "1" }));
});
