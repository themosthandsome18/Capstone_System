/**
 * Complaint inspection scheduling must assign a real staff account.
 *
 * The form used to offer four invented inspectors as the only choices, so a
 * complaint could be assigned to a person who does not exist. The options now
 * come from the sanitation staff list, while a name already stored on an older
 * record stays visible so history is not rewritten.
 */
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ user: { username: "tester", display_name: "Maria Santos" } }),
}));
jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => ({
    complaintData: { rows: [], summary: {} },
    loading: false,
    error: "",
    refreshComplaintData: jest.fn(),
    updateComplaint: jest.fn(),
    deleteComplaint: jest.fn(),
  }),
}));

import { ScheduleInspectionModal } from "./ComplaintsManagement";

// The invented roster the form used to offer.
const OLD_FABRICATED_INSPECTORS = [
  "Insp. J. Cruz",
  "Insp. M. Santos",
  "Insp. R. Dela Pena",
  "Insp. E. Alcantara",
];

const INSPECTORS = [
  { id: 1, name: "Ana Reyes" },
  { id: 2, name: "Ben Cruz" },
];

const REPORT = {
  id: 9001,
  complaint_id: "CMP-9001",
  category: "Food Establishment Hygiene",
  barangay: "Daungan",
  priority: "medium",
};

function renderModal(overrides = {}) {
  const props = {
    report: REPORT,
    schedule: {
      inspector: "Ana Reyes",
      date: "2026-09-30",
      time: "09:00",
      priority: "medium",
      note: "",
      notify: true,
    },
    inspectors: INSPECTORS,
    saving: false,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    onPriorityChange: jest.fn(),
    onChange: jest.fn(),
    ...overrides,
  };

  render(<ScheduleInspectionModal {...props} />);
  return props;
}

function inspectorSelect() {
  return document
    .querySelector("form, .schedule-modal, body")
    .querySelector("select");
}

afterEach(cleanup);

describe("assigned inspector options", () => {
  test("offers the real staff accounts", () => {
    renderModal();
    const options = [...inspectorSelect().querySelectorAll("option")].map(
      (option) => option.textContent
    );

    expect(options).toContain("Ana Reyes");
    expect(options).toContain("Ben Cruz");
  });

  test("never offers the invented inspectors", () => {
    renderModal();
    const options = [...inspectorSelect().querySelectorAll("option")].map(
      (option) => option.textContent
    );

    OLD_FABRICATED_INSPECTORS.forEach((name) =>
      expect(options).not.toContain(name)
    );
  });

  test("keeps showing a name already stored on an older record", () => {
    renderModal({
      schedule: {
        inspector: "Insp. R. Dela Pena",
        date: "2026-09-30",
        time: "09:00",
        priority: "medium",
        note: "",
        notify: true,
      },
    });

    const select = inspectorSelect();
    expect(select.value).toBe("Insp. R. Dela Pena");
    const options = [...select.querySelectorAll("option")].map(
      (option) => option.textContent
    );
    expect(options).toContain("Insp. R. Dela Pena");
    expect(options).toContain("Ana Reyes");
  });

  test("asks for a choice when no inspector is set", () => {
    renderModal({
      schedule: {
        inspector: "",
        date: "2026-09-30",
        time: "09:00",
        priority: "medium",
        note: "",
        notify: true,
      },
    });

    const placeholder = inspectorSelect().querySelector('option[value=""]');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toBe("Select inspector");
  });

  test("reports the chosen inspector by name", () => {
    const props = renderModal();
    fireEvent.change(inspectorSelect(), { target: { value: "Ben Cruz" } });

    expect(props.onChange).toHaveBeenCalledWith("inspector", "Ben Cruz");
  });

  test("says so when no staff accounts are available", () => {
    renderModal({ inspectors: [], schedule: { inspector: "", date: "2026-09-30", time: "09:00", priority: "medium", note: "", notify: true } });

    expect(
      within(document.body).getByText("No inspector accounts available.")
    ).toBeTruthy();
  });
});
