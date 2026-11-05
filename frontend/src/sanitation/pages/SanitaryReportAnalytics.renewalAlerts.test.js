import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SanitaryReportAnalytics from "./SanitaryReportAnalytics";
import { useSanitationData } from "../context/SanitationDataContext";
import * as api from "../services/sanitationApi";
import fixture from "./establishmentReport.fixture.json";

jest.mock("../context/SanitationDataContext");
jest.mock("../services/sanitationApi");
jest.mock("react-chartjs-2", () => ({ Bar: () => null, Doughnut: () => null }));

beforeEach(() => {
  jest.resetAllMocks();
  api.fetchSanitationEstablishments.mockResolvedValue(fixture.establishments);
  api.fetchSanitationInspections.mockResolvedValue(fixture.inspections);
  api.fetchSanitationRenewals.mockResolvedValue({ rows: [{ ...fixture.renewals.rows[0], stage: "payment_pending", stage_label: "Payment Pending (legacy recorded stage)" }] });
  window.print = jest.fn();
  URL.createObjectURL = jest.fn(() => "blob:synthetic-report");
  URL.revokeObjectURL = jest.fn();
});

test.each([true, false])("aggregate payment alert is absent with paymentPending property present=%s, while recorded stages remain factual", async (includePayment) => {
  const renewalAlerts = {
    expiringSoon: [{ id: 401, establishment_name: "EXPIRING PERMIT SENTINEL", stage_label: "Application Filed", expiration_date: "2026-12-01" }],
    expired: [{ id: 402, establishment_name: "EXPIRED PERMIT SENTINEL", stage_label: "Inspection Scheduled", expiration_date: "2025-12-01" }],
  };
  if (includePayment) renewalAlerts.paymentPending = [{ id: 403, establishment_name: "PAYMENT ONLY OPERATIONAL SENTINEL", stage_label: "Payment Pending", expiration_date: "2026-12-01" }];
  useSanitationData.mockReturnValue({
    establishments: [], businessTypes: [], barangays: [], loading: false, error: "",
    reportData: { summary: { totalEstablishments: 3 }, byType: [{ name: "CSV PERMIT SENTINEL", total: 3, withPermit: 2, withoutPermit: 1 }], questionAnswers: [], renewalAlerts },
  });
  render(<SanitaryReportAnalytics />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Reload report data" })).toBeEnabled());
  const alerts = screen.getByRole("heading", { name: "Renewal Alerts" }).closest("section");
  expect(within(alerts).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Expiring Soon", "Expired"]);
  expect(alerts).toHaveTextContent("EXPIRING PERMIT SENTINEL");
  expect(alerts).toHaveTextContent("EXPIRED PERMIT SENTINEL");
  expect(alerts).not.toHaveTextContent(/Payment Pending|PAYMENT ONLY OPERATIONAL SENTINEL/);

  const download = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(document.querySelector(".report-export-btn"));
  const csv = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(URL.createObjectURL.mock.calls[0][0]);
  });
  expect(csv).toContain("CSV PERMIT SENTINEL");
  expect(csv).not.toMatch(/Payment|PAYMENT ONLY OPERATIONAL SENTINEL|renewal_fee/);
  expect(download).toHaveBeenCalledTimes(1);
  download.mockRestore();

  fireEvent.click(document.querySelector(".report-print-btn"));
  expect(window.print).toHaveBeenCalledTimes(1);
  expect(alerts).not.toHaveTextContent("PAYMENT ONLY OPERATIONAL SENTINEL");
  // The individual report must retain actual legacy stages, including in its print snapshot.
  fireEvent.change(screen.getByLabelText("Select establishment"), { target: { value: "1" } });
  expect(document.querySelector(".ehr-body")).toHaveTextContent("Payment Pending (legacy recorded stage)");
  fireEvent.click(screen.getByRole("button", { name: "Print selected establishment" }));
  const print = document.querySelector("body > .establishment-history-print");
  expect(print).toHaveTextContent("Payment Pending (legacy recorded stage)");
  expect(print).not.toHaveTextContent(/PAYMENT ONLY OPERATIONAL SENTINEL|EXPIRING PERMIT SENTINEL|EXPIRED PERMIT SENTINEL/);
  fireEvent(window, new Event("afterprint"));
});
