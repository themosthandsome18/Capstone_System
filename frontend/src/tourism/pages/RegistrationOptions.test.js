import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import RegistrationOptions, {
  LAST_ACTIVE_REASON,
  PROTECTED_REASON,
  STAY_NOT_SET_REASON,
} from "./RegistrationOptions";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

// react-router-dom v7 is ESM that CRA's Jest cannot load; stub what is used.
jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));

// A small fake of the server, behind a fake fetch, so that the REAL
// tourismApi / apiRequest build the requests. A test looks at what the person
// sees AND at the request that was sent.
let lists;
let requests;
let refreshReferenceTables;
let failNext;

const row = (id, name, extra = {}) => ({
  id,
  name,
  is_active: true,
  record_count: 0,
  rename_protected: false,
  ...extra,
});

function freshLists() {
  // Different record counts everywhere: no two options can be swapped unseen.
  return {
    itinerary: [
      row(1, "Overnight", { stay_nights: 1, record_count: 3, rename_protected: true }),
      row(2, "Same Day", { stay_nights: 0, record_count: 5, rename_protected: true }),
      row(7, "6 Nights", { stay_nights: 6, record_count: 0 }),
      row(8, "Que", { stay_nights: null, record_count: 2 }),
      row(12, "Eco Adventure Trail", { stay_nights: null, record_count: 1 }),
      row(9, "Island Hopping Circuit", { stay_nights: null, record_count: 4, is_active: false }),
    ],
    "travel-mode": [
      row(1, "Private Vehicle", { record_count: 10, rename_protected: true }),
      row(3, "Public Bus", { record_count: 6 }),
      row(4, "Ferry / Port Transfer", { record_count: 0 }),
      row(5, "Tourist Van", { record_count: 2, is_active: false }),
    ],
    "boat-type": [
      row(1, "Tourist Boat", { record_count: 11, requires_capacity_fare: true }),
      row(2, "Passenger Boat", { record_count: 7, requires_capacity_fare: false }),
    ],
    "visit-purpose": [
      row(1, "Leisure", { record_count: 4, rename_protected: true }),
      row(2, "Vacation", { record_count: 10, is_active: false }),
    ],
  };
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

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

  const match = path.match(/^\/reference-options\/([a-z-]+)\/(?:(\d+)\/)?(deactivate\/|reactivate\/)?$/);
  if (!match) return reply(404, { detail: "no such route" });
  const [, kind, idText, action] = match;
  const list = lists[kind];
  if (!list) return reply(404, { detail: "unknown kind" });

  if (!idText) {
    if (method === "GET") return reply(200, list);
    if (method === "POST") {
      const created = row(Math.max(...list.map((r) => r.id)) + 1, body.name.trim(), {
        stay_nights: kind === "itinerary" ? (body.stay_nights ?? null) : undefined,
        requires_capacity_fare: kind === "boat-type" ? Boolean(body.requires_capacity_fare) : undefined,
      });
      list.push(created);
      return reply(201, created);
    }
    return reply(405, { detail: "method not allowed" });
  }

  const option = list.find((r) => r.id === Number(idText));
  if (!option) return reply(404, { detail: "no such option" });
  if (action === "deactivate/" && method === "POST") {
    option.is_active = false;
    return reply(200, option);
  }
  if (action === "reactivate/" && method === "POST") {
    option.is_active = true;
    return reply(200, option);
  }
  if (method === "PATCH") {
    if (body.confirm_affected_records !== option.record_count) {
      return reply(409, {
        detail: `This change affects ${option.record_count} record(s). Send confirm_affected_records: ${option.record_count} to continue.`,
        code: "confirmation_required",
        record_count: option.record_count,
      });
    }
    if ("name" in body) option.name = body.name;
    if ("stay_nights" in body) option.stay_nights = body.stay_nights;
    return reply(200, option);
  }
  return reply(405, { detail: "method not allowed" });
}

beforeEach(() => {
  lists = freshLists();
  requests = [];
  failNext = null;
  refreshReferenceTables = jest.fn();
  useAuth.mockReturnValue({ role: "admin" });
  useTourismData.mockReturnValue({ refreshReferenceTables });
  global.fetch = jest.fn(fakeFetch);
});

const sent = (method, path) => requests.filter((r) => r.method === method && r.path === path);
const rowOf = (id) => screen.getByTestId(`option-row-${id}`);

async function open(tabName = null) {
  render(<RegistrationOptions />);
  await screen.findByRole("table");
  if (tabName) {
    fireEvent.click(screen.getByRole("tab", { name: tabName }));
    await waitFor(() => expect(screen.getByRole("tab", { name: tabName }).getAttribute("aria-selected")).toBe("true"));
    await screen.findByRole("table");
  }
}

describe("who may open it", () => {
  it("sends anyone but the admin away, and asks the server for nothing", () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<RegistrationOptions />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("the four lists", () => {
  it("has the four tabs, each asking the server for its own list", async () => {
    await open();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Travel Itinerary",
      "Vehicle Classification",
      "Boat Classification",
      "Visit Purpose",
    ]);
    expect(sent("GET", "/reference-options/itinerary/")).toHaveLength(1);

    for (const [name, kind] of [
      ["Vehicle Classification", "travel-mode"],
      ["Boat Classification", "boat-type"],
      ["Visit Purpose", "visit-purpose"],
    ]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await waitFor(() => expect(sent("GET", `/reference-options/${kind}/`)).toHaveLength(1));
    }
  });

  it("lists the itineraries with the stay length, the right counts and the active state", async () => {
    await open();
    expect(within(rowOf(1)).getByText("3 records")).toBeTruthy();
    expect(within(rowOf(2)).getByText("5 records")).toBeTruthy();
    expect(within(rowOf(7)).getByText("0 records")).toBeTruthy();
    expect(within(rowOf(12)).getByText("1 record")).toBeTruthy();
    expect(within(rowOf(1)).getByText("1 night")).toBeTruthy();
    expect(within(rowOf(2)).getByText("Same day")).toBeTruthy();
    expect(within(rowOf(7)).getByText("6 nights")).toBeTruthy();
    expect(within(rowOf(8)).getByText("Not set")).toBeTruthy();
    expect(within(rowOf(1)).getByText("Active")).toBeTruthy();
    expect(within(rowOf(9)).getByText("Inactive")).toBeTruthy();
    // an inactive row looks inactive (muted), an active one does not
    expect(rowOf(9).className).toContain("options-row-inactive");
    expect(rowOf(1).className).not.toContain("options-row-inactive");
  });

  it("lists the vehicles with their counts", async () => {
    await open("Vehicle Classification");
    expect(within(rowOf(1)).getByText("10 records")).toBeTruthy();
    expect(within(rowOf(3)).getByText("6 records")).toBeTruthy();
    expect(within(rowOf(4)).getByText("0 records")).toBeTruthy();
    expect(within(rowOf(5)).getByText("2 records")).toBeTruthy();
    expect(within(rowOf(5)).getByText("Inactive")).toBeTruthy();
  });

  it("lists the boats with whether they ask for the fare", async () => {
    await open("Boat Classification");
    expect(within(rowOf(1)).getByText("11 records")).toBeTruthy();
    expect(within(rowOf(2)).getByText("7 records")).toBeTruthy();
    expect(within(rowOf(1)).getByText("Yes")).toBeTruthy();
    expect(within(rowOf(2)).getByText("No")).toBeTruthy();
  });

  it("lists the purposes with their counts", async () => {
    await open("Visit Purpose");
    expect(within(rowOf(1)).getByText("4 records")).toBeTruthy();
    expect(within(rowOf(2)).getByText("10 records")).toBeTruthy();
  });
});

describe("the status filter", () => {
  it("shows all, only the active, or only the inactive", async () => {
    await open();
    const filter = screen.getByLabelText("Filter by status");
    expect(filter.value).toBe("all");
    expect(screen.getAllByTestId(/^option-row-/)).toHaveLength(6);

    fireEvent.change(filter, { target: { value: "active" } });
    expect(screen.getAllByTestId(/^option-row-/)).toHaveLength(5);
    expect(screen.queryByTestId("option-row-9")).toBeNull();

    fireEvent.change(filter, { target: { value: "inactive" } });
    expect(screen.getAllByTestId(/^option-row-/)).toHaveLength(1);
    expect(screen.getByTestId("option-row-9")).toBeTruthy();
  });
});

describe("adding", () => {
  it("adds an itinerary: sends the right request, then shows what the server now holds", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "Weekend 3 Days" } });
    fireEvent.change(screen.getByLabelText("New option stay length in nights"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));

    await screen.findByText("Weekend 3 Days");
    const posts = sent("POST", "/reference-options/itinerary/");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ name: "Weekend 3 Days", stay_nights: 3 });
    expect(posts[0].body).not.toHaveProperty("id");
    // the list was read again AFTER the write
    const order = requests.map((r) => `${r.method} ${r.path}`);
    expect(order.lastIndexOf("GET /reference-options/itinerary/")).toBeGreaterThan(
      order.indexOf("POST /reference-options/itinerary/")
    );
    expect(within(screen.getByText("Weekend 3 Days").closest("tr")).getByText("3 nights")).toBeTruthy();
    expect(refreshReferenceTables).toHaveBeenCalled();
  });

  it("adds a boat that asks for the fare", async () => {
    await open("Boat Classification");
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "Barge" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /asks for boat capacity and fare/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));

    await screen.findByText("Barge");
    expect(sent("POST", "/reference-options/boat-type/")[0].body).toEqual({
      name: "Barge",
      requires_capacity_fare: true,
    });
  });

  it("will not send a name that is only spaces", async () => {
    await open("Visit Purpose");
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save new option" }).disabled).toBe(true);
    expect(sent("POST", "/reference-options/visit-purpose/")).toHaveLength(0);
  });

  it("shows the server's reason when it refuses a name", async () => {
    await open("Vehicle Classification");
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "public bus" } });
    failNext = {
      status: 400,
      body: { detail: "Another option already has this name (capitals and spaces do not count).", name: ["Already used."] },
    };
    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Another option already has this name");
    expect(sent("POST", "/reference-options/travel-mode/")).toHaveLength(1);
    // the form is still open, so nothing the person typed is lost
    expect(screen.getByLabelText("New option name").value).toBe("public bus");
  });
});

describe("renaming", () => {
  async function startRename(id, newName, tab = "Vehicle Classification") {
    await open(tab);
    fireEvent.click(within(rowOf(id)).getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: newName } });
  }

  it("shows how many records are affected, asks to confirm, and sends the number the server gave", async () => {
    await startRename(3, "Public Bus Line");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("It affects 6 records");
    expect(sent("PATCH", "/reference-options/travel-mode/3/")).toHaveLength(0); // nothing sent yet

    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(screen.getByText("Public Bus Line")).toBeTruthy());

    const patches = sent("PATCH", "/reference-options/travel-mode/3/");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ name: "Public Bus Line", confirm_affected_records: 6 });
    expect(lists["travel-mode"].find((r) => r.id === 3).name).toBe("Public Bus Line");
    expect(refreshReferenceTables).toHaveBeenCalled();
  });

  it("says plainly when no record uses the option, and still sends the zero", async () => {
    await startRename(4, "Ferry Transfer");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alertdialog")).textContent).toContain("No record uses it yet");
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(sent("PATCH", "/reference-options/travel-mode/4/")).toHaveLength(1));
    expect(sent("PATCH", "/reference-options/travel-mode/4/")[0].body).toEqual({
      name: "Ferry Transfer",
      confirm_affected_records: 0,
    });
  });

  it("does not send anything when the person goes Back from the confirmation", async () => {
    await startRename(3, "Public Bus Line");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sent("PATCH", "/reference-options/travel-mode/3/")).toHaveLength(0);
  });

  it("shows the server's refusal and the fresh count when the number changed meanwhile", async () => {
    await startRename(3, "Public Bus Line");
    lists["travel-mode"].find((r) => r.id === 3).record_count = 7; // a visitor registered meanwhile
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("affects 7 record(s)");
    expect(sent("PATCH", "/reference-options/travel-mode/3/")[0].body.confirm_affected_records).toBe(6);
    // the list was read again, so the row shows the real number now, and the name is unchanged
    await waitFor(() => expect(within(rowOf(3)).getByText("7 records")).toBeTruthy());
    expect(lists["travel-mode"].find((r) => r.id === 3).name).toBe("Public Bus");
  });

  it("changes only the stay length of an itinerary, with the same confirmation", async () => {
    await open();
    fireEvent.click(within(rowOf(7)).getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText("Stay length in nights"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alertdialog")).textContent).toContain("No record uses it yet");
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(within(rowOf(7)).getByText("7 nights")).toBeTruthy());
    const patch = sent("PATCH", "/reference-options/itinerary/7/")[0];
    expect(patch.body).toEqual({ stay_nights: 7, confirm_affected_records: 0 });
    expect(patch.body).not.toHaveProperty("name");
  });

  it("an itinerary renamed together with its stay length sends both, and the count of that option", async () => {
    await open();
    fireEvent.click(within(rowOf(12)).getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText("Stay length in nights"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: "Eco Trail Day Tour" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(screen.getByText("Eco Trail Day Tour")).toBeTruthy());
    expect(sent("PATCH", "/reference-options/itinerary/12/")[0].body).toEqual({
      name: "Eco Trail Day Tour",
      stay_nights: 0,
      confirm_affected_records: 1,
    });
  });
});

describe("the locks a person can see", () => {
  it("a name the Excel import makes: the field is disabled AND the reason is on screen", async () => {
    await open("Vehicle Classification");
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(true);
    expect(screen.getByText(PROTECTED_REASON)).toBeTruthy();
    expect(screen.getByText(PROTECTED_REASON).textContent).toContain("Excel import");
    expect(screen.getByText(PROTECTED_REASON).textContent).toContain("split");
    // it is also marked in the list
    expect(within(rowOf(1)).getByText("Name set by the import")).toBeTruthy();
  });

  it("a name that is not made by the import: the field works and no reason is shown", async () => {
    await open("Vehicle Classification");
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(false);
    expect(screen.queryByText(PROTECTED_REASON)).toBeNull();
    expect(within(rowOf(3)).queryByText("Name set by the import")).toBeNull();
  });

  it("an itinerary with no stay length: the name is locked, the reason is on screen and says what to do", async () => {
    await open();
    fireEvent.click(within(rowOf(8)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(true);
    const reason = screen.getByText(STAY_NOT_SET_REASON);
    expect(reason.textContent).toContain("Set the stay length first");
    expect(reason.textContent).toContain("reports");
  });

  it("setting a stay length unlocks the name and takes the reason away", async () => {
    await open();
    fireEvent.click(within(rowOf(8)).getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText("Stay length in nights"), { target: { value: "2" } });
    expect(screen.getByLabelText("Option name").disabled).toBe(false);
    expect(screen.queryByText(STAY_NOT_SET_REASON)).toBeNull();
  });

  it("an itinerary that has a stay length: the name is free", async () => {
    await open();
    fireEvent.click(within(rowOf(7)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(false);
    expect(screen.queryByText(STAY_NOT_SET_REASON)).toBeNull();
  });

  it("a protected itinerary keeps its stay length editable and says why the name is locked", async () => {
    await open();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /^Edit / }));
    expect(screen.getByLabelText("Option name").disabled).toBe(true);
    expect(screen.getByLabelText("Stay length in nights").disabled).toBe(false);
    expect(screen.getByText(PROTECTED_REASON)).toBeTruthy();
  });

  it("the last active option cannot be deactivated, the reason is on screen, and nothing is sent", async () => {
    await open("Visit Purpose");
    const button = within(rowOf(1)).getByRole("button", { name: "Deactivate Leisure" });
    expect(button.disabled).toBe(true);
    expect(within(rowOf(1)).getByText(LAST_ACTIVE_REASON)).toBeTruthy();
    fireEvent.click(button);
    expect(requests.filter((r) => r.path.endsWith("/deactivate/"))).toHaveLength(0);
  });

  it("with more than one active option, deactivating is allowed and there is no such reason", async () => {
    await open("Boat Classification");
    expect(within(rowOf(1)).getByRole("button", { name: "Deactivate Tourist Boat" }).disabled).toBe(false);
    expect(screen.queryByText(LAST_ACTIVE_REASON)).toBeNull();
  });
});

describe("deactivating and bringing back", () => {
  it("deactivate sends a POST to the right place with no body, then shows the option inactive", async () => {
    await open("Boat Classification");
    fireEvent.click(within(rowOf(2)).getByRole("button", { name: "Deactivate Passenger Boat" }));

    await waitFor(() => expect(within(rowOf(2)).getByText("Inactive")).toBeTruthy());
    const calls = sent("POST", "/reference-options/boat-type/2/deactivate/");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toBeNull();
    expect(lists["boat-type"].find((r) => r.id === 2).is_active).toBe(false);
    expect(refreshReferenceTables).toHaveBeenCalled();
    // and now only one is active, so the other one is locked
    expect(within(rowOf(1)).getByRole("button", { name: "Deactivate Tourist Boat" }).disabled).toBe(true);
  });

  it("reactivate sends a POST to the right place, then shows the option active", async () => {
    await open("Vehicle Classification");
    fireEvent.click(within(rowOf(5)).getByRole("button", { name: "Reactivate Tourist Van" }));

    await waitFor(() => expect(within(rowOf(5)).getByText("Active")).toBeTruthy());
    expect(sent("POST", "/reference-options/travel-mode/5/reactivate/")).toHaveLength(1);
    expect(lists["travel-mode"].find((r) => r.id === 5).is_active).toBe(true);
  });

  it("shows the server's message if it refuses to deactivate", async () => {
    await open("Vehicle Classification");
    failNext = { status: 409, body: { detail: "This is the last active option in the list.", code: "last_active" } };
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "Deactivate Public Bus" }));

    expect((await screen.findByRole("alert")).textContent).toContain("last active option");
    expect(lists["travel-mode"].find((r) => r.id === 3).is_active).toBe(true);
  });

  it("shows a failure to load the list, with a way to try again", async () => {
    failNext = { status: 500, body: { detail: "The server is having a problem." } };
    render(<RegistrationOptions />);
    expect((await screen.findByRole("alert")).textContent).toContain("The server is having a problem.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("table");
  });
});

describe("there is no way to delete", () => {
  it("has no delete or remove button in any tab, and sends no DELETE", async () => {
    await open();
    for (const name of ["Travel Itinerary", "Vehicle Classification", "Boat Classification", "Visit Purpose"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await waitFor(() => expect(screen.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
      await screen.findByRole("table");
      expect(screen.queryByRole("button", { name: /delete|remove|erase|trash/i })).toBeNull();
      expect(screen.queryByText(/^(delete|remove)/i)).toBeNull();
    }
    // open an edit panel and the add form too: still nothing
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0);
  });
});
