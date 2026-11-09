// The login of the admin refuses an account whose role reaches no page: the message, no token, no user, and nothing sent to the server that would sign the person's
// phone out. The accounts that do reach a page come in as they always did.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import { AUTH_TOKEN_KEY } from "../shared/apiClient";
import { MOBILE_ONLY_MESSAGE } from "./roleAccess";

const mockNavigate = jest.fn();
let mockLocationState = null;

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return {
      Navigate: ({ to }) => React.createElement("div", { "data-testid": "redirect", "data-to": to }),
      useNavigate: () => mockNavigate,
      useLocation: () => ({ pathname: "/login", state: mockLocationState }),
    };
  },
  { virtual: true }
);

const ROLE_WORDS = ["resort", "tourist", "establishment", "sanitation", "tourism", "admin"];
let calls;

function userOf(role) {
  return { id: 7, username: "someone", email: "", first_name: "", last_name: "", display_name: "someone", is_superuser: false, profile: { role } };
}

function answer(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
}

// a fake server: /auth/login/ gives an account of `role` and a token; /auth/me/ gives the account of the stored token
function serverOf(role) {
  global.fetch = jest.fn((url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, "");
    calls.push(`${(options.method || "GET").toUpperCase()} ${path}`);
    if (path === "/auth/login/") return answer(200, { token: "token-of-the-phone", user: userOf(role) });
    if (path === "/auth/me/") return answer(200, { user: userOf(role) });
    if (path === "/auth/logout/") return answer(204, {});
    return answer(404, {});
  });
}

async function signIn() {
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
  await screen.findByPlaceholderText("Username");
  fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "someone" } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "whatever-123" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
}

beforeEach(() => {
  window.localStorage.clear();
  mockNavigate.mockClear();
  mockLocationState = null;
  calls = [];
});

describe("an account that reaches no page", () => {
  it.each(["resort", "tourist", "establishment", "a-role-that-does-not-exist-yet", ""])("%p is refused with the message, keeps no token and goes nowhere", async (role) => {
    serverOf(role);
    await signIn();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(MOBILE_ONLY_MESSAGE);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0); // nothing kept at all
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.getByPlaceholderText("Username")).toBeTruthy(); // still on the login page, not a blank one
    expect(calls).toContain("POST /auth/login/");
  });

  it("the message names no role", async () => {
    serverOf("resort");
    await signIn();
    const text = (await screen.findByRole("alert")).textContent.toLowerCase();
    ROLE_WORDS.forEach((word) => expect(text).not.toContain(word));
    expect(text).not.toContain("staff");
  });

  it("the server is NOT asked to sign out: the token is the one the person's phone uses", async () => {
    serverOf("resort");
    await signIn();
    await screen.findByRole("alert");
    expect(calls.some((call) => call.includes("/auth/logout/"))).toBe(false);
    expect(calls).toEqual(["POST /auth/login/"]);
  });

  it("the person can try again with another account on the same page", async () => {
    serverOf("resort");
    await signIn();
    await screen.findByRole("alert");
    serverOf("tourism");
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("token-of-the-phone");
  });
});

describe("an account that reaches a page comes in as it always did", () => {
  it.each([
    ["admin", "/module-selection"],
    ["tourism", "/"],
    ["sanitation", "/sanitation"],
  ])("%s is kept and sent to %s", async (role, firstPage) => {
    serverOf(role);
    await signIn();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(firstPage, { replace: true }));
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("token-of-the-phone");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes back to the page it came from, when that page is its own", async () => {
    mockLocationState = { from: { pathname: "/destinations" } };
    serverOf("tourism");
    await signIn();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/destinations", { replace: true }));
  });

  it("a wrong password still says so", async () => {
    global.fetch = jest.fn(() => answer(401, { detail: "Invalid username or password." }));
    await signIn();
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password.");
  });
});

describe("a token kept from before, of an account that reaches no page", () => {
  it("is forgotten on this browser, and the login page says why", async () => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, "token-of-the-phone");
    serverOf("resort");
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(MOBILE_ONLY_MESSAGE);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(calls.some((call) => call.includes("/auth/logout/"))).toBe(false);
  });

  it("a kept token of an account that does reach a page is used as before", async () => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, "token-of-the-phone");
    serverOf("tourism");
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );
    const redirect = await screen.findByTestId("redirect");
    expect(redirect.getAttribute("data-to")).toBe("/");
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("token-of-the-phone");
  });
});
