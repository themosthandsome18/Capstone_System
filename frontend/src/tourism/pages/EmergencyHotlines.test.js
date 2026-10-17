import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import EmergencyHotlines, {
  EMPTY_LIST_NOTICE,
  ICON_NOTE,
  NEXT_VERSION_NOTICE,
  NUMBERS_HINT,
  OPTIONAL_HINT,
  SAVE_NOTE,
} from "./EmergencyHotlines";
import { useAuth } from "../../auth/AuthContext";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

// A small fake of the server behind a fake fetch, so the REAL tourismApi /
// apiRequest build the requests. A test looks at what the person sees AND at
// the request that was sent.
let contacts;
let requests;
let failNext;
let answerWith;

const contact = (id, name, icon, order, extra = {}) => ({
  id,
  name,
  contact_numbers: `0${id}00-111-${id}${id}${id}${id}`,
  email: "",
  description: "",
  icon,
  display_order: order,
  is_active: true,
  ...extra,
});

// Different ids, names, icons, orders (gaps, as the server leaves them).
function freshContacts() {
  return [
    contact(4, "Zulu Rescue Base", "rescue", 10),
    contact(9, "Mike Police Post", "police", 20, { email: "mike@example.com" }),
    contact(2, "Echo Coast Guard", "coast_guard", 30, { description: "Boats and sea rescue", is_active: false }),
    contact(7, "Tango Help Desk", "help_desk", 40),
  ];
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

const ordered = () => [...contacts].sort((a, b) => a.display_order - b.display_order || a.id - b.id);

function fakeFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^.*\/api/, "");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });

  if (failNext) {
    const failure = failNext;
    failNext = null;
    return reply(failure.status, failure.body);
  }
  if (answerWith && answerWith.match(method, path)) {
    const answer = answerWith;
    answerWith = null;
    return reply(answer.status || 200, answer.body);
  }

  const match = path.match(/^\/emergency-contacts\/(?:(\d+)\/|(reorder)\/)?(deactivate\/|reactivate\/)?$/);
  if (!match) return reply(404, { detail: "no such route" });
  const [, idText, reorder, action] = match;

  if (reorder) {
    body.ids.forEach((id, position) => {
      contacts.find((c) => c.id === id).display_order = (position + 1) * 10;
    });
    return reply(200, ordered());
  }
  if (!idText) {
    if (method === "GET") return reply(200, ordered());
    if (method === "POST") {
      const created = contact(Math.max(...contacts.map((c) => c.id)) + 1, body.name.trim(), body.icon, 50, {
        contact_numbers: body.contact_numbers,
        email: body.email,
        description: body.description,
      });
      contacts.push(created);
      return reply(201, created);
    }
    return reply(405, { detail: "method not allowed" });
  }
  const found = contacts.find((c) => c.id === Number(idText));
  if (!found) return reply(404, { detail: "no such contact" });
  if (action === "deactivate/") {
    found.is_active = false;
    return reply(200, found);
  }
  if (action === "reactivate/") {
    found.is_active = true;
    return reply(200, found);
  }
  if (method === "PATCH") {
    Object.assign(found, body);
    return reply(200, found);
  }
  return reply(405, { detail: "method not allowed" });
}

beforeEach(() => {
  contacts = freshContacts();
  requests = [];
  failNext = null;
  answerWith = null;
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn(fakeFetch);
});

const sent = (method, path) => requests.filter((r) => r.method === method && r.path === path);
const writes = () => requests.filter((r) => r.method !== "GET");
const rowOf = (id) => screen.getByTestId(`hotline-row-${id}`);
const shownOrder = () => screen.getAllByTestId(/^hotline-row-/).map((r) => r.getAttribute("data-testid").replace("hotline-row-", ""));

const iconOf = (id) => rowOf(id).querySelector(".contact-icon").getAttribute("data-icon");
const pressedIcons = () =>
  within(screen.getByRole("group", { name: "Icon" }))
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.getAttribute("aria-label"));

async function open() {
  render(<EmergencyHotlines />);
  await screen.findByRole("list");
}

describe("who may open it", () => {
  it("sends anyone but the admin away, and asks the server for nothing", () => {
    for (const role of ["tourism", "sanitation", undefined]) {
      useAuth.mockReturnValue({ role });
      const { unmount } = render(<EmergencyHotlines />);
      expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
      expect(screen.queryByRole("list")).toBeNull();
      unmount();
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("the list", () => {
  it("asks once, and shows each contact's details in the server's order", async () => {
    await open();
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);

    expect(within(rowOf(4)).getByText("Zulu Rescue Base")).toBeTruthy();
    expect(iconOf(4)).toBe("rescue");
    expect(within(rowOf(4)).getByText("04" + "00-111-4444")).toBeTruthy();
    expect(iconOf(9)).toBe("police");
    expect(within(rowOf(9)).getByText("mike@example.com")).toBeTruthy();
    expect(iconOf(2)).toBe("coast_guard");
    expect(within(rowOf(2)).getByText("Boats and sea rescue")).toBeTruthy();
    expect(iconOf(7)).toBe("help_desk");
    expect(within(rowOf(4)).getByText("Active")).toBeTruthy();
    expect(within(rowOf(2)).getByText("Inactive")).toBeTruthy();
    expect(rowOf(2).className).toContain("is-inactive");
    expect(rowOf(4).className).not.toContain("is-inactive");
  });

  it("puts the rows in display_order even when the server's ids run the other way", async () => {
    answerWith = {
      match: (method, path) => method === "GET" && path === "/emergency-contacts/",
      body: [
        contact(10, "Last by order", "other", 30),
        contact(30, "First by order", "other", 10),
        contact(20, "Middle by order", "other", 20),
      ],
    };
    await open();
    expect(shownOrder()).toEqual(["30", "20", "10"]);
  });

  it("shows both notices, all the time", async () => {
    await open();
    expect(screen.getByText(NEXT_VERSION_NOTICE)).toBeTruthy();
    expect(screen.getByText(EMPTY_LIST_NOTICE)).toBeTruthy();
    expect(NEXT_VERSION_NOTICE).toBe(
      "Changes here reach the mobile app only when the next version of the app is released."
    );
    expect(EMPTY_LIST_NOTICE).toBe(
      "If no contact is active, the app falls back to its own built-in list, so the emergency numbers are never missing — even with no internet."
    );
    // still there after an action and after a failure
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Zulu Rescue Base" }));
    await screen.findByText("Zulu Rescue Base was deactivated.");
    expect(screen.getByText(NEXT_VERSION_NOTICE)).toBeTruthy();
    expect(screen.getByText(EMPTY_LIST_NOTICE)).toBeTruthy();
  });

  it("offers no delete anywhere", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    expect(screen.queryByText(/delete/i, { selector: "button" })).toBeNull();
  });

  it("keeps the list on screen, with no Loading..., WHILE a write is on its way", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Zulu Rescue Base" }));
    // straight after the click, before the server has answered
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.getByRole("list")).toBeTruthy();
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);
    await within(rowOf(4)).findByText("Inactive");

    fireEvent.click(screen.getByRole("button", { name: "Move Mike Police Post up" }));
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);
    await waitFor(() => expect(shownOrder()).toEqual(["9", "4", "2", "7"]));
  });

  it("says Loading... only the first time", async () => {
    render(<EmergencyHotlines />);
    expect(screen.getByText("Loading...")).toBeTruthy();
    await screen.findByRole("list");
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("shows the server's message when the list cannot be loaded", async () => {
    failNext = { status: 500, body: { detail: "The server is down." } };
    render(<EmergencyHotlines />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("the status filter", () => {
  it("shows all, only the active, or only the inactive", async () => {
    await open();
    const filter = screen.getByLabelText("Filter by status");
    expect(filter.value).toBe("all");
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);

    fireEvent.change(filter, { target: { value: "active" } });
    expect(shownOrder()).toEqual(["4", "9", "7"]);

    fireEvent.change(filter, { target: { value: "inactive" } });
    expect(shownOrder()).toEqual(["2"]);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
  });

  it("disables the arrows while the list is filtered", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "active" } });
    screen.getAllByRole("button", { name: /^Move .* (up|down)$/ }).forEach((button) => expect(button.disabled).toBe(true));
    expect(screen.getByText(/only be changed while all contacts are shown/i)).toBeTruthy();
  });
});

describe("deactivate and reactivate", () => {
  it("deactivates: one request, the row changes at once, no Loading, no refetch", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Mike Police Post" }));
    await within(rowOf(9)).findByText("Inactive");

    expect(writes()).toEqual([{ method: "POST", path: "/emergency-contacts/9/deactivate/", body: null }]);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.getByRole("button", { name: "Reactivate Mike Police Post" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deactivate Mike Police Post" })).toBeNull();
    // the others did not change
    expect(within(rowOf(4)).getByText("Active")).toBeTruthy();
    expect(within(rowOf(2)).getByText("Inactive")).toBeTruthy();
  });

  it("reactivates: one request, the row changes at once", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate Echo Coast Guard" }));
    await within(rowOf(2)).findByText("Active");

    expect(writes()).toEqual([{ method: "POST", path: "/emergency-contacts/2/reactivate/", body: null }]);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(rowOf(2).className).not.toContain("is-inactive");
  });

  it("shows what the SERVER answered, not what the page would guess", async () => {
    await open();
    // The page would guess "inactive, everything else as it was". The server
    // says it is inactive AND that its description and number are different.
    answerWith = {
      match: (method, path) => path === "/emergency-contacts/4/deactivate/",
      body: contact(4, "Zulu Rescue Base", "rescue", 10, {
        is_active: false,
        description: "Answered by the server",
        contact_numbers: "9999-000-1234",
      }),
    };
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Zulu Rescue Base" }));
    await within(rowOf(4)).findByText("Inactive");
    expect(within(rowOf(4)).getByText("Answered by the server")).toBeTruthy();
    expect(within(rowOf(4)).getByText("9999-000-1234")).toBeTruthy();
    expect(within(rowOf(4)).queryByText("04" + "00-111-4444")).toBeNull();
  });

  it("can deactivate the last active contact: the page does not forbid it", async () => {
    await open();
    for (const name of ["Zulu Rescue Base", "Mike Police Post", "Tango Help Desk"]) {
      fireEvent.click(screen.getByRole("button", { name: `Deactivate ${name}` }));
      await screen.findByText(`${name} was deactivated.`);
    }
    expect(writes()).toHaveLength(3);
    expect(document.querySelectorAll(".options-status.active")).toHaveLength(0);
    expect(document.querySelectorAll(".options-status.inactive")).toHaveLength(4);
    expect(screen.getByText(EMPTY_LIST_NOTICE)).toBeTruthy();
  });

  it("when the server refuses, the row does not change and the message is shown", async () => {
    await open();
    failNext = { status: 500, body: { detail: "The database is busy. Try again." } };
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Zulu Rescue Base" }));
    expect(await screen.findByText("The database is busy. Try again.")).toBeTruthy();
    expect(within(rowOf(4)).getByText("Active")).toBeTruthy();
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);
    expect(writes()).toHaveLength(1);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
  });
});

describe("adding", () => {
  async function fillAndSave() {
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Bravo Fire Station" } });
    fireEvent.click(screen.getByRole("button", { name: "Fire" }));
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "0917-555-0188" } });
    fireEvent.change(screen.getByLabelText("Contact email"), { target: { value: "fire@example.com" } });
    fireEvent.change(screen.getByLabelText("Contact description"), { target: { value: "Fire and rescue" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new contact" }));
  }

  it("sends the right request once, then shows the new row last", async () => {
    await open();
    await fillAndSave();
    await screen.findByTestId("hotline-row-10");

    const posts = sent("POST", "/emergency-contacts/");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      name: "Bravo Fire Station",
      icon: "fire",
      contact_numbers: "0917-555-0188",
      email: "fire@example.com",
      description: "Fire and rescue",
    });
    expect(posts[0].body).not.toHaveProperty("id");
    expect(posts[0].body).not.toHaveProperty("display_order");
    expect(posts[0].body).not.toHaveProperty("is_active");
    expect(writes()).toHaveLength(1);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(shownOrder()).toEqual(["4", "9", "2", "7", "10"]);
    expect(screen.queryByRole("form", { name: "Add contact" })).toBeNull();
  });

  it("shows the server's version of the new contact (its id, name and place)", async () => {
    await open();
    answerWith = {
      match: (method, path) => method === "POST" && path === "/emergency-contacts/",
      status: 201,
      body: contact(31, "Name As The Server Kept It", "police", 15),
    };
    await fillAndSave();
    await screen.findByText("Name As The Server Kept It");
    expect(screen.queryByText("Bravo Fire Station")).toBeNull();
    // display_order 15 puts it between the 10 and the 20
    expect(shownOrder()).toEqual(["4", "31", "9", "2", "7"]);
  });

  it("needs a name and a number before it can be saved", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const save = screen.getByRole("button", { name: "Save new contact" });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Only a name" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "1" } });
    expect(save.disabled).toBe(false);
  });

  it("offers exactly the twelve icons, in a grid of buttons (not a dropdown)", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const grid = within(screen.getByRole("group", { name: "Icon" }));
    expect(grid.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Rescue", "Police", "Coast Guard", "Fire", "Hospital", "Ambulance",
      "Help desk", "LGU office", "Power", "Water", "Port", "Other",
    ]);
    expect(screen.queryByLabelText("Contact category")).toBeNull();
    expect(screen.queryByLabelText("Contact icon")).toBeNull();
  });

  it("when the server refuses (the same name), the list does not change and its message is shown", async () => {
    await open();
    failNext = { status: 400, body: { detail: "Another contact already has this name (capitals and spaces do not count)." } };
    await fillAndSave();
    expect(await screen.findByText(/already has this name/)).toBeTruthy();
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);
    expect(within(screen.getByRole("list")).queryByText("Bravo Fire Station")).toBeNull();
    // the form is still open, so nothing typed is lost
    expect(screen.getByLabelText("Contact name").value).toBe("Bravo Fire Station");
    expect(writes()).toHaveLength(1);
  });
});

describe("editing", () => {
  it("sends only what changed, then shows the row from the server's answer", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Mike Police Post" }));
    expect(screen.getByLabelText("Contact name").value).toBe("Mike Police Post");
    expect(pressedIcons()).toEqual(["Police"]);
    expect(screen.getByLabelText("Contact email").value).toBe("mike@example.com");

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save.disabled).toBe(true); // nothing changed yet
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "0918-777-3210" } });
    fireEvent.click(save);
    await within(rowOf(9)).findByText("0918-777-3210");

    expect(writes()).toEqual([
      { method: "PATCH", path: "/emergency-contacts/9/", body: { contact_numbers: "0918-777-3210" } },
    ]);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);
    expect(within(rowOf(9)).getByText("mike@example.com")).toBeTruthy();
  });

  it("can change the icon: sends only the icon, and the row's icon follows the answer", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Tango Help Desk" }));
    fireEvent.click(screen.getByRole("button", { name: "Power" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(iconOf(7)).toBe("power"));
    expect(writes()).toEqual([{ method: "PATCH", path: "/emergency-contacts/7/", body: { icon: "power" } }]);
  });

  it("shows what the SERVER answered, not what was typed", async () => {
    await open();
    answerWith = {
      match: (method, path) => method === "PATCH" && path === "/emergency-contacts/4/",
      body: contact(4, "Zulu Rescue Base", "rescue", 10, { contact_numbers: "0000-SERVER-TEXT" }),
    };
    fireEvent.click(screen.getByRole("button", { name: "Edit Zulu Rescue Base" }));
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "0917-123-4567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await within(rowOf(4)).findByText("0000-SERVER-TEXT");
    expect(within(rowOf(4)).queryByText("0917-123-4567")).toBeNull();
  });

  it("when the server refuses, the row keeps its old text, the message shows and the form stays", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Mike Police Post" }));
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Zulu rescue  base" } });
    failNext = { status: 400, body: { detail: "Another contact already has this name (capitals and spaces do not count)." } };
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/already has this name/)).toBeTruthy();
    expect(within(rowOf(9)).getByText("Mike Police Post")).toBeTruthy();
    expect(screen.getByLabelText("Contact name").value).toBe("Zulu rescue  base");
    expect(writes()).toHaveLength(1);
  });
});

describe("moving up and down", () => {
  it("the first row's Up and the last row's Down are disabled", async () => {
    await open();
    const button = (name) => screen.getByRole("button", { name });
    expect(button("Move Zulu Rescue Base up").disabled).toBe(true);
    expect(button("Move Zulu Rescue Base down").disabled).toBe(false);
    expect(button("Move Tango Help Desk up").disabled).toBe(false);
    expect(button("Move Tango Help Desk down").disabled).toBe(true);
    // the ones in the middle can go both ways
    expect(button("Move Mike Police Post up").disabled).toBe(false);
    expect(button("Move Mike Police Post down").disabled).toBe(false);
    expect(screen.getAllByRole("button", { name: /^Move .* up$/ }).filter((b) => !b.disabled)).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Move .* down$/ }).filter((b) => !b.disabled)).toHaveLength(3);
  });

  it("Up sends the WHOLE list of ids with the two swapped, and the screen follows", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Echo Coast Guard up" }));
    await waitFor(() => expect(shownOrder()).toEqual(["4", "2", "9", "7"]));

    expect(writes()).toEqual([{ method: "POST", path: "/emergency-contacts/reorder/", body: { ids: [4, 2, 9, 7] } }]);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("Down sends the WHOLE list of ids with the two swapped, and the screen follows", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Zulu Rescue Base down" }));
    await waitFor(() => expect(shownOrder()).toEqual(["9", "4", "2", "7"]));

    expect(writes()).toEqual([{ method: "POST", path: "/emergency-contacts/reorder/", body: { ids: [9, 4, 2, 7] } }]);
    expect(sent("GET", "/emergency-contacts/")).toHaveLength(1);
  });

  it("includes the inactive contacts in the list it sends", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Tango Help Desk up" }));
    await waitFor(() => expect(shownOrder()).toEqual(["4", "9", "7", "2"]));
    expect(writes()[0].body.ids).toEqual([4, 9, 7, 2]);
    expect(writes()[0].body.ids).toHaveLength(4);
  });

  it("the buttons follow the new order: the row that is now first has its Up disabled", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Mike Police Post up" }));
    await waitFor(() => expect(shownOrder()).toEqual(["9", "4", "2", "7"]));
    expect(screen.getByRole("button", { name: "Move Mike Police Post up" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Move Zulu Rescue Base up" }).disabled).toBe(false);
  });

  it("shows the order the SERVER answered, not the one that was asked for", async () => {
    await open();
    answerWith = {
      match: (method, path) => path === "/emergency-contacts/reorder/",
      body: [
        contact(7, "Tango Help Desk", "desk", 10),
        contact(4, "Zulu Rescue Base", "rescue", 20),
        contact(2, "Echo Coast Guard", "coast_guard", 30, { is_active: false }),
        contact(9, "Mike Police Post", "police", 40),
      ],
    };
    fireEvent.click(screen.getByRole("button", { name: "Move Mike Police Post down" }));
    await waitFor(() => expect(shownOrder()).toEqual(["7", "4", "2", "9"]));
  });

  it("when the server refuses, the order does not change and the message shows", async () => {
    await open();
    failNext = { status: 400, body: { detail: "ids must list every existing contact exactly once, with no other id." } };
    fireEvent.click(screen.getByRole("button", { name: "Move Mike Police Post up" }));
    expect(await screen.findByText(/exactly once/)).toBeTruthy();
    expect(shownOrder()).toEqual(["4", "9", "2", "7"]);
    expect(writes()).toHaveLength(1);
  });
});

describe("optional details are chips that appear only when there is something", () => {
  it("a contact with no email and no description has no chip and no empty field", async () => {
    await open();
    const plain = rowOf(4); // no email, no description
    expect(plain.querySelectorAll(".hotline-chip")).toHaveLength(0);
    expect(plain.querySelector(".hotline-chips")).toBeNull();
    // nothing in the row is an empty element standing in for a missing value
    const empties = [...plain.querySelectorAll("div, span, p")].filter(
      (el) => el.children.length === 0 && el.textContent.trim() === ""
    );
    expect(empties).toEqual([]);
    expect(within(plain).getByText("Zulu Rescue Base")).toBeTruthy();
    expect(within(plain).getByText("0400-111-4444")).toBeTruthy();
  });

  it("an email gives one chip, a description gives one chip, and each has its text", async () => {
    await open();
    const withEmail = rowOf(9);
    expect(withEmail.querySelectorAll(".hotline-chip")).toHaveLength(1);
    expect(within(withEmail).getByText("mike@example.com").closest(".hotline-chip")).not.toBeNull();

    const withDescription = rowOf(2);
    expect(withDescription.querySelectorAll(".hotline-chip")).toHaveLength(1);
    expect(within(withDescription).getByText("Boats and sea rescue").closest(".hotline-chip")).not.toBeNull();
  });

  it("both together give two chips", async () => {
    answerWith = {
      match: (method, path) => method === "GET" && path === "/emergency-contacts/",
      body: [contact(3, "Both Details", "fire", 10, { email: "both@example.com", description: "Open all night" })],
    };
    await open();
    expect(rowOf(3).querySelectorAll(".hotline-chip")).toHaveLength(2);
  });

  it("there is no table, no column heading and no hours anywhere", async () => {
    await open();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(document.body.textContent.toLowerCase()).not.toContain("hours");
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    expect(screen.queryByLabelText("Contact hours")).toBeNull();
    expect(document.body.textContent.toLowerCase()).not.toContain("hours");
  });
});

describe("an icon name the page does not know", () => {
  const unknown = (icon) => ({
    match: (method, path) => method === "GET" && path === "/emergency-contacts/",
    body: [contact(4, "Zulu Rescue Base", icon, 10), contact(9, "Mike Police Post", "police", 20)],
  });

  it.each([["siren"], ["RESCUE"], [""], [null], [42]])(
    "shows %p as 'other': a real icon, no blank, no error, the row and its buttons all there",
    async (bad) => {
      answerWith = unknown(bad);
      await open();
      const box = rowOf(4).querySelector(".contact-icon");
      expect(box.getAttribute("data-icon")).toBe("other");
      expect(box.querySelector("svg")).not.toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(within(rowOf(4)).getByText("Zulu Rescue Base")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Edit Zulu Rescue Base" })).toBeTruthy();
      expect(iconOf(9)).toBe("police"); // the others are untouched
    }
  );

  it("an answer from the server with an unknown icon is shown as 'other' too", async () => {
    await open();
    answerWith = {
      match: (method, path) => path === "/emergency-contacts/9/deactivate/",
      body: contact(9, "Mike Police Post", "a-newer-icon", 20, { is_active: false }),
    };
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Mike Police Post" }));
    await within(rowOf(9)).findByText("Inactive");
    expect(iconOf(9)).toBe("other");
  });

  it("editing it opens with 'Other' chosen, and saving another field does not send an icon", async () => {
    answerWith = unknown("siren");
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Zulu Rescue Base" }));
    expect(pressedIcons()).toEqual(["Other"]);
    expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(true); // nothing changed
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "0917-000-1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await within(rowOf(4)).findByText("0917-000-1111");
    expect(writes()).toEqual([
      { method: "PATCH", path: "/emergency-contacts/4/", body: { contact_numbers: "0917-000-1111" } },
    ]);
  });
});

describe("the form", () => {
  const preview = () => within(screen.getByRole("group", { name: "Preview" }));
  const previewIcon = () => screen.getByRole("group", { name: "Preview" }).querySelector(".contact-icon");

  it("starts with a preview at the TOP, before the fields, with 'Other' chosen", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    const previewBox = screen.getByRole("group", { name: "Preview" });
    const grid = screen.getByRole("group", { name: "Icon" });
    const nameField = screen.getByLabelText("Contact name");
    expect(previewBox.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(previewBox.compareDocumentPosition(nameField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(previewIcon().getAttribute("data-icon")).toBe("other");
    expect(pressedIcons()).toEqual(["Other"]);
  });

  it("the preview follows the name and the numbers as they are typed", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Quebec Fire Brigade" } });
    expect(preview().getByText("Quebec Fire Brigade")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "0919-222-3333 / (042) 555-0000" } });
    expect(preview().getByText("0919-222-3333 / (042) 555-0000")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Quebec Fire" } });
    expect(preview().queryByText("Quebec Fire Brigade")).toBeNull();
    expect(preview().getByText("Quebec Fire")).toBeTruthy();
  });

  it("choosing an icon changes the preview, rings only the chosen one, and is what is sent", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    for (const [label, name] of [["Water", "water"], ["Ambulance", "ambulance"], ["LGU office", "lgu_office"]]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(previewIcon().getAttribute("data-icon")).toBe(name);
      expect(pressedIcons()).toEqual([label]); // exactly one has the ring and aria-pressed
    }
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Lima Office" } });
    fireEvent.change(screen.getByLabelText("Contact numbers"), { target: { value: "0917-100-2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new contact" }));
    await screen.findByTestId("hotline-row-10");
    expect(sent("POST", "/emergency-contacts/")[0].body.icon).toBe("lgu_office");
    expect(iconOf(10)).toBe("lgu_office");
  });

  it("opening an existing contact shows its own icon in the preview and the grid", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Edit Echo Coast Guard" }));
    expect(previewIcon().getAttribute("data-icon")).toBe("coast_guard");
    expect(pressedIcons()).toEqual(["Coast Guard"]);
    expect(preview().getByText("Echo Coast Guard")).toBeTruthy();
    expect(preview().getByText("0200-111-2222")).toBeTruthy();
  });

  it("says the twelve are all there is, what optional means, how to write numbers, and when changes arrive", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    expect(ICON_NOTE).toBe("Only these twelve exist in the app \u2014 a new one needs a new release.");
    expect(screen.getByText(ICON_NOTE)).toBeTruthy();
    expect(screen.getByText(NUMBERS_HINT)).toBeTruthy();
    expect(NUMBERS_HINT).toMatch(/slash/);
    // email and description are both marked optional, and both say what empty means
    expect(screen.getByText("Email \u2014 optional")).toBeTruthy();
    expect(screen.getByText("Description \u2014 optional")).toBeTruthy();
    expect(screen.getAllByText(OPTIONAL_HINT)).toHaveLength(2);
    expect(OPTIONAL_HINT).toMatch(/will not appear in the app/);
    // beside Save
    expect(SAVE_NOTE).toBe("Saved changes reach the app with its next release.");
    const note = screen.getByText(SAVE_NOTE);
    const save = screen.getByRole("button", { name: "Save new contact" });
    expect(note.parentElement).toBe(save.parentElement);
  });
});

describe("the layout of the list", () => {
  it("keeps the order arrows in a group of their own, apart from Edit and Deactivate", async () => {
    await open();
    const row = rowOf(9);
    const up = within(row).getByRole("button", { name: "Move Mike Police Post up" });
    const down = within(row).getByRole("button", { name: "Move Mike Police Post down" });
    const edit = within(row).getByRole("button", { name: "Edit Mike Police Post" });
    const deactivate = within(row).getByRole("button", { name: "Deactivate Mike Police Post" });
    expect(up.parentElement).toBe(down.parentElement);
    expect(edit.parentElement).toBe(deactivate.parentElement);
    expect(up.parentElement).not.toBe(edit.parentElement);
    expect(up.parentElement.getAttribute("role")).toBe("group");
  });

  it("puts the 'never deleted' line small, under the list", async () => {
    await open();
    const list = screen.getByRole("list");
    const line = screen.getByText(/Contacts are never deleted\./);
    expect(line.className).toContain("hotline-footnote");
    expect(list.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps both notices in ONE block", async () => {
    await open();
    const block = screen.getByRole("note", { name: "About these changes" });
    expect(within(block).getByText(NEXT_VERSION_NOTICE)).toBeTruthy();
    expect(within(block).getByText(EMPTY_LIST_NOTICE)).toBeTruthy();
  });
});
