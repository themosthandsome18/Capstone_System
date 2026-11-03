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

const THREE = ["Settings", "Registration Options", "Mobile App Content"];

describe("Sidebar administration section", () => {
  test.each(["admin", "tourism"])("shows Settings, Registration Options and Mobile App Content under Administration to the %s role", (role) => {
    useAuth.mockReturnValue({ role });
    render(<Sidebar />);
    expect(screen.getByText("Administration")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("link", { name: "Registration Options" }).getAttribute("href")).toBe("/options");
    expect(screen.getByRole("link", { name: "Mobile App Content" }).getAttribute("href")).toBe("/mobile-content");
  });

  test.each(["tourist", "sanitation", "establishment", "auditor", ""])("is hidden from the %s role (a tourist, sanitation-only, an unknown role, no role)", (role) => {
    useAuth.mockReturnValue({ role });
    render(<Sidebar />);
    expect(screen.queryByText("Administration")).toBeNull();
    THREE.forEach((name) => expect(screen.queryByRole("link", { name })).toBeNull());
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  test("a user with no role at all sees none of the three", () => {
    useAuth.mockReturnValue({ role: undefined });
    render(<Sidebar />);
    THREE.forEach((name) => expect(screen.queryByRole("link", { name })).toBeNull());
  });
});
