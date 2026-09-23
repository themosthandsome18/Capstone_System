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
let mockAuthUser = { username: "tester", display_name: "Maria Santos" };
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ user: mockAuthUser }),
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
    const modal = openInspection("Fishball Cart");
    // With no requirements there is no status to infer, so one must be picked.
    fireEvent.change(statusSelect(modal), { target: { value: "good_standing" } });
    const payload = await submittedPayload(modal);

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
      fireEvent.change(statusSelect(modal), { target: { value: "good_standing" } });
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

/* ------------------------------------------------------------------ */
/* Explicit status when there is nothing to check                       */
/* ------------------------------------------------------------------ */

function statusSelect(modal) {
  return within(modal)
    .getByText("Status After Inspection")
    .closest("label")
    .querySelector("select");
}

describe("status after inspection with an empty checklist", () => {
  test("starts with no status chosen, offering a placeholder", () => {
    const modal = openInspection("Fishball Cart");
    const select = statusSelect(modal);

    expect(select.value).toBe("");
    const placeholder = select.querySelector('option[value=""]');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toBe("Select status");
    expect(placeholder.disabled).toBe(true);
  });

  test("blocks submission until the inspector picks one", () => {
    const modal = openInspection("Fishball Cart");

    fireEvent.click(within(modal).getByText("Submit Inspection"));

    expect(mockCtx.createInspection).not.toHaveBeenCalled();
    expect(within(modal).getByText("Select the status after inspection.")).toBeTruthy();
  });

  test("submits the chosen status with an empty checklist", async () => {
    const modal = openInspection("Fishball Cart");
    fireEvent.change(statusSelect(modal), { target: { value: "upcoming" } });

    const payload = await submittedPayload(modal);

    expect(payload.status_after_inspection).toBe("upcoming");
    expect(payload.checklist_items).toEqual([]);
  });

  test("a configured type still defaults its status and submits (unchanged)", async () => {
    const modal = openInspection("Aqua Station");
    const select = statusSelect(modal);

    expect(select.value).toBe("violation");
    expect(select.querySelector('option[value=""]')).toBeNull();

    const payload = await submittedPayload(modal);
    expect(payload.status_after_inspection).toBe("violation");
  });
});

/* ------------------------------------------------------------------ */
/* Reopening drafts vs creating new inspections                         */
/* ------------------------------------------------------------------ */

// The page builds "today" from the local date, not UTC, so match that here or
// the same-day case silently stops being a same-day case.
const TODAY = (() => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
})();

// The page derives each row's latest inspection from the inspections list,
// so that is where a pre-existing inspection has to be injected.
function withLatestInspection(latestInspection) {
  const previous = mockCtx.inspections;
  mockCtx.inspections = [{ establishment: 701, ...latestInspection }];
  return () => {
    mockCtx.inspections = previous;
  };
}

describe("same-day inspections", () => {
  test("a finalized inspection dated today is never overwritten", async () => {
    const restore = withLatestInspection({
      id: 555,
      is_draft: false,
      inspection_date: TODAY,
      status_after_inspection: "violation",
      findings: "Earlier visit",
      checklist_items: [],
    });

    try {
      const modal = openInspection("Fishball Cart");
      fireEvent.change(statusSelect(modal), { target: { value: "good_standing" } });
      fireEvent.click(within(modal).getByText("Submit Inspection"));

      await waitFor(() => expect(mockCtx.createInspection).toHaveBeenCalledTimes(1));
      expect(mockCtx.updateInspection).not.toHaveBeenCalled();
      expect(mockCtx.createInspection.mock.calls[0][0].findings).toBe("");
    } finally {
      restore();
    }
  });

  test("an existing draft is reopened and updated in place", async () => {
    const restore = withLatestInspection({
      id: 556,
      is_draft: true,
      inspection_date: TODAY,
      status_after_inspection: "upcoming",
      findings: "Half-finished",
      checklist_items: [],
    });

    try {
      const modal = openInspection("Fishball Cart");
      fireEvent.click(within(modal).getByText("Submit Inspection"));

      await waitFor(() => expect(mockCtx.updateInspection).toHaveBeenCalledTimes(1));
      expect(mockCtx.updateInspection.mock.calls[0][0]).toBe(556);
      expect(mockCtx.createInspection).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test("a draft from an earlier day is still reopened", async () => {
    const restore = withLatestInspection({
      id: 557,
      is_draft: true,
      inspection_date: "2026-01-05",
      status_after_inspection: "for_completion",
      checklist_items: [],
    });

    try {
      const modal = openInspection("Fishball Cart");
      fireEvent.click(within(modal).getByText("Submit Inspection"));

      await waitFor(() => expect(mockCtx.updateInspection).toHaveBeenCalledTimes(1));
      expect(mockCtx.updateInspection.mock.calls[0][0]).toBe(557);
    } finally {
      restore();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Inspector attribution                                                */
/* ------------------------------------------------------------------ */

function withUser(user) {
  const previous = mockAuthUser;
  mockAuthUser = user;
  return () => {
    mockAuthUser = previous;
  };
}

function inspectorField(modal) {
  return within(modal)
    .getByText("Sanitary Inspector (Auto-Assigned)")
    .closest("label");
}

describe("inspector attribution", () => {
  test("uses the logged-in user's real name", async () => {
    const restore = withUser({ username: "msantos", display_name: "Maria Santos" });

    try {
      const modal = openInspection("Fishball Cart");
      expect(within(inspectorField(modal)).getByText("Maria Santos")).toBeTruthy();

      fireEvent.change(statusSelect(modal), { target: { value: "good_standing" } });
      const payload = await submittedPayload(modal);
      expect(payload.inspector_name).toBe("Maria Santos");
    } finally {
      restore();
    }
  });

  test("falls back to the username when there is no display name", async () => {
    const restore = withUser({ username: "msantos" });

    try {
      const modal = openInspection("Fishball Cart");
      expect(within(inspectorField(modal)).getByText("msantos")).toBeTruthy();

      fireEvent.change(statusSelect(modal), { target: { value: "good_standing" } });
      const payload = await submittedPayload(modal);
      expect(payload.inspector_name).toBe("msantos");
    } finally {
      restore();
    }
  });

  test("builds a name from first and last name when that is all there is", () => {
    const restore = withUser({
      username: "jsmith",
      first_name: "Jose",
      last_name: "Rizal",
    });

    try {
      const modal = openInspection("Fishball Cart");
      expect(within(inspectorField(modal)).getByText("Jose Rizal")).toBeTruthy();
    } finally {
      restore();
    }
  });

  test("never invents a person when the account has no name at all", () => {
    const restore = withUser({ username: "inspector_juan" });

    try {
      const modal = openInspection("Fishball Cart");
      expect(within(modal).queryByText(/Juan Dela Cruz/)).toBeNull();
      expect(within(modal).queryByText(/Maria Santos/)).toBeNull();
      expect(within(inspectorField(modal)).getByText("inspector_juan")).toBeTruthy();
    } finally {
      restore();
    }
  });

  test("makes no unverifiable claim about the inspector", () => {
    const modal = openInspection("Fishball Cart");

    expect(within(modal).queryByText(/Verified Inspector/)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Checklist starting state                                             */
/* ------------------------------------------------------------------ */

function checkboxes(modal) {
  return [...modal.querySelectorAll(".inspection-checklist-box input[type=checkbox]")];
}

describe("checklist starting state", () => {
  function withEstablishment(overrides) {
    const previous = mockCtx.establishments;
    mockCtx.establishments = [
      establishment(702, "Aqua Station", WATER_STATION, overrides),
    ];
    return () => {
      mockCtx.establishments = previous;
    };
  }

  test("a for_completion establishment starts with nothing ticked", () => {
    const restore = withEstablishment({ compliance_status: "for_completion" });

    try {
      const modal = openInspection("Aqua Station");
      const boxes = checkboxes(modal);

      expect(boxes).toHaveLength(2);
      expect(boxes.every((box) => box.checked)).toBe(false);
      expect(boxes.some((box) => box.checked)).toBe(false);
    } finally {
      restore();
    }
  });

  test("a good_standing establishment also starts with nothing ticked", () => {
    const restore = withEstablishment({ compliance_status: "good_standing" });

    try {
      const modal = openInspection("Aqua Station");
      expect(checkboxes(modal).some((box) => box.checked)).toBe(false);
    } finally {
      restore();
    }
  });

  test("a saved draft still restores its own ticks", () => {
    const restoreEstablishment = withEstablishment({
      compliance_status: "for_completion",
    });
    const previousInspections = mockCtx.inspections;
    mockCtx.inspections = [
      {
        establishment: 702,
        id: 558,
        is_draft: true,
        inspection_date: "2026-01-05",
        status_after_inspection: "for_completion",
        checklist_items: [
          { requirement_name: "Water Potability Certificate", is_complied: true, notes: "" },
          { requirement_name: "Health Certificate of Staff", is_complied: false, notes: "" },
        ],
      },
    ];

    try {
      const modal = openInspection("Aqua Station");
      expect(checkboxes(modal).map((box) => box.checked)).toEqual([true, false]);
    } finally {
      mockCtx.inspections = previousInspections;
      restoreEstablishment();
    }
  });

  test("the form's warning matches the rule it actually applies", () => {
    const modal = openInspection("Aqua Station");

    expect(within(modal).queryByText(/auto-set to/i)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Next due date rule                                                   */
/* ------------------------------------------------------------------ */

import { getSuggestedNextDueDate } from "./InspectionManagement";

describe("getSuggestedNextDueDate", () => {
  test("annual adds one year", () => {
    expect(getSuggestedNextDueDate("2026-03-15", "annual")).toBe("2027-03-15");
  });

  test("quarterly adds three months", () => {
    expect(getSuggestedNextDueDate("2026-03-15", "quarterly")).toBe("2026-06-15");
  });

  test("monthly adds one month", () => {
    expect(getSuggestedNextDueDate("2026-03-15", "monthly")).toBe("2026-04-15");
  });

  test("an unknown frequency suggests nothing", () => {
    expect(getSuggestedNextDueDate("2026-03-15", "fortnightly")).toBe("");
    expect(getSuggestedNextDueDate("2026-03-15", "")).toBe("");
    expect(getSuggestedNextDueDate("2026-03-15", undefined)).toBe("");
  });

  test("a month end rolls back to a real date", () => {
    expect(getSuggestedNextDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  test("no inspection date suggests nothing", () => {
    expect(getSuggestedNextDueDate("", "monthly")).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Pagination                                                           */
/* ------------------------------------------------------------------ */

const { exportCsv } = require("../../shared/csvExport");

function manyEstablishments(count) {
  return Array.from({ length: count }, (_, index) =>
    establishment(1000 + index, `Stall ${String(index + 1).padStart(2, "0")}`, AMBULANT)
  );
}

function withManyRows(count) {
  const previous = mockCtx.establishments;
  mockCtx.establishments = manyEstablishments(count);
  return () => {
    mockCtx.establishments = previous;
  };
}

function rowNames() {
  return [...document.querySelectorAll(".inspection-table-card tbody tr td:first-child strong")].map(
    (cell) => cell.textContent
  );
}

function pageLabel() {
  return document.querySelector(".inspection-pagination p").textContent;
}

function pageButtons() {
  return [...document.querySelectorAll(".inspection-pagination button")];
}

describe("pagination", () => {
  test("shows 10 rows per page and counts the pages", () => {
    const restore = withManyRows(25);

    try {
      render(<InspectionManagement />);

      expect(rowNames()).toHaveLength(10);
      expect(rowNames()[0]).toBe("Stall 01");
      expect(pageLabel()).toContain("Page 1 of 3");
    } finally {
      restore();
    }
  });

  test("next and previous move between pages", () => {
    const restore = withManyRows(25);

    try {
      render(<InspectionManagement />);
      const [previous, next] = pageButtons();

      expect(previous.disabled).toBe(true);

      fireEvent.click(next);
      expect(rowNames()[0]).toBe("Stall 11");
      expect(pageLabel()).toContain("Page 2 of 3");

      fireEvent.click(next);
      expect(rowNames()).toHaveLength(5);
      expect(pageLabel()).toContain("Page 3 of 3");
      expect(pageButtons()[1].disabled).toBe(true);

      fireEvent.click(pageButtons()[0]);
      expect(pageLabel()).toContain("Page 2 of 3");
    } finally {
      restore();
    }
  });

  test("changing the search resets to the first page", () => {
    const restore = withManyRows(25);

    try {
      render(<InspectionManagement />);
      fireEvent.click(pageButtons()[1]);
      expect(pageLabel()).toContain("Page 2 of 3");

      fireEvent.change(screen.getByPlaceholderText("Search records..."), {
        target: { value: "Stall" },
      });

      expect(pageLabel()).toContain("Page 1 of 3");
      expect(rowNames()[0]).toBe("Stall 01");
    } finally {
      restore();
    }
  });

  test("the CSV export covers every filtered row, not just the page", () => {
    const restore = withManyRows(25);

    try {
      render(<InspectionManagement />);
      fireEvent.click(screen.getByText("Export CSV"));

      expect(exportCsv).toHaveBeenCalledTimes(1);
      expect(exportCsv.mock.calls[0][2]).toHaveLength(25);
    } finally {
      restore();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Inspection history and read-only detail                              */
/* ------------------------------------------------------------------ */

const HISTORY = [
  {
    id: 801,
    establishment: 701,
    inspection_date: "2026-01-10",
    next_due_date: "2026-02-10",
    inspector_name: "Ana Reyes",
    status_after_inspection: "good_standing",
    status_after_inspection_label: "Good Standing",
    is_draft: false,
    findings: "All clear in January",
    remarks: "",
    checklist_items: [],
  },
  {
    id: 802,
    establishment: 701,
    inspection_date: "2026-03-04",
    next_due_date: "2026-04-04",
    inspector_name: "Ben Cruz",
    status_after_inspection: "violation",
    status_after_inspection_label: "Violation",
    is_draft: false,
    findings: "Pests observed",
    remarks: "Notice issued",
    checklist_items: [
      { requirement_name: "Pest Control", is_complied: false, notes: "Rodents" },
      { requirement_name: "Waste Disposal", is_complied: true, notes: "" },
    ],
  },
  {
    id: 803,
    establishment: 701,
    inspection_date: "2026-02-02",
    next_due_date: null,
    inspector_name: "Ana Reyes",
    status_after_inspection: "for_completion",
    status_after_inspection_label: "For Completion",
    is_draft: true,
    findings: "Half done",
    remarks: "",
    checklist_items: [],
  },
  {
    id: 804,
    establishment: 702,
    inspection_date: "2026-03-09",
    next_due_date: "2026-04-09",
    inspector_name: "Someone Else",
    status_after_inspection: "good_standing",
    status_after_inspection_label: "Good Standing",
    is_draft: false,
    findings: "Different establishment",
    remarks: "",
    checklist_items: [],
  },
];

function withHistory() {
  const previous = mockCtx.inspections;
  mockCtx.inspections = HISTORY;
  return () => {
    mockCtx.inspections = previous;
  };
}

function openHistory(businessName) {
  render(<InspectionManagement />);
  fireEvent.click(
    screen.getByLabelText(`View inspection history for ${businessName}`)
  );
  return document.querySelector(".inspection-history-modal");
}

function historyRows(modal) {
  return [...modal.querySelectorAll(".inspection-history-row")];
}

describe("inspection history", () => {
  test("lists only that establishment's inspections, newest first", () => {
    const restore = withHistory();

    try {
      const modal = openHistory("Fishball Cart");
      const dates = historyRows(modal).map(
        (row) => row.querySelector(".inspection-history-date").textContent
      );

      expect(historyRows(modal)).toHaveLength(3);
      expect(dates).toEqual(["2026-03-04", "2026-02-02", "2026-01-10"]);
      expect(within(modal).queryByText("Someone Else")).toBeNull();
    } finally {
      restore();
    }
  });

  test("labels drafts", () => {
    const restore = withHistory();

    try {
      const modal = openHistory("Fishball Cart");

      expect(within(modal).getAllByText("Draft")).toHaveLength(1);
    } finally {
      restore();
    }
  });

  test("shows the inspector, status and next due of each", () => {
    const restore = withHistory();

    try {
      const modal = openHistory("Fishball Cart");
      const latest = historyRows(modal)[0];

      expect(within(latest).getByText("Ben Cruz")).toBeTruthy();
      expect(within(latest).getByText("Violation")).toBeTruthy();
      expect(within(latest).getByText("2026-04-04")).toBeTruthy();
    } finally {
      restore();
    }
  });

  test("says so when there are no inspections yet", () => {
    const modal = openHistory("Fishball Cart");

    expect(within(modal).getByText("No inspections recorded yet.")).toBeTruthy();
  });
});

describe("read-only inspection detail", () => {
  function openDetail() {
    const modal = openHistory("Fishball Cart");
    fireEvent.click(historyRows(modal)[0]);
    return document.querySelector(".inspection-detail-modal");
  }

  test("shows the inspection's fields and checklist", () => {
    const restore = withHistory();

    try {
      const detail = openDetail();

      expect(within(detail).getByText("Pests observed")).toBeTruthy();
      expect(within(detail).getByText("Notice issued")).toBeTruthy();
      expect(within(detail).getByText("Pest Control")).toBeTruthy();
      expect(within(detail).getByText("Waste Disposal")).toBeTruthy();
      expect(within(detail).getByText("Rodents")).toBeTruthy();
    } finally {
      restore();
    }
  });

  test("marks each checklist item complied or not", () => {
    const restore = withHistory();

    try {
      const detail = openDetail();
      const states = [...detail.querySelectorAll(".inspection-detail-check")].map(
        (item) => item.textContent
      );

      expect(states.join(" ")).toContain("Not complied");
      expect(states.join(" ")).toContain("Complied");
    } finally {
      restore();
    }
  });

  test("offers no way to edit or save from the detail view", () => {
    const restore = withHistory();

    try {
      const detail = openDetail();

      expect(within(detail).queryByText("Submit Inspection")).toBeNull();
      expect(within(detail).queryByText("Save Draft")).toBeNull();
      expect(detail.querySelectorAll("input, textarea, select")).toHaveLength(0);
    } finally {
      restore();
    }
  });
});
