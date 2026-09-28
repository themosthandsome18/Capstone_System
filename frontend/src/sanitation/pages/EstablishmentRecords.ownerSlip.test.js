/**
 * Owner's Slip: staff issue an establishment's private tracking code and
 * print it. The code goes straight into the print window and is not kept.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ search: "" }), useNavigate: () => jest.fn() }),
  { virtual: true }
);
jest.mock("../../shared/LocationPicker", () => () => null);
jest.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));
jest.mock("../../shared/csvExport", () => ({
  datedCsvFilename: (name) => `${name}.csv`,
  exportCsv: jest.fn(),
}));

const mockAuth = { role: "sanitation" };
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => mockAuth }));

jest.mock("../services/sanitationApi", () => ({ issueOwnerTrackingCode: jest.fn() }));

import EstablishmentRecords from "./EstablishmentRecords";
import { issueOwnerTrackingCode } from "../services/sanitationApi";
import { buildOwnerSlipHtml, ownerSlipStatusText } from "../utils/ownerSlip";

const BASE = {
  id: 701,
  business_name: "Aling Nena Carinderia",
  owner_name: "Nena Santos",
  business_type: 11,
  business_type_name: "Restaurant / Food Establishment",
  permit_size: "sp",
  permit_size_label: "SP",
  barangay: "Daungan",
  address: "Purok 1",
  contact_number: "09171234567",
  has_permit: true,
  permit_number: "SP-2026-0101",
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
  tracking_code_issued_at: null,
  tracking_code_issued_by_name: "",
};

const ISSUED = {
  ...BASE,
  id: 702,
  business_name: "Mang Ben Bakery",
  permit_number: "SP-2026-0202",
  tracking_code_issued_at: "2026-09-20T01:30:00+00:00",
  tracking_code_issued_by_name: "Maria Santos",
};

const SLIP = {
  tracking_code: "MBN-7KQ4-XP2M",
  issued_at: "2026-09-27T17:11:43+08:00",
  issued_by: "Maria Santos",
  establishment: {
    id: 701,
    business_name: "Aling Nena Carinderia",
    permit_number: "SP-2026-0101",
    business_type_name: "Restaurant / Food Establishment",
    barangay: "Daungan",
  },
};

const mockCtx = {
  establishments: [BASE, ISSUED],
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

let written;
let printWindow;

function fakeWindow() {
  written = [];
  printWindow = {
    closed: false,
    document: {
      open: jest.fn(() => {
        written = [];
      }),
      write: jest.fn((html) => written.push(html)),
      close: jest.fn(),
    },
    close: jest.fn(function close() {
      this.closed = true;
    }),
    focus: jest.fn(),
    print: jest.fn(),
  };
  return printWindow;
}

function rowFor(id) {
  return [...document.querySelectorAll(".establishment-table-wrap tbody tr")].find(
    (row) => row.querySelector("td").textContent === String(id)
  );
}

function openView(id) {
  render(<EstablishmentRecords />);
  fireEvent.click(within(rowFor(id)).getByTitle("View establishment"));
  return document.querySelector(".establishment-detail-modal");
}

beforeEach(() => {
  mockAuth.role = "sanitation";
  issueOwnerTrackingCode.mockReset();
  mockCtx.refreshEstablishments.mockReset();
  mockCtx.refreshEstablishments.mockResolvedValue([
    { ...BASE, tracking_code_issued_at: SLIP.issued_at, tracking_code_issued_by_name: "Maria Santos" },
    ISSUED,
  ]);
  jest.spyOn(window, "open").mockImplementation(() => fakeWindow());
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe("Print Owner's Slip", () => {
  test("issues a code and writes the slip into a window opened on the click", async () => {
    issueOwnerTrackingCode.mockResolvedValue(SLIP);
    const modal = openView(701);

    fireEvent.click(within(modal).getByRole("button", { name: /Print Owner's Slip/ }));

    // Opened synchronously, before the answer, with a placeholder.
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(written.join("")).toContain("Generating the Owner's Slip…");
    expect(issueOwnerTrackingCode).toHaveBeenCalledWith(701);

    await waitFor(() => expect(written.join("")).toContain("MBN-7KQ4-XP2M"));
    const html = written.join("");
    expect(html).toContain("SP-2026-0101");
    expect(html).toContain("This code is PRIVATE. Do not post it. It is different from the permit number.");
    expect(html).toContain("Mauban Municipal Health Office – Sanitary Section");
    expect(html).toContain("OWNER'S SLIP");
    expect(html).toContain("Open the Mauban Sanitary app → Establishment Portal → enter the code.");
    expect(html).toContain("Date issued");
    expect(html).toContain("Issued by");
    expect(html).toContain("Lost this slip? Visit the Sanitary Office for a new code.");
    expect(html).toContain("Maria Santos");
    expect(printWindow.close).not.toHaveBeenCalled();
  });

  test("the record shows the new slip after printing, and the code is not kept on the page", async () => {
    issueOwnerTrackingCode.mockResolvedValue(SLIP);
    const modal = openView(701);
    expect(within(modal).getByText("No Owner's Slip yet")).toBeTruthy();

    fireEvent.click(within(modal).getByRole("button", { name: /Print Owner's Slip/ }));

    await waitFor(() => expect(mockCtx.refreshEstablishments).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText("Owner's Slip issued on September 27, 2026 by Maria Santos")
      ).toBeTruthy()
    );
    expect(document.body.innerHTML).not.toContain("MBN-7KQ4-XP2M");
    expect(JSON.stringify(window.localStorage)).not.toContain("MBN-7KQ4-XP2M");
  });

  test("an existing slip asks first, and Cancel makes no call", () => {
    const modal = openView(702);

    fireEvent.click(within(modal).getByRole("button", { name: /Print Owner's Slip/ }));

    const confirm = screen.getByRole("alertdialog");
    expect(confirm.textContent).toContain(
      "A new code will be issued. The old slip issued on September 20, 2026 by Maria Santos will stop working."
    );
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(issueOwnerTrackingCode).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  test("confirming the replacement issues a new code", async () => {
    issueOwnerTrackingCode.mockResolvedValue({ ...SLIP, establishment: { ...SLIP.establishment, id: 702 } });
    const modal = openView(702);

    fireEvent.click(within(modal).getByRole("button", { name: /Print Owner's Slip/ }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /Issue new code/ })
    );

    expect(window.open).toHaveBeenCalledTimes(1);
    expect(issueOwnerTrackingCode).toHaveBeenCalledWith(702);
    await waitFor(() => expect(written.join("")).toContain("MBN-7KQ4-XP2M"));
  });

  test("a failure closes the window and shows the server's message", async () => {
    const error = new Error("Sanitation API request failed.");
    error.status = 503;
    error.details = {
      detail:
        "Tracking codes are not configured on the server (TRACKING_CODE_KEY is not set).",
    };
    issueOwnerTrackingCode.mockRejectedValue(error);
    const modal = openView(701);

    fireEvent.click(within(modal).getByRole("button", { name: /Print Owner's Slip/ }));

    await waitFor(() => expect(printWindow.close).toHaveBeenCalled());
    expect(screen.getByRole("alert").textContent).toContain(
      "Tracking codes are not configured on the server"
    );
    expect(written.join("")).not.toContain("OWNER'S SLIP");
  });

  test("a blocked pop-up shows a message and makes no call", () => {
    window.open.mockImplementation(() => null);
    const modal = openView(701);

    fireEvent.click(within(modal).getByRole("button", { name: /Print Owner's Slip/ }));

    expect(issueOwnerTrackingCode).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/pop-up/i);
  });

  test("the table row has the same action", async () => {
    issueOwnerTrackingCode.mockResolvedValue(SLIP);
    render(<EstablishmentRecords />);

    fireEvent.click(within(rowFor(701)).getByTitle("Print Owner's Slip"));

    expect(issueOwnerTrackingCode).toHaveBeenCalledWith(701);
    await waitFor(() => expect(written.join("")).toContain("MBN-7KQ4-XP2M"));
  });

  test("only admin and sanitation staff see the action", () => {
    for (const role of ["tourism", "establishment", "tourist", ""]) {
      mockAuth.role = role;
      const modal = openView(701);
      expect(within(modal).queryByRole("button", { name: /Print Owner's Slip/ })).toBeNull();
      expect(within(rowFor(701)).queryByTitle("Print Owner's Slip")).toBeNull();
      cleanup();
    }
    mockAuth.role = "admin";
    const modal = openView(701);
    expect(within(modal).getByRole("button", { name: /Print Owner's Slip/ })).toBeTruthy();
  });
});

describe("Owner's Slip text", () => {
  test("every field is escaped", () => {
    const html = buildOwnerSlipHtml({
      tracking_code: "MBN-<b>-&",
      issued_at: SLIP.issued_at,
      issued_by: "<script>alert(1)</script>",
      establishment: {
        business_name: `Nena's "Best" <img src=x onerror=alert(1)>`,
        permit_number: "<i>SP</i>",
        business_type_name: "Food & <Drinks>",
        barangay: "<Daungan>",
      },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<i>SP</i>");
    expect(html).not.toContain("<Daungan>");
    expect(html).toContain("Nena&#39;s &quot;Best&quot; &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("Food &amp; &lt;Drinks&gt;");
    expect(html).toContain("MBN-&lt;b&gt;-&amp;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("no permit number says so", () => {
    const html = buildOwnerSlipHtml({ ...SLIP, establishment: { ...SLIP.establishment, permit_number: "" } });
    expect(html).toContain("No permit number yet");
  });

  test("the date issued is the Manila date", () => {
    // 2026-09-27 17:00 UTC is already September 28 in Manila.
    const html = buildOwnerSlipHtml({ ...SLIP, issued_at: "2026-09-27T17:00:00Z" });
    expect(html).toContain("September 28, 2026");
  });

  test("the record's slip status in both states", () => {
    expect(ownerSlipStatusText(BASE)).toBe("No Owner's Slip yet");
    expect(ownerSlipStatusText(ISSUED)).toBe(
      "Owner's Slip issued on September 20, 2026 by Maria Santos"
    );
  });

  test("nothing tells owners to create or use an account any more", () => {
    // A record still linked to an old establishment account (the link stays in the database).
    mockCtx.establishments = [{ ...ISSUED, account_username: "old_owner" }, BASE];
    try {
      render(<EstablishmentRecords />);
      expect(within(rowFor(702)).queryByText(/old_owner/)).toBeNull();
      fireEvent.click(within(rowFor(702)).getByTitle("View establishment"));
      const modal = document.querySelector(".establishment-detail-modal");
      for (const text of [
        /Mobile Establishment Portal/,
        /register an account/i,
        /Account Linked/,
        /Mobile Portal Ready/,
        /Owner account active/,
        /old_owner/,
      ]) {
        expect(within(modal).queryByText(text)).toBeNull();
      }
    } finally {
      mockCtx.establishments = [BASE, ISSUED];
    }
  });

  test("the tile on the record shows the slip status instead of the old account link", () => {
    const modal = openView(702);
    expect(
      within(modal).getByText("Owner's Slip issued on September 20, 2026 by Maria Santos")
    ).toBeTruthy();
    expect(within(modal).queryByText(/Mobile Portal Account/)).toBeNull();
    expect(within(modal).queryByText(/Not Linked/)).toBeNull();
  });
});
