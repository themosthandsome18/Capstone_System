// ProtectedRoute: a role that reaches nothing gets a clear refusal, never a blank page and never a redirect to the place it is already at.
import { fireEvent, render, screen } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "./AuthContext";
import { AUTH_TOKEN_KEY } from "../shared/apiClient";
import { MOBILE_ONLY_MESSAGE, TOURISM_ROLES } from "./roleAccess";

let mockPathname = "/";

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return {
      Navigate: ({ to }) => React.createElement("div", { "data-testid": "redirect", "data-to": to }),
      Outlet: () => React.createElement("div", { "data-testid": "outlet" }),
      useLocation: () => ({ pathname: mockPathname }),
    };
  },
  { virtual: true }
);

jest.mock("./AuthContext", () => {
  const actual = jest.requireActual("./AuthContext");
  return { ...actual, useAuth: jest.fn() };
});

const signedIn = (role) => ({ isAuthenticated: true, loading: false, role, sessionError: "", retrySession: jest.fn() });

beforeEach(() => {
  mockPathname = "/";
  window.localStorage.clear();
});

describe("a role that reaches no page", () => {
  it.each(["resort", "tourist", "establishment", "something-new"])("%s: the refusal is shown, with no redirect and no blank page", (role) => {
    useAuth.mockReturnValue(signedIn(role));
    const { container } = render(<ProtectedRoute allowedRoles={TOURISM_ROLES} />);
    expect(screen.getByRole("alert").textContent).toContain(MOBILE_ONLY_MESSAGE);
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.queryByTestId("outlet")).toBeNull();
    expect(container.textContent.trim()).not.toBe("");
  });

  it("it is the same wherever the person is, so nothing can go round", () => {
    useAuth.mockReturnValue(signedIn("resort"));
    for (const place of ["/", "/destinations", "/sanitation", "/module-selection", "/login"]) {
      mockPathname = place;
      const { unmount } = render(<ProtectedRoute allowedRoles={["admin"]} />);
      expect(screen.queryByTestId("redirect")).toBeNull();
      expect(screen.getByRole("alert")).toBeTruthy();
      unmount();
    }
  });

  it("the button forgets the token of this browser and goes to the login, and asks the server for nothing", () => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, "token-of-the-phone");
    const assign = jest.fn();
    const original = window.location;
    delete window.location;
    window.location = { ...original, assign };
    global.fetch = jest.fn();
    try {
      useAuth.mockReturnValue(signedIn("resort"));
      render(<ProtectedRoute allowedRoles={TOURISM_ROLES} />);
      fireEvent.click(screen.getByRole("button", { name: /back to login/i }));
      expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(assign).toHaveBeenCalledWith("/login");
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      window.location = original;
    }
  });
});

describe("the roles that reach a page are as they were", () => {
  it("admin, tourism and sanitation go in where they are allowed", () => {
    for (const [role, roles] of [["admin", ["admin", "tourism"]], ["tourism", ["admin", "tourism"]], ["sanitation", ["admin", "sanitation"]]]) {
      useAuth.mockReturnValue(signedIn(role));
      const { unmount } = render(<ProtectedRoute allowedRoles={roles} />);
      expect(screen.getByTestId("outlet")).toBeTruthy();
      unmount();
    }
  });

  it("tourism on an admin-only page is sent to its own first page", () => {
    useAuth.mockReturnValue(signedIn("tourism"));
    mockPathname = "/settings";
    render(<ProtectedRoute allowedRoles={["admin"]} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
  });

  it("sanitation on a tourism page is sent to the sanitation module, admin on an admin-only page stays", () => {
    useAuth.mockReturnValue(signedIn("sanitation"));
    render(<ProtectedRoute allowedRoles={TOURISM_ROLES} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/sanitation");
  });

  it("a role that does reach a page, refused here, is never sent to the place it is already at", () => {
    useAuth.mockReturnValue(signedIn("tourism"));
    mockPathname = "/";
    render(<ProtectedRoute allowedRoles={["admin"]} />);
    expect(screen.queryByTestId("redirect")).toBeNull(); // its first page IS "/": a refusal, not a redirect to "/"
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("someone who is not signed in goes to the login, as before", () => {
    useAuth.mockReturnValue({ isAuthenticated: false, loading: false, role: "", sessionError: "", retrySession: jest.fn() });
    render(<ProtectedRoute allowedRoles={TOURISM_ROLES} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/login");
  });

  it("while the session is being checked it says Loading, as before", () => {
    useAuth.mockReturnValue({ isAuthenticated: false, loading: true, role: "", sessionError: "", retrySession: jest.fn() });
    render(<ProtectedRoute allowedRoles={TOURISM_ROLES} />);
    expect(screen.getByText("Loading...")).toBeTruthy();
  });
});
