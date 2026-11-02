/**
 * Renewal requirements for business types with no configured requirements.
 *
 * A type such as Ambulant Food Vendor has no requirements until the Sanitation
 * Section provides them. Renewal must show an honest empty state for it and
 * never offer or save a generic list, while types that do have requirements
 * keep their existing behaviour (including the SP/Large matching).
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import PermitRenewal, { getEstablishmentRequirements } from "./PermitRenewal";

// The generic list the page used to substitute when a type had no requirements.
const OLD_GENERIC_FALLBACK = [
  "Xerox copy of DTI/SEC/CDA",
  "Barangay Clearance of owner",
  "Chest X-ray Results (Owner & employees)",
  "CTC/Cedula of owner and employees",
  "1x1 picture of owner and employees",
  "Potability of Water Supply - Physical/Chemical Examination",
  "Potability of Water Supply - Microbiological Examination",
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
    { id: 1, requirement_name: "Water Potability Certificate", permit_size: "sp" },
    { id: 2, requirement_name: "Health Certificate of Staff", permit_size: "sp" },
    { id: 3, requirement_name: "Large Coverage Only Item", permit_size: "large" },
  ],
};

const SP_ONLY_TYPE = {
  id: 9,
  name: "Public Market Stall",
  inspection_frequency: "monthly",
  requirements: [{ id: 4, requirement_name: "Stall Cleanliness Clearance", permit_size: "sp" }],
};

const AMBULANT_EST = {
  id: 701,
  business_name: "Fishball Cart",
  business_type: AMBULANT.id,
  business_type_name: AMBULANT.name,
  permit_size: "sp",
  permit_number: "",
};
const WATER_EST = {
  id: 702,
  business_name: "Aqua Station",
  business_type: WATER_STATION.id,
  business_type_name: WATER_STATION.name,
  permit_size: "sp",
  permit_number: "SP-2026-100",
};

const AMBULANT_ROW = {
  id: 9001,
  renewal_id: "REN-9001",
  establishment: AMBULANT_EST.id,
  establishment_name: AMBULANT_EST.business_name,
  owner_name: "Tomas Reyes",
  business_type_id: AMBULANT.id,
  business_type_name: AMBULANT.name,
  permit_size: "sp",
  permit_size_label: "SP",
  permit_number: "",
  barangay: "Daungan",
  expiration_date: "2099-12-31",
  stage: "application_filed",
  stage_label: "Application Filed",
  progress: 0,
  renewal_fee: 0,
  payment_status: "unpaid",
  payment_status_label: "Unpaid",
  submitted_requirements: [],
};

const mockCtx = {
  businessTypes: [AMBULANT, WATER_STATION, SP_ONLY_TYPE],
  establishments: [AMBULANT_EST, WATER_EST],
  renewalData: { rows: [AMBULANT_ROW], summary: {}, stageCounts: [], barangays: [] },
  loading: false,
  error: "",
  refreshRenewalData: jest.fn(() => Promise.resolve()),
  createRenewal: jest.fn(() => Promise.resolve({})),
  updateRenewal: jest.fn(() => Promise.resolve({})),
};

jest.mock("../context/SanitationDataContext", () => ({
  useSanitationData: () => mockCtx,
}));

beforeEach(() => {
  mockCtx.renewalData = { rows: [AMBULANT_ROW], summary: {}, stageCounts: [], barangays: [] };
  mockCtx.loading = false;
  mockCtx.error = "";
  mockCtx.refreshRenewalData.mockReset().mockResolvedValue(undefined);
  mockCtx.createRenewal.mockReset().mockResolvedValue({});
  mockCtx.updateRenewal.mockReset().mockResolvedValue({});
});

describe("payment-neutral renewal workflow", () => {
  const history = "Keep original note\n[Payment Confirmed: Method: Cash, OR#: LEGACY-42 on 2025-01-03]";
  const legacy = { ...AMBULANT_ROW, stage: "payment_pending", stage_label: "Payment Pending", progress: 71, remarks: history };
  function openDetail(row = legacy) {
    mockCtx.renewalData = { rows: [row], summary: {}, barangays: [], stageCounts: [{ stage: row.stage, label: row.stage_label, count: 1 }] };
    render(<PermitRenewal />);
    fireEvent.click(screen.getByTitle("View Full Details"));
    return document.querySelector(".renewal-detail-modal");
  }
  function expectNoPaymentPayload(payload) {
    ["renewal_fee", "payment_status", "payment_method", "or_number"].forEach(key => expect(payload).not.toHaveProperty(key));
    expect(["mark_paid", "mark_unpaid"]).not.toContain(payload.action);
  }

  test("removes fee/payment columns, filter, inputs and mutation controls", () => {
    const detail = openDetail();
    expect(screen.queryByRole("columnheader", { name: /^(Fee|Payment)$/ })).toBeNull();
    expect(screen.queryByText("All payment status")).toBeNull();
    expect(within(detail).queryByText(/Renewal Fee|Payment Method|Official Receipt|Confirm Payment|Revert to Unpaid/)).toBeNull();
    expect(detail.querySelector(".renewal-payment-card")).toBeNull();
    expect(screen.queryByText(/process payments/i)).toBeNull();
    expect(mockCtx.updateRenewal).not.toHaveBeenCalled();
  });

  test("new applications omit every payment field and retain selected requirements and remarks", async () => {
    const form = openNewRenewal();
    selectEstablishment(form, WATER_EST.id);
    expect(within(form).queryByLabelText(/fee|payment|receipt/i)).toBeNull();
    fireEvent.click(within(checklist(form)).getByText("Water Potability Certificate"));
    fireEvent.change(within(form).getByLabelText("Remarks"), { target: { value: history } });
    fireEvent.submit(form);
    await waitFor(() => expect(mockCtx.createRenewal).toHaveBeenCalledTimes(1));
    const payload = mockCtx.createRenewal.mock.calls[0][0];
    expectNoPaymentPayload(payload);
    expect(payload).toMatchObject({ establishment: WATER_EST.id, stage: "application_filed", permit_number: WATER_EST.permit_number, submitted_requirements: ["Water Potability Certificate"], remarks: history });
  });

  test("failed filing preserves input and can be retried without payment fields", async () => {
    mockCtx.createRenewal.mockRejectedValueOnce(new Error("Synthetic filing failed")).mockResolvedValueOnce({});
    const form = openNewRenewal();
    selectEstablishment(form, WATER_EST.id);
    fireEvent.change(within(form).getByLabelText("Remarks"), { target: { value: history } });
    fireEvent.submit(form);
    await screen.findByText("Synthetic filing failed");
    expect(within(form).getByLabelText("Remarks").value).toBe(history);
    expect(within(form).getByLabelText("Establishment").value).toBe(String(WATER_EST.id));
    fireEvent.submit(form);
    await waitFor(() => expect(mockCtx.createRenewal).toHaveBeenCalledTimes(2));
    mockCtx.createRenewal.mock.calls.forEach(([payload]) => expectNoPaymentPayload(payload));
    await waitFor(() => expect(document.querySelector(".renewal-form-modal")).toBeNull());
  });

  test("keeps the actual legacy stage, counts and original receipt-bearing remarks without mutation", () => {
    const detail = openDetail();
    expect(within(detail).getByRole("note").textContent).toMatch(/Recorded stage: Payment Pending.*No payment entry or confirmation is required here/s);
    expect(document.querySelector(".renewal-stage-pill.payment_pending").textContent).toBe("Payment Pending (legacy workflow)");
    expect(document.querySelector(".renewal-stage-tile strong").textContent).toBe("1");
    expect(within(detail).getByLabelText("Remarks & Audit Log").value).toBe(history);
    expect(mockCtx.updateRenewal).not.toHaveBeenCalled();
  });

  test("legacy advancement requests exactly one server transition and uses the returned stage", async () => {
    mockCtx.updateRenewal.mockResolvedValueOnce({ ...legacy, stage: "approved", stage_label: "Approved", progress: 86 });
    const detail = openDetail();
    fireEvent.click(within(detail).getByRole("button", { name: "Proceed to: Approved" }));
    await waitFor(() => expect(mockCtx.refreshRenewalData).toHaveBeenCalledTimes(1));
    expect(mockCtx.updateRenewal).toHaveBeenCalledTimes(1);
    expect(mockCtx.updateRenewal).toHaveBeenCalledWith(legacy.id, { action: "advance_stage" });
    expect(within(detail).queryByRole("note")).toBeNull();
    expect(within(detail).getByLabelText("Remarks & Audit Log").value).toBe(history);
    expect(mockCtx.refreshRenewalData.mock.calls[0][0]).not.toHaveProperty("payment_status");
  });

  test("inspection advancement does not skip or silently approve the legacy intermediate stage", async () => {
    mockCtx.updateRenewal.mockResolvedValueOnce(legacy);
    const detail = openDetail({ ...legacy, stage: "inspection_scheduled", stage_label: "Inspection Scheduled", progress: 57 });
    fireEvent.click(within(detail).getByRole("button", { name: "Advance to next recorded stage" }));
    await within(detail).findByRole("note");
    expect(mockCtx.updateRenewal).toHaveBeenCalledTimes(1);
    expect(mockCtx.updateRenewal).toHaveBeenCalledWith(legacy.id, { action: "advance_stage" });
  });

  test.each(["unpaid", "partial", "paid", undefined])("release remains available with %s payment metadata", async payment_status => {
    const row = { ...legacy, payment_status };
    mockCtx.updateRenewal.mockResolvedValueOnce({ ...row, stage: "released", stage_label: "Released", released_at: "2026-11-02" });
    const detail = openDetail(row);
    fireEvent.click(within(detail).getByRole("button", { name: "Mark as Released" }));
    await waitFor(() => expect(mockCtx.refreshRenewalData).toHaveBeenCalledTimes(1));
    expect(mockCtx.updateRenewal).toHaveBeenCalledTimes(1);
    expect(mockCtx.updateRenewal).toHaveBeenCalledWith(row.id, { action: "mark_released" });
    expect(within(detail).queryByRole("button", { name: "Mark as Released" })).toBeNull();
    expect(within(detail).getByLabelText("Remarks & Audit Log").value).toBe(history);
  });

  test.each([["Proceed to: Approved", "advance_stage"], ["Mark as Released", "mark_released"]])("failed %s preserves legacy state and supports an explicit retry", async (label, action) => {
    mockCtx.updateRenewal.mockRejectedValueOnce(new Error("Synthetic action failed")).mockResolvedValueOnce(legacy);
    const detail = openDetail();
    fireEvent.click(within(detail).getByRole("button", { name: label }));
    expect((await within(detail).findByRole("alert")).textContent).toContain("Synthetic action failed");
    expect(within(detail).getByRole("note")).toBeTruthy();
    expect(within(detail).getByLabelText("Remarks & Audit Log").value).toBe(history);
    fireEvent.click(within(detail).getByRole("button", { name: label }));
    await waitFor(() => expect(mockCtx.updateRenewal).toHaveBeenCalledTimes(2));
    expect(mockCtx.updateRenewal.mock.calls.map(([id, payload]) => [id, payload])).toEqual([[legacy.id, { action }], [legacy.id, { action }]]);
    await waitFor(() => expect(within(detail).queryByRole("alert")).toBeNull());
  });

  test("records without payment metadata render with no fabricated payment status", () => {
    const { payment_status, payment_status_label, renewal_fee, ...row } = legacy;
    const detail = openDetail(row);
    expect(within(detail).getByRole("note")).toBeTruthy();
    expect(screen.queryByText(/Unpaid|Partial|✅ Paid|Awaiting payment settlement/)).toBeNull();
    expect(within(detail).getByLabelText("Remarks & Audit Log").value).toBe(history);
  });

  test("empty table spans only the remaining ten columns", () => {
    mockCtx.renewalData.rows = [];
    render(<PermitRenewal />);
    expect(screen.getByText("No renewal records found.").colSpan).toBe(10);
  });

  test("retains pending state until the single stage request finishes", async () => {
    let finish;
    mockCtx.updateRenewal.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const detail = openDetail();
    fireEvent.click(within(detail).getByRole("button", { name: "Proceed to: Approved" }));
    expect(within(detail).getByRole("button", { name: "Advancing..." }).disabled).toBe(true);
    expect(within(detail).getByRole("button", { name: "Mark as Released" }).disabled).toBe(true);
    expect(mockCtx.updateRenewal).toHaveBeenCalledTimes(1);
    finish({ ...legacy, stage: "approved", stage_label: "Approved" });
    await waitFor(() => expect(within(detail).getByRole("button", { name: "Proceed to: Released" }).disabled).toBe(false));
  });

  test("still validates the establishment before filing", async () => {
    const form = openNewRenewal();
    fireEvent.submit(form);
    await screen.findByText("Please select an establishment.");
    expect(mockCtx.createRenewal).not.toHaveBeenCalled();
  });
});
afterEach(cleanup);

/* ------------------------------------------------------------------ */
/* getEstablishmentRequirements                                         */
/* ------------------------------------------------------------------ */

describe("getEstablishmentRequirements", () => {
  const types = [AMBULANT, WATER_STATION, SP_ONLY_TYPE];

  test("returns no requirements for a type with none configured", () => {
    expect(getEstablishmentRequirements(AMBULANT_EST.id, [AMBULANT_EST], types)).toEqual([]);
    expect(
      getEstablishmentRequirements(
        { ...AMBULANT_EST, id: 1, permit_size: "large" },
        [],
        types
      )
    ).toEqual([]);
  });

  test("returns no requirements when no establishment is selected", () => {
    expect(getEstablishmentRequirements("", [AMBULANT_EST, WATER_EST], types)).toEqual([]);
  });

  test("returns a renewal row's configured requirements for its coverage (unchanged)", () => {
    expect(getEstablishmentRequirements(WATER_EST.id, [WATER_EST], types)).toEqual([
      "Water Potability Certificate",
      "Health Certificate of Staff",
    ]);
    expect(
      getEstablishmentRequirements(
        { establishment: 0, business_type_id: WATER_STATION.id, permit_size: "large" },
        [],
        types
      )
    ).toEqual(["Large Coverage Only Item"]);
  });

  test("still falls back to the type's own configured requirements across SP/Large (unchanged)", () => {
    expect(
      getEstablishmentRequirements(
        { establishment: 0, business_type_id: SP_ONLY_TYPE.id, permit_size: "large" },
        [],
        types
      )
    ).toEqual(["Stall Cleanliness Clearance"]);
  });
});

/* ------------------------------------------------------------------ */
/* New Renewal form                                                     */
/* ------------------------------------------------------------------ */

function openNewRenewal() {
  render(<PermitRenewal />);
  fireEvent.click(screen.getByText("New Renewal"));
  return document.querySelector("form.renewal-form-modal");
}

function selectEstablishment(form, id) {
  const select = within(form).getByText("Establishment").closest("label").querySelector("select");
  fireEvent.change(select, { target: { value: String(id) } });
}

function checklist(form) {
  return form.querySelector(".renewal-checklist");
}

describe("New Renewal form", () => {
  test("asks for an establishment before one is chosen, without a generic list", () => {
    const form = openNewRenewal();

    expect(within(checklist(form)).getByText("Select an establishment to load requirements.")).toBeTruthy();
    expect(checklist(form).querySelectorAll("input[type=checkbox]")).toHaveLength(0);
  });

  test("shows an empty state for a type with no configured requirements", () => {
    const form = openNewRenewal();
    selectEstablishment(form, AMBULANT_EST.id);

    expect(within(checklist(form)).getByText("No requirements configured yet.")).toBeTruthy();
    expect(checklist(form).querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    OLD_GENERIC_FALLBACK.forEach((name) =>
      expect(within(form).queryByText(name)).toBeNull()
    );
  });

  test("files the renewal with no fabricated submitted requirements", async () => {
    const form = openNewRenewal();
    selectEstablishment(form, AMBULANT_EST.id);
    fireEvent.submit(form);

    await waitFor(() => expect(mockCtx.createRenewal).toHaveBeenCalledTimes(1));
    expect(mockCtx.createRenewal.mock.calls[0][0].submitted_requirements).toEqual([]);
  });

  test("a type with configured requirements lists and saves them as before", async () => {
    const form = openNewRenewal();
    selectEstablishment(form, WATER_EST.id);

    const labels = [...checklist(form).querySelectorAll("label")].map((label) => label.textContent);
    expect(labels).toEqual(["Water Potability Certificate", "Health Certificate of Staff"]);

    fireEvent.click(within(checklist(form)).getByText("Water Potability Certificate"));
    fireEvent.submit(form);

    await waitFor(() => expect(mockCtx.createRenewal).toHaveBeenCalledTimes(1));
    expect(mockCtx.createRenewal.mock.calls[0][0].submitted_requirements).toEqual([
      "Water Potability Certificate",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Renewal detail                                                        */
/* ------------------------------------------------------------------ */

describe("Renewal detail", () => {
  test("shows an empty state and no toggleable generic items for a type with none configured", () => {
    render(<PermitRenewal />);
    fireEvent.click(screen.getByTitle("View Full Details"));
    const detail = document.querySelector(".renewal-detail-modal");

    expect(within(detail).getByText("No requirements configured yet.")).toBeTruthy();
    expect(detail.querySelectorAll(".renewal-req-item")).toHaveLength(0);
    OLD_GENERIC_FALLBACK.forEach((name) =>
      expect(within(detail).queryByText(name)).toBeNull()
    );
    expect(mockCtx.updateRenewal).not.toHaveBeenCalled();
  });
});
