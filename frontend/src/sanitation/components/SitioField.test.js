import "@testing-library/jest-dom";
import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SitioField, { applySitioPayload, useRecordSession } from "./SitioField";
import { apiRequest, getStoredAuthToken } from "../../shared/apiClient";
jest.mock("../../shared/apiClient", () => ({ apiRequest: jest.fn(), getStoredAuthToken: jest.fn() }));
const barangays = [{ id: 1, name: "Daungan" }, { id: 2, name: "Polo" }];
const response = id => ({ barangay_id: id, rows: [{ id: id * 10, name: `SYNTHETIC ${id}`, barangay_id: id, is_active: true }] });
let token;
function Form({ initial = {}, references = barangays }) {
  const [form, setForm] = useState({ barangay: "Daungan", sitio: "", ...initial });
  const [open, setOpen] = useState(true);
  const current = useRecordSession(open, () => { setForm({}); setOpen(false); });
  return open ? <><button onClick={() => setForm({ barangay: "Polo", sitio: "", sitio_reference: null,
    _sitioChanged: true, _sitioValid: true, _sitioBarangay: "Polo" })}>Change Barangay</button>
    <SitioField form={form} barangays={references} onChange={(_, value) => setForm(old => ({ ...old, ...value }))} />
    <output data-testid="payload">{JSON.stringify(applySitioPayload({}, form))}</output>
    <button onClick={() => { if (!current()) setOpen(false); }}>Check session</button></> : <p>Session expired</p>;
}
beforeEach(() => { token = "synthetic-A"; getStoredAuthToken.mockImplementation(() => token); apiRequest.mockReset(); });
test("configured selection writes correct pair and changing Barangay clears it", async () => {
  apiRequest.mockImplementation(path => Promise.resolve(response(path.endsWith("=1") ? 1 : 2)));
  render(<Form />);
  await screen.findByRole("option", { name: "SYNTHETIC 1" });
  fireEvent.change(screen.getByLabelText("Sitio"), { target: { value: "10" } });
  expect(screen.getByTestId("payload")).toHaveTextContent('"sitio_reference":10');
  fireEvent.click(screen.getByText("Change Barangay"));
  await screen.findByRole("option", { name: "SYNTHETIC 2" });
  expect(screen.queryByRole("option", { name: "SYNTHETIC 1" })).not.toBeInTheDocument();
  expect(screen.getByTestId("payload")).toHaveTextContent('"sitio_reference":null');
});
test("late responses cannot restore previous Barangay choices", async () => {
  let finish;
  apiRequest.mockImplementation(path => path.endsWith("=1") ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(2)));
  render(<Form />); fireEvent.click(screen.getByText("Change Barangay"));
  await screen.findByRole("option", { name: "SYNTHETIC 2" });
  await act(async () => finish(response(1)));
  expect(screen.queryByRole("option", { name: "SYNTHETIC 1" })).not.toBeInTheDocument();
});
test("legacy hydration stays untouched and manual entry/clearing are explicit", async () => {
  apiRequest.mockResolvedValue({ barangay_id: 1, rows: [] });
  render(<Form initial={{ sitio: " Exact LEGACY " }} />);
  expect(screen.getByTestId("payload")).toHaveTextContent("{}");
  await screen.findByText("No Sitios configured for this Barangay");
  fireEvent.change(screen.getByLabelText("Sitio"), { target: { value: "manual" } });
  fireEvent.change(screen.getByLabelText("Manual Sitio"), { target: { value: "Manual choice" } });
  expect(screen.getByTestId("payload")).toHaveTextContent('"sitio":"Manual choice"');
  fireEvent.change(screen.getByLabelText("Sitio"), { target: { value: "" } });
  expect(screen.getByTestId("payload")).toHaveTextContent('"sitio":""');
});
test("loading errors support retry and malformed membership fails closed", async () => {
  apiRequest.mockRejectedValueOnce(new Error("Synthetic outage")).mockResolvedValueOnce(response(2)).mockResolvedValueOnce(response(1));
  render(<Form />);
  await screen.findByText("Synthetic outage"); fireEvent.click(screen.getByText("Retry Sitios"));
  await screen.findByText("The Sitio choices do not match this Barangay.");
  fireEvent.click(screen.getByText("Retry Sitios"));
  await screen.findByRole("option", { name: "SYNTHETIC 1" });
});
test.each([null, "synthetic-B"])("session transition %s hides old form and ignores late response", async replacement => {
  let finish; apiRequest.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Form initial={{ sitio: "PRIVATE LEGACY" }} />);
  act(() => { token = replacement; window.dispatchEvent(new Event("capstone-auth-changed")); });
  expect(screen.getByText("Session expired")).toBeInTheDocument();
  await act(async () => finish(response(1)));
  expect(screen.queryByText(/PRIVATE LEGACY/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Sitio")).not.toBeInTheDocument();
});
test("payload rejects invalid or mismatched configured references", () => {
  expect(() => applySitioPayload({}, { barangay: "Polo", sitio_reference: 10, _sitioChanged: true,
    _sitioBarangay: "Daungan", _sitioValid: true })).toThrow(/Choose a Sitio/);
});

test("request checkpoints cannot affect a reopened session even after A to B to A", () => {
  let requestCurrent;
  function Session() {
    const [active, setActive] = useState(true);
    const current = useRecordSession(active, () => setActive(false));
    return <><button onClick={() => { requestCurrent = current.checkpoint(); }}>Capture request</button>
      <button onClick={() => setActive(true)}>Reopen</button></>;
  }
  render(<Session />);
  fireEvent.click(screen.getByText("Capture request"));
  expect(requestCurrent()).toBe(true);
  act(() => { token = "synthetic-B"; window.dispatchEvent(new Event("capstone-auth-changed")); });
  act(() => { token = "synthetic-A"; window.dispatchEvent(new Event("capstone-auth-changed")); });
  fireEvent.click(screen.getByText("Reopen"));
  expect(requestCurrent()).toBe(false);
});

test("label-only choices resolve the canonical API ID rather than their array index", async () => {
  apiRequest.mockImplementation(path => Promise.resolve(path === "/households/barangays/"
    ? [{ id: 91, name: "Daungan" }] : response(91)));
  render(<Form references={["Daungan"]} />);
  await screen.findByRole("option", { name: "SYNTHETIC 91" });
  expect(apiRequest).toHaveBeenCalledWith("/sanitation/sitios/?barangay_id=91");
});
test("saved configured selection hydrates unchanged without echoing server-owned fields", async () => {
  apiRequest.mockResolvedValue(response(1));
  render(<Form initial={{ sitio_reference: 10, sitio: "SYNTHETIC 1", sitio_source: "configured" }} />);
  await screen.findByRole("option", { name: "SYNTHETIC 1", exact: true });
  expect(screen.getByLabelText("Sitio")).toHaveValue("saved");
  expect(screen.getByTestId("payload")).toHaveTextContent("{}");
});
test("inactive choices fail closed while optional manual entry remains available", async () => {
  const data = response(1); data.rows[0].is_active = false;
  apiRequest.mockResolvedValue(data);
  render(<Form />);
  await screen.findByText("The Sitio choices do not match this Barangay.");
  expect(screen.queryByRole("option", { name: "SYNTHETIC 1" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Sitio"), { target: { value: "manual" } });
  expect(screen.getByLabelText("Manual Sitio")).toBeInTheDocument();
});
