import { render, screen } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { useAuth } from "../../../auth/AuthContext";

jest.mock(
  "react-router-dom",
  () => ({
    NavLink: ({ to, className, children }) => (
      <a href={to} className={typeof className === "function" ? className({ isActive: false }) : className}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);
jest.mock("../../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

describe("Sidebar administration section", () => {
  test.each(["tourism", "sanitation", ""])("is hidden from the %s role", (role) => {
    useAuth.mockReturnValue({ role });
    render(<Sidebar />);
    expect(screen.queryByText("Administration")).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  test("shows Settings under Administration to the admin", () => {
    useAuth.mockReturnValue({ role: "admin" });
    render(<Sidebar />);
    expect(screen.getByText("Administration")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });
});
