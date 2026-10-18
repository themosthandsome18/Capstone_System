import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { getCurrentUser } from "../../auth/authApi";
import { fetchPublicReportOptions } from "../services/publicReportingApi";

// Exercise the real BrowserRouter/Routes implementation through its installed
// CommonJS entry; CRA 5's Jest cannot load react-router-dom's ESM entry.
jest.mock("react-router-dom", () => require("../../../node_modules/react-router/dist/development/index.js"), { virtual: true });
jest.mock("../../auth/authApi", () => ({ getCurrentUser: jest.fn(), login: jest.fn(), logout: jest.fn() }));
jest.mock("../../auth/LoginPage", () => () => <div>Login screen</div>);
jest.mock("../../auth/ModuleSelectionPage", () => () => null);
jest.mock("../../auth/ProtectedRoute", () => () => { throw new Error("Public page entered an authenticated route"); });
jest.mock("./VerifyPermit", () => () => null);
jest.mock("../../tourism/tourismRoutes", () => ({ tourismRoutes: [] }));
jest.mock("../sanitationRoutes", () => ({ sanitationRoutes: [] }));
jest.mock("../../tourism/components/layout/AppShell", () => () => null);
jest.mock("../components/layout/SanitationAppShell", () => () => { throw new Error("Staff shell rendered"); });
jest.mock("../../tourism/context/TourismDataContext", () => ({ TourismDataProvider: () => { throw new Error("Staff provider rendered"); } }));
jest.mock("../context/SanitationDataContext", () => ({ SanitationDataProvider: () => { throw new Error("Staff provider rendered"); } }));
jest.mock("../services/publicReportingApi", () => ({ fetchPublicReportOptions: jest.fn(), submitPublicReport: jest.fn(), createPublicReportId: jest.fn() }));

global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;
const App = require("../../App").default;

test("/report-sanitation opens with the real public router and auth provider, without login or staff shell", async () => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/report-sanitation");
  fetchPublicReportOptions.mockResolvedValue({ categories: ["Synthetic concern"], barangays: ["Synthetic barangay"] });
  render(<App />);
  await screen.findByRole("option", { name: "Synthetic concern" });
  expect(screen.getByRole("heading", { name: "Report a sanitation concern" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/report-sanitation");
  expect(getCurrentUser).not.toHaveBeenCalled();
  expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
});
