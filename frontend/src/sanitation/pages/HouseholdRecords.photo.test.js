import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdRecords from "./HouseholdRecords";

let mockRecords;
const record = { id: 71, household_code: "PHOTO-SYN", household_head: "Synthetic Household",
  barangay: "Daungan", male_count: 2, female_count: 1, total_members: 3, status: "good_standing" };
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../context/SanitationDataContext", () => ({ useSanitationData: () => ({
  householdRecords: mockRecords, barangays: [], householdStatus: "success", householdReady: true,
  householdHasData: true, householdError: "", reloadHouseholds: jest.fn(), loading: false,
}) }));
const response = (status = 200) => ({ ok: status === 200, status,
  headers: { get: () => "image/png" }, blob: async () => new Blob(["synthetic"], { type: "image/png" }) });
beforeEach(() => {
  mockRecords = [record];
  localStorage.setItem("capstone_auth_token", "synthetic-session");
  global.fetch = jest.fn().mockResolvedValue(response());
  URL.createObjectURL = jest.fn().mockReturnValue("blob:synthetic-photo");
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });
const open = () => fireEvent.click(screen.getByTitle("View Household Details"));
const close = () => fireEvent.click(screen.getAllByRole("button").filter(button => button.className === "hh-modal-close").pop());

test("view fetches a protected photo and revokes its browser resource on close", async () => {
  render(<HouseholdRecords />); open();
  const image = await screen.findByRole("img", { name: "Household frontage" });
  expect(image).toHaveAttribute("src", "blob:synthetic-photo");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/households/records/71/front-photo/"),
    expect.objectContaining({ headers: { Authorization: "Token synthetic-session" }, cache: "no-store" }));
  close(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-photo");
});
test("404 is an explicit no-photo state", async () => {
  fetch.mockResolvedValue(response(404)); render(<HouseholdRecords />); open();
  expect(await screen.findByText("No front photo saved." )).toBeInTheDocument();
});
test("loading is distinct from empty", async () => {
  fetch.mockReturnValue(new Promise(() => {})); render(<HouseholdRecords />); open();
  expect(await screen.findByText("Loading household photo…")).toBeInTheDocument();
  expect(screen.queryByText("No front photo saved.")).not.toBeInTheDocument();
});
test("expired session is not an empty photo", async () => {
  fetch.mockResolvedValue(response(401)); render(<HouseholdRecords />); open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
  expect(screen.queryByRole("img", { name: "Household frontage" })).not.toBeInTheDocument();
});
test("failed retrieval exposes retry and recovery", async () => {
  fetch.mockResolvedValueOnce(response(503)); render(<HouseholdRecords />); open();
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  fireEvent.click(screen.getByRole("button", { name: "Retry photo" }));
  expect(await screen.findByRole("img", { name: "Household frontage" })).toBeInTheDocument();
});
test("403 is authorization failure and never an empty state", async () => {
  fetch.mockResolvedValue(response(403)); render(<HouseholdRecords />); open();
  expect(await screen.findByRole("alert")).toHaveTextContent("not authorized");
  expect(screen.queryByText("No front photo saved.")).not.toBeInTheDocument();
});
test("reopening and provider reload fetch fresh photo and revoke old resources", async () => {
  URL.createObjectURL.mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second").mockReturnValueOnce("blob:third");
  const view = render(<HouseholdRecords />); open();
  expect(await screen.findByRole("img", { name: "Household frontage" })).toHaveAttribute("src", "blob:first");
  close(); open();
  expect(await screen.findByRole("img", { name: "Household frontage" })).toHaveAttribute("src", "blob:second");
  mockRecords = [{ ...record, updated_at: "2026-11-05" }]; view.rerender(<HouseholdRecords />);
  await waitFor(() => expect(screen.getByRole("img", { name: "Household frontage" })).toHaveAttribute("src", "blob:third"));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
  expect(fetch).toHaveBeenCalledTimes(3);
});
test("response after close is ignored without allocating a blob URL", async () => {
  let resolve;
  fetch.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<HouseholdRecords />); open(); close();
  await act(async () => { resolve(response()); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test("session switch during retrieval prevents previous-account image rendering", async () => {
  let resolve;
  fetch.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<HouseholdRecords />); open();
  localStorage.setItem("capstone_auth_token", "other-synthetic-session");
  await act(async () => { resolve(response()); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test("logout storage event immediately revokes a displayed photo", async () => {
  render(<HouseholdRecords />); open();
  await screen.findByRole("img", { name: "Household frontage" });
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "capstone_auth_token" })));
  expect(screen.queryByRole("img", { name: "Household frontage" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-photo");
});
test("missing token sends no request and invalid image responses are rejected", async () => {
  localStorage.clear(); const view = render(<HouseholdRecords />); open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
  expect(fetch).not.toHaveBeenCalled(); view.unmount();
  localStorage.setItem("capstone_auth_token", "synthetic-session");
  fetch.mockResolvedValue({ ...response(), headers: { get: () => "text/html" } });
  render(<HouseholdRecords />); open();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
