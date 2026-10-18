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
let answerWith;

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
      row(9, "Island Hopping Circuit", { stay_nights: null, record_count: 4, is_active: false }),
      row(12, "Eco Adventure Trail", { stay_nights: null, record_count: 1 }),
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
  if (answerWith && answerWith.match(method, path)) {
    const answer = answerWith;
    answerWith = null;
    return reply(answer.status || 200, answer.body);
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
  answerWith = null;
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
  it("has the four reference tabs (each asking the server for its own list) and the fare tab", async () => {
    await open();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Travel Itinerary",
      "Vehicle Classification",
      "Boat Classification",
      "Visit Purpose",
      "Boat Capacity and Fare",
    ]);
    expect(sent("GET", "/reference-options/itinerary/")).toHaveLength(1);
    // the fare list is not asked for until its own tab is opened
    expect(requests.filter((r) => r.path.startsWith("/boat-capacity-fares/"))).toHaveLength(0);

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
    // the list is NOT read again: the one GET is the first opening of the tab,
    // and the POST is the last request to this list
    expect(sent("GET", "/reference-options/itinerary/")).toHaveLength(1);
    expect(requests[requests.length - 1]).toMatchObject({ method: "POST", path: "/reference-options/itinerary/" });
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
    // a refused write changes nothing in the list (the row still says 6), and the
    // new number the server named is the one the person is asked to confirm
    expect(within(rowOf(3)).getByText("6 records")).toBeTruthy();
    expect(sent("GET", "/reference-options/travel-mode/")).toHaveLength(1);
    expect(lists["travel-mode"].find((r) => r.id === 3).name).toBe("Public Bus");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alertdialog")).textContent).toContain("It affects 7 records");
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(screen.getByText("Public Bus Line")).toBeTruthy());
    expect(sent("PATCH", "/reference-options/travel-mode/3/")[1].body.confirm_affected_records).toBe(7);
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

// ---------------------------------------------------------------------------
// Steady: no "Loading...", no second fetch, and what is shown is the server's
// ---------------------------------------------------------------------------

// Records every change to the page. A MutationObserver sees even a state that
// came and went inside one update, which a look at the page afterwards cannot.
function watchPage() {
  const seen = { loading: false, tableRemoved: false, loadingNodes: 0 };
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if ((node.textContent || "").includes("Loading...")) seen.loading = true;
      });
      record.removedNodes.forEach((node) => {
        if (node.nodeType === 1 && (node.tagName === "TABLE" || node.querySelector?.("table"))) {
          seen.tableRemoved = true;
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return {
    seen,
    stop: async () => {
      await act(async () => {});
      observer.takeRecords().forEach(() => {});
      observer.disconnect();
    },
  };
}

describe("steady, with no second fetch", () => {
  const count = (list) => requests.filter((r) => r.path === `/reference-options/${list}/`).length;

  it("opening a tab for the first time says Loading...; coming back to it does not, and asks nothing", async () => {
    render(<RegistrationOptions />);
    expect(screen.getByText("Loading...")).toBeTruthy(); // first opening, nothing to show yet
    await screen.findByRole("table");
    expect(screen.queryByText("Loading...")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Vehicle Classification" }));
    expect(screen.getByText("Loading...")).toBeTruthy(); // another tab, never opened
    await screen.findByText("Public Bus");

    fireEvent.click(screen.getByRole("tab", { name: "Travel Itinerary" }));
    expect(screen.queryByText("Loading...")).toBeNull(); // already has its list
    expect(screen.getByText("Overnight")).toBeTruthy();
    expect(count("itinerary")).toBe(1);
    expect(count("travel-mode")).toBe(1);
  });

  it("deactivate: the row changes at once, no Loading... at any moment, one request", async () => {
    await open("Vehicle Classification");
    const before = requests.length;
    const watch = watchPage();

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Deactivate Ferry / Port Transfer" }));
    await waitFor(() => expect(within(rowOf(4)).getByText("Inactive")).toBeTruthy());
    await watch.stop();

    expect(watch.seen.loading).toBe(false);
    expect(watch.seen.tableRemoved).toBe(false);
    expect(requests.slice(before).map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /reference-options/travel-mode/4/deactivate/",
    ]);
  });

  it("reactivate: the same", async () => {
    await open("Vehicle Classification");
    const before = requests.length;
    const watch = watchPage();

    fireEvent.click(within(rowOf(5)).getByRole("button", { name: "Reactivate Tourist Van" }));
    await waitFor(() => expect(within(rowOf(5)).getByText("Active")).toBeTruthy());
    await watch.stop();

    expect(watch.seen.loading).toBe(false);
    expect(watch.seen.tableRemoved).toBe(false);
    expect(requests.slice(before).map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /reference-options/travel-mode/5/reactivate/",
    ]);
  });

  it("add: the new row appears from the server's answer, in its place by id, with no Loading...", async () => {
    await open("Vehicle Classification");
    const before = requests.length;
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "Tricycle" } });
    const watch = watchPage();

    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));
    await screen.findByText("Tricycle");
    await watch.stop();

    expect(watch.seen.loading).toBe(false);
    expect(watch.seen.tableRemoved).toBe(false);
    expect(requests.slice(before).map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /reference-options/travel-mode/",
    ]);
    // ids 1, 3, 4, 5 and the new 6: the new row is last
    const ids = screen.getAllByTestId(/^option-row-/).map((tr) => tr.getAttribute("data-testid"));
    expect(ids).toEqual(["option-row-1", "option-row-3", "option-row-4", "option-row-5", "option-row-6"]);
  });

  it("rename: the name changes at once, no Loading..., one request", async () => {
    await open("Vehicle Classification");
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: "Public Bus Line" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const confirm = await screen.findByRole("button", { name: "Confirm and save" });
    const before = requests.length;
    const watch = watchPage();

    fireEvent.click(confirm);
    await waitFor(() => expect(within(rowOf(3)).getByText("Public Bus Line")).toBeTruthy());
    await watch.stop();

    expect(watch.seen.loading).toBe(false);
    expect(watch.seen.tableRemoved).toBe(false);
    expect(requests.slice(before).map((r) => `${r.method} ${r.path}`)).toEqual([
      "PATCH /reference-options/travel-mode/3/",
    ]);
  });

  it("a deactivated row leaves the Active filter at once", async () => {
    await open("Vehicle Classification");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "active" } });
    expect(screen.getByTestId("option-row-4")).toBeTruthy();

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Deactivate Ferry / Port Transfer" }));

    await waitFor(() => expect(screen.queryByTestId("option-row-4")).toBeNull());
    expect(screen.getByTestId("option-row-3")).toBeTruthy();
    expect(count("travel-mode")).toBe(1);
  });

  it("a write that fails changes nothing on screen, shows the error, and asks nothing more", async () => {
    await open("Vehicle Classification");
    const tableBefore = screen.getByRole("table").textContent;
    const before = requests.length;
    const watch = watchPage();
    failNext = { status: 500, body: { detail: "The server is having a problem." } };

    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "Deactivate Public Bus" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The server is having a problem.");
    await watch.stop();

    expect(screen.getByRole("table").textContent).toBe(tableBefore);
    expect(within(rowOf(3)).getByText("Active")).toBeTruthy();
    expect(watch.seen.loading).toBe(false);
    expect(watch.seen.tableRemoved).toBe(false);
    expect(requests.length - before).toBe(1);
    expect(refreshReferenceTables).not.toHaveBeenCalled();
  });

  it("a failed add or rename also leaves the list as it was", async () => {
    await open("Vehicle Classification");
    const tableBefore = screen.getByRole("table").textContent;
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "Public Bus" } });
    failNext = { status: 400, body: { detail: "Another option already has this name." } };
    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Another option already has this name.");
    expect(screen.getByRole("table").textContent).toBe(tableBefore);
    expect(screen.getAllByTestId(/^option-row-/)).toHaveLength(4);
  });

  // ---- the most important: what is shown is what the SERVER answered ----

  it("rename shows the server's answer, not what the person typed", async () => {
    await open("Vehicle Classification");
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: "Public Bus Line" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    // the server answers with other values than the page could guess
    answerWith = {
      match: (method, path) => method === "PATCH" && path === "/reference-options/travel-mode/3/",
      body: row(3, "Public Bus Line (as the server holds it)", { record_count: 99, rename_protected: true }),
    };

    fireEvent.click(await screen.findByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(screen.getByText(/as the server holds it/)).toBeTruthy());
    expect(within(rowOf(3)).getByText("99 records")).toBeTruthy(); // not the 6 the page knew
    expect(within(rowOf(3)).getByText("Name set by the import")).toBeTruthy(); // the server's flag
    expect(screen.queryByText("Public Bus Line", { exact: true })).toBeNull(); // not the typed name
  });

  it("deactivate shows the server's answer, not 'I deactivated it, so it is inactive'", async () => {
    await open("Vehicle Classification");
    answerWith = {
      match: (method, path) => method === "POST" && path.endsWith("/travel-mode/3/deactivate/"),
      body: row(3, "Public Bus", { is_active: true, record_count: 8 }), // the server says: still active
    };

    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "Deactivate Public Bus" }));

    await waitFor(() => expect(within(rowOf(3)).getByText("8 records")).toBeTruthy());
    expect(within(rowOf(3)).getByText("Active")).toBeTruthy();
    expect(within(rowOf(3)).queryByText("Inactive")).toBeNull();
  });

  it("reactivate shows the server's answer too", async () => {
    await open("Vehicle Classification");
    answerWith = {
      match: (method, path) => method === "POST" && path.endsWith("/travel-mode/5/reactivate/"),
      body: row(5, "Tourist Van", { is_active: false, record_count: 12 }),
    };

    fireEvent.click(within(rowOf(5)).getByRole("button", { name: "Reactivate Tourist Van" }));

    await waitFor(() => expect(within(rowOf(5)).getByText("12 records")).toBeTruthy());
    expect(within(rowOf(5)).getByText("Inactive")).toBeTruthy();
  });

  it("add shows the server's answer: its id, its name, its fields", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    fireEvent.change(screen.getByLabelText("New option name"), { target: { value: "weekend away" } });
    fireEvent.change(screen.getByLabelText("New option stay length in nights"), { target: { value: "3" } });
    answerWith = {
      match: (method, path) => method === "POST" && path === "/reference-options/itinerary/",
      // id 5 (between 2 and 7), another capitalisation, another stay length
      body: row(5, "Weekend Away", { stay_nights: 2, record_count: 0 }),
    };

    fireEvent.click(screen.getByRole("button", { name: "Save new option" }));

    await screen.findByText("Weekend Away");
    expect(screen.queryByText("weekend away")).toBeNull();
    expect(within(rowOf(5)).getByText("2 nights")).toBeTruthy(); // not the 3 that was sent
    const ids = screen.getAllByTestId(/^option-row-/).map((tr) => tr.getAttribute("data-testid"));
    expect(ids).toEqual(["option-row-1", "option-row-2", "option-row-5", "option-row-7", "option-row-8", "option-row-9", "option-row-12"]);
  });

  // ---- the other pages ----

  it("the other pages are refreshed once per write, in the background: the page does not wait for them", async () => {
    refreshReferenceTables.mockImplementation(() => new Promise(() => {})); // never finishes
    await open("Vehicle Classification");

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Deactivate Ferry / Port Transfer" }));

    await waitFor(() => expect(within(rowOf(4)).getByText("Inactive")).toBeTruthy());
    expect(refreshReferenceTables).toHaveBeenCalledTimes(1);
    // not stuck behind it: the buttons work again
    expect(within(rowOf(3)).getByRole("button", { name: "Deactivate Public Bus" }).disabled).toBe(false);
  });

  it("a refresh of the other pages that fails does not disturb this page", async () => {
    refreshReferenceTables.mockImplementation(() => Promise.reject(new Error("elsewhere")));
    await open("Vehicle Classification");

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Deactivate Ferry / Port Transfer" }));

    await waitFor(() => expect(within(rowOf(4)).getByText("Inactive")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the message area keeps one place, so a message appearing does not move the page", async () => {
    await open("Vehicle Classification");
    const area = document.querySelector(".options-message-area");
    expect(area).not.toBeNull();
    expect(area.childElementCount).toBe(0);

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: "Deactivate Ferry / Port Transfer" }));
    await waitFor(() => expect(within(area).getByRole("status")).toBeTruthy());

    expect(document.querySelectorAll(".options-message-area")).toHaveLength(1); // same element, now with a message
  });
});
