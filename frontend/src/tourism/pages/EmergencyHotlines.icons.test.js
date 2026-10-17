import { fireEvent, render, screen, within } from "@testing-library/react";
import EmergencyHotlines from "./EmergencyHotlines";
import { useAuth } from "../../auth/AuthContext";

// ONE SOURCE. The list of rows, the icon grid of the form and the preview must
// all take their icons from utils/contactIcons.js. Here that module is
// replaced by a fake with a different list; if any of the three kept its own
// copy, it would not show the fake.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../utils/contactIcons", () => {
  const items = [
    { name: "alpha", label: "Alpha", token: "--x-alpha" },
    { name: "beta", label: "Beta", token: "--x-beta" },
    { name: "other", label: "Other", token: "--x-other" },
  ];
  const find = (name) => items.find((item) => item.name === name) || items[2];
  return {
    CONTACT_ICONS: items,
    FALLBACK_ICON: "other",
    contactIcon: find,
    contactStyle: (name) => ({ "--contact-color": `var(${find(name).token})` }),
    ContactIcon: ({ name }) => <i data-testid="fake-icon" data-shown={find(name).name} />,
  };
});

const row = (id, name, icon, order) => ({
  id, name, contact_numbers: `${id}-123`, email: "", description: "", icon, display_order: order, is_active: true,
});

beforeEach(() => {
  useAuth.mockReturnValue({ role: "admin" });
  const reply = (body) => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
  global.fetch = jest.fn(() => reply([row(5, "First Contact", "alpha", 10), row(6, "Second Contact", "beta", 20)]));
});

it("draws the list, the grid and the preview from the module, and from nowhere else", async () => {
  render(<EmergencyHotlines />);
  await screen.findByRole("list");

  // the list
  const shown = (id) => within(screen.getByTestId(`hotline-row-${id}`)).getByTestId("fake-icon").getAttribute("data-shown");
  expect(shown(5)).toBe("alpha");
  expect(shown(6)).toBe("beta");

  // the form: the grid has the fake's three icons (not twelve), and the preview shows the chosen one
  fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
  const grid = within(screen.getByRole("group", { name: "Icon" }));
  expect(grid.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Alpha", "Beta", "Other"]);
  grid.getAllByRole("button").forEach((button) => expect(within(button).getByTestId("fake-icon")).toBeTruthy());

  const preview = within(screen.getByRole("group", { name: "Preview" }));
  expect(preview.getByTestId("fake-icon").getAttribute("data-shown")).toBe("other");
  fireEvent.click(screen.getByRole("button", { name: "Beta" }));
  expect(preview.getByTestId("fake-icon").getAttribute("data-shown")).toBe("beta");
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
  expect(preview.getByTestId("fake-icon").getAttribute("data-shown")).toBe("alpha");
});
