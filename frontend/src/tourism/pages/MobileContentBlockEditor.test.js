// The editor of one block of Mobile App Content (Commit 5b: the Welcome banner). A fake of the server sits behind a fake fetch, so the
// REAL tourismApi / apiRequest build the requests; a test looks at what the person sees AND at the requests that were sent.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MobileContentBlockEditor, { CHECK_NOTICE, NEXT_VERSION_NOTICE, SAVED_NOTICE } from "./MobileContentBlockEditor";
import { BUILT_IN_BLOCKS } from "../utils/mobileContentBuiltIn";

const HINTS = { title: "{name} is replaced, in the app, by the name of the visitor who is logged in. A visitor who is not logged in is greeted as Explorer." };
const WELCOME_TITLE = BUILT_IN_BLOCKS.welcome.title; // "Mabuhay, {name}! (wave)": 18 letters for the server, 19 for .length
const WELCOME_SUBTITLE = BUILT_IN_BLOCKS.welcome.subtitle;
const WAVE = "\u{1F30A}";

const LIMITS = {
  welcome: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true } },
  why_visit: {
    title: { kind: "line", max: 160, required: true },
    subtitle: { kind: "line", max: 300, required: true },
    body: { kind: "text", max: 600, required: true },
  },
};

let state; // what the fake server holds
let requests;

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

const item = (key) => ({
  key,
  name: key,
  ...state.blocks[key],
  fields: Object.keys(LIMITS[key]),
  limits: LIMITS[key],
  allowed_placeholders: {},
});

const line = (text) => text.split(/\s+/).filter(Boolean).join(" ");

function fakeFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^.*\/api/, "");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });
  const patch = path.match(/^\/mobile-content\/blocks\/([a-z_]+)\/$/);
  if (method === "GET" && path === "/mobile-content/blocks/") {
    if (state.failGet) {
      const failure = state.failGet;
      state.failGet = failure.times > 1 ? { ...failure, times: failure.times - 1 } : null;
      return reply(failure.status, failure.body);
    }
    return reply(200, { blocks: Object.keys(state.blocks).map(item), fee: { regular: 80, discounted: 64 }, placeholders: {} });
  }
  if (!(method === "PATCH" && patch)) return reply(404, { detail: "no such route" });
  const respond = () => {
    if (state.failNext) {
      const failure = state.failNext;
      state.failNext = null;
      return reply(failure.status, failure.body);
    }
    if (state.confirmNeeded && !(body.confirm_dropped && body.confirm_dropped.join() === state.confirmNeeded.join())) {
      return reply(409, {
        detail: "This change takes the place where the fee is paid out of the text, so visitors will no longer be told it here. It needs a confirmation.",
        code: "confirm_required",
        dropped: state.confirmNeeded,
      });
    }
    const key = patch[1];
    const warnings = [];
    Object.entries(body).forEach(([field, value]) => {
      if (field === "confirm_dropped") return;
      state.blocks[key][field] = LIMITS[key][field].kind === "text" ? value.trim() : line(value);
    });
    if (state.warn) warnings.push(state.warn);
    return reply(200, { ...item(patch[1]), warnings });
  };
  if (state.hold) {
    const release = state.hold;
    state.hold = null;
    return new Promise((resolve) => release(() => resolve(respond())));
  }
  return respond();
}

beforeEach(() => {
  requests = [];
  state = {
    blocks: {
      welcome: { title: WELCOME_TITLE, subtitle: WELCOME_SUBTITLE, body: "" },
      why_visit: { title: "Why Visit", subtitle: "Sub", body: "One\n\nTwo" },
    },
    failNext: null,
    failGet: null,
    confirmNeeded: null,
    warn: null,
    hold: null,
  };
  global.fetch = jest.fn(fakeFetch);
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function open(props = {}) {
  const view = render(<MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" intro="The greeting." hints={HINTS} {...props} />);
  await screen.findByLabelText(props.blockKey === "why_visit" ? "Title" : "Title");
  return view;
}

const field = (name) => screen.getByLabelText(name);
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const saveButton = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const count = (name) => screen.getByTestId(`count-${name}`).textContent;
const writes = () => requests.filter((r) => r.method !== "GET");
const reads = () => requests.filter((r) => r.method === "GET");

describe("what it shows", () => {
  it("asks for the blocks once, and shows the title and the subtitle the server holds, with no field the app does not show", async () => {
    const { container } = await open();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /mobile-content/blocks/"]);
    expect(field("Title").value).toBe(WELCOME_TITLE);
    expect(field("Subtitle").value).toBe(WELCOME_SUBTITLE);
    expect(screen.queryByLabelText("Text")).toBeNull(); // the welcome has no text: nothing is offered for it
    // a text of one line is held in a box that grows (a textarea of one row), so that all of it can be read: two of them, and no other
    expect([...container.querySelectorAll("textarea")].map((box) => box.getAttribute("aria-label"))).toEqual(["Title", "Subtitle"]);
    container.querySelectorAll("textarea").forEach((box) => expect(box.rows).toBe(1));
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Welcome banner" })).toBeTruthy();
  });

  it("says that changes reach the app only with its next version, and that the check for another editor is not a guarantee", async () => {
    await open();
    const notes = screen.getByRole("note", { name: "About these changes" });
    expect(within(notes).getByText(NEXT_VERSION_NOTICE)).toBeTruthy();
    expect(within(notes).getByText(CHECK_NOTICE)).toBeTruthy();
    expect(CHECK_NOTICE).toMatch(/not a guarantee/);
    expect(CHECK_NOTICE).toMatch(/last save wins/);
  });

  it("says what {name} becomes: the logged-in visitor's own name, and Explorer only for one who is not logged in", async () => {
    await open();
    expect(screen.getByText(HINTS.title)).toBeTruthy();
    expect(HINTS.title).toMatch(/logged in/);
    expect(HINTS.title).toMatch(/not logged in is greeted as Explorer/);
  });

  it("has no maxlength on any field (the browser would count UTF-16 units, the server counts letters)", async () => {
    const { container } = await open();
    container.querySelectorAll("input, textarea").forEach((control) => expect(control.hasAttribute("maxlength")).toBe(false));
  });

  it("shows the server's message and a Try again when the blocks cannot be loaded, then the form when it can", async () => {
    state.failGet = { status: 500, body: { detail: "The server is down." }, times: 1 };
    render(<MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" />);
    await screen.findByText(/The server is down\./);
    expect(screen.queryByLabelText("Title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("Title");
    expect(reads()).toHaveLength(2);
  });

  it("says so when the block is not in the list", async () => {
    render(<MobileContentBlockEditor blockKey="no_such_block" heading="x" />);
    await screen.findByText("This text is not available.");
    expect(screen.queryByRole("form")).toBeNull();
  });
});

describe("the counter counts letters, not UTF-16 units", () => {
  it("shows 18 / 160 for the welcome title, though .length says 19 (the fixture reaches the case)", async () => {
    await open();
    expect(WELCOME_TITLE.length).not.toBe(Array.from(WELCOME_TITLE).length); // inside the test: the fixture reached the case
    expect(WELCOME_TITLE.length).toBe(19);
    expect(count("title")).toBe("18 / 160");
    expect(count("subtitle")).toBe("160 / 300");
  });

  it("160 emoji are allowed in the title: 160 / 160, Save is open, though .length is 320", async () => {
    await open();
    const longest = WAVE.repeat(160);
    expect(longest.length).toBe(320);
    expect(Array.from(longest).length).toBe(160); // inside the test: the two counts differ
    type("Title", longest);
    expect(count("title")).toBe("160 / 160");
    expect(saveButton().disabled).toBe(false);
    expect(screen.queryByText(/Too long/)).toBeNull();
  });

  it("161 emoji are one too many: 161 / 160, Too long by 1 letter, Save is closed", async () => {
    await open();
    const tooLong = WAVE.repeat(161);
    expect(tooLong.length).toBe(322);
    expect(Array.from(tooLong).length).toBe(161); // inside the test: .length would say 322, not 161
    type("Title", tooLong);
    expect(count("title")).toBe("161 / 160");
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    type("Title", WAVE.repeat(163));
    expect(screen.getByText("Too long by 3 letters.")).toBeTruthy();
  });

  it("a family of emoji joined by joiners is counted as the server counts it: 5, not 8", async () => {
    await open();
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(family.length).not.toBe(Array.from(family).length); // inside the test: the fixture reached the case
    type("Title", family);
    expect(count("title")).toBe("5 / 160");
  });

  it("counts the text as the server cleans it: spaces trimmed and runs of spaces made one", async () => {
    await open();
    const typed = "  a    b  ";
    expect(typed.length).toBe(10); // inside the test: the typed text is longer than what is counted
    type("Title", typed);
    expect(count("title")).toBe("3 / 160");
  });

  it("the subtitle's limit is 300", async () => {
    await open();
    type("Subtitle", "x".repeat(300));
    expect(count("subtitle")).toBe("300 / 300");
    expect(saveButton().disabled).toBe(false);
    type("Subtitle", "x".repeat(301));
    expect(count("subtitle")).toBe("301 / 300");
    expect(saveButton().disabled).toBe(true);
  });
});

describe("when Save is open", () => {
  it("is closed when nothing changed, and when only the white space changed", async () => {
    await open();
    expect(saveButton().disabled).toBe(true);
    type("Subtitle", WELCOME_SUBTITLE + "   ");
    expect(saveButton().disabled).toBe(true); // the server would clean it back: nothing changed
    type("Subtitle", WELCOME_SUBTITLE.replace("jewel", "jewel  "));
    expect(saveButton().disabled).toBe(true);
    type("Subtitle", WELCOME_SUBTITLE + "!");
    expect(saveButton().disabled).toBe(false);
    type("Subtitle", WELCOME_SUBTITLE); // typed back
    expect(saveButton().disabled).toBe(true);
  });

  it("is closed, with the server's own words, when a field is empty", async () => {
    await open();
    type("Title", "   ");
    expect(screen.getByText("The title is required.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    type("Title", "x");
    type("Subtitle", "");
    expect(screen.getByText("The subtitle is required.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });
});

describe("saving", () => {
  it("looks again at the server, then sends ONE PATCH with only what changed (cleaned), and shows what the server answered", async () => {
    await open();
    type("Subtitle", "  A   new    line.  ");
    expect(field("Subtitle").value).toBe("  A   new    line.  "); // the fixture: what is typed is not what the server will hold
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /mobile-content/blocks/", // opening
      "GET /mobile-content/blocks/", // the look before saving
      "PATCH /mobile-content/blocks/welcome/",
    ]);
    expect(writes()[0].body).toEqual({ subtitle: "A new line." }); // only the subtitle, cleaned
    expect(field("Subtitle").value).toBe("A new line."); // the server's answer, not the typing
    expect(field("Title").value).toBe(WELCOME_TITLE);
    expect(saveButton().disabled).toBe(true); // nothing is left to save
  });

  it("sends both fields when both changed, and none that did not", async () => {
    await open();
    type("Title", "Hello, {name}!");
    type("Subtitle", "Hi.");
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(Object.keys(writes()[0].body).sort()).toEqual(["subtitle", "title"]);
  });

  it("shows the warnings the server gave", async () => {
    state.warn = "The welcome banner no longer uses the visitor's name, so everyone is greeted the same way.";
    await open();
    type("Title", "Hello!");
    fireEvent.click(saveButton());
    await screen.findByText(state.warn);
    expect(screen.getByText(SAVED_NOTICE)).toBeTruthy();
  });

  it("makes no request to the emergency contacts, opening or saving", async () => {
    await open();
    type("Title", "Hello!");
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(requests.length).toBeGreaterThan(0);
    requests.forEach((r) => expect(r.path.startsWith("/mobile-content/blocks/")).toBe(true));
    expect(requests.filter((r) => r.path.includes("emergency"))).toEqual([]);
  });

  it("is closed while the request is on its way, and a second press in the same moment sends nothing more", async () => {
    await open();
    let finish;
    state.hold = (release) => {
      finish = release;
    };
    type("Title", "Hello!");
    const form = screen.getByRole("form", { name: "Welcome banner" });
    // two submissions before React has drawn again: only the guard of the page can stop the second
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => expect(finish).toBeDefined()); // the one PATCH is waiting for its answer
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().textContent).toBe("Saving...");
    expect(field("Title").disabled).toBe(true);
    finish();
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
    expect(reads()).toHaveLength(2); // opening, and ONE look before saving
  });
});

describe("when the server refuses", () => {
  it("shows its message under the field it names, word for word, and keeps what was typed", async () => {
    state.failNext = {
      status: 400,
      body: { detail: "The title has {fee_ofice}, which the app does not know how to fill in. Did you mean {fee_office}?", title: ["The title has {fee_ofice}, which the app does not know how to fill in. Did you mean {fee_office}?"] },
    };
    await open();
    type("Title", "Pay at the {fee_ofice}");
    fireEvent.click(saveButton());
    const error = await screen.findByTestId("error-title");
    expect(error.textContent).toBe("The title has {fee_ofice}, which the app does not know how to fill in. Did you mean {fee_office}?");
    expect(field("Title").value).toBe("Pay at the {fee_ofice}"); // not lost
    expect(screen.queryByTestId("error-subtitle")).toBeNull();
    expect(screen.queryByText(SAVED_NOTICE)).toBeNull();
    expect(saveButton().disabled).toBe(false); // can be corrected and sent again
  });

  it("clears the message of a field when that field is typed in again", async () => {
    state.failNext = { status: 400, body: { detail: "No.", title: ["No."] } };
    await open();
    type("Title", "Bad");
    fireEvent.click(saveButton());
    await screen.findByTestId("error-title");
    type("Title", "Better");
    expect(screen.queryByTestId("error-title")).toBeNull();
  });

  it("shows a message that names no field, such as 403, above the form, and keeps what was typed", async () => {
    state.failNext = { status: 403, body: { detail: "Only the system admin can manage the content of the mobile app." } };
    await open();
    type("Subtitle", "Changed.");
    fireEvent.click(saveButton());
    const alert = await screen.findByText("Only the system admin can manage the content of the mobile app.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(field("Subtitle").value).toBe("Changed.");
  });

  it("shows the message of a lost connection too", async () => {
    await open();
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    type("Title", "Hello!");
    fireEvent.click(saveButton());
    await screen.findByText(/could not check whether someone else changed the text/);
    expect(field("Title").value).toBe("Hello!");
  });

  it("when the look before saving fails, nothing is saved, and it can be tried again", async () => {
    await open();
    state.failGet = { status: 500, body: { detail: "The server is down." }, times: 1 };
    type("Title", "Hello!");
    fireEvent.click(saveButton());
    await screen.findByText(/Your change was not saved, because this page could not check whether someone else changed the text\. The server is down\./);
    expect(writes()).toEqual([]);
    expect(field("Title").value).toBe("Hello!");
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
  });
});

describe("when the block is gone by the time of the look", () => {
  it("saves nothing, says so, and keeps what was typed", async () => {
    await open();
    type("Title", "Mine.");
    delete state.blocks.welcome; // the look before saving no longer finds it
    fireEvent.click(saveButton());
    await screen.findByText("This text is not available.");
    expect(writes()).toEqual([]);
    expect(field("Title").value).toBe("Mine.");
  });
});

describe("a change that needs a confirmation (409)", () => {
  beforeEach(() => {
    state.confirmNeeded = ["fee_office"];
  });

  it("shows the server's question, sends nothing more, and Cancel leaves what was typed", async () => {
    await open();
    type("Title", "No place named.");
    fireEvent.click(saveButton());
    const question = await screen.findByRole("alertdialog", { name: "Confirm the change" });
    expect(within(question).getByText(/takes the place where the fee is paid out of the text/)).toBeTruthy();
    expect(writes()).toHaveLength(1); // the one that was refused
    expect(writes()[0].body).toEqual({ title: "No place named." });
    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(field("Title").value).toBe("No place named.");
    expect(writes()).toHaveLength(1);
  });

  it("Confirm sends the same change again with the names the server asked about, and shows the server's answer", async () => {
    await open();
    type("Title", "  No   place named.");
    fireEvent.click(saveButton());
    const question = await screen.findByRole("alertdialog", { name: "Confirm the change" });
    fireEvent.click(within(question).getByRole("button", { name: "Confirm" }));
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([
      { title: "No place named." },
      { title: "No place named.", confirm_dropped: ["fee_office"] },
    ]);
    expect(field("Title").value).toBe("No place named.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("typing again takes the question away: it was about the old text", async () => {
    await open();
    type("Title", "No place named.");
    fireEvent.click(saveButton());
    await screen.findByRole("alertdialog", { name: "Confirm the change" });
    type("Title", "No place named!");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("someone else changed the same text while it was open", () => {
  it("does NOT save: it shows what the other person wrote and what is typed, and says this is not a guarantee", async () => {
    await open();
    type("Title", "Mine.");
    state.blocks.welcome.title = "Theirs.";
    fireEvent.click(saveButton());
    const box = await screen.findByRole("alertdialog", { name: "Someone else changed this text" });
    expect(writes()).toEqual([]); // not one PATCH
    expect(box.textContent).toContain("Someone else changed the title since you opened it. It now says: “Theirs.” Yours says: “Mine.”");
    expect(box.textContent).toContain("This check is not a guarantee");
    expect(field("Title").value).toBe("Mine."); // not lost
  });

  it("Save my text anyway sends it, only my fields, and shows the server's answer", async () => {
    await open();
    type("Title", "Mine.");
    state.blocks.welcome.title = "Theirs.";
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Save my text anyway" }));
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "Mine." }]);
    expect(field("Title").value).toBe("Mine.");
    expect(reads()).toHaveLength(2); // opening, and the look; the forced save does not look again
  });

  it("Keep editing sends nothing, keeps my text, and the next Save compares with what is there now", async () => {
    await open();
    type("Title", "Mine.");
    state.blocks.welcome.title = "Theirs.";
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Keep editing" }));
    expect(writes()).toEqual([]);
    expect(field("Title").value).toBe("Mine.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(saveButton()); // now it is checked against "Theirs.": nothing has changed since
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "Mine." }]);
  });

  it("a text I did NOT change, changed by the other person, is no clash: mine is sent, and theirs shows after", async () => {
    await open();
    type("Title", "Mine.");
    state.blocks.welcome.subtitle = "Their new subtitle.";
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "Mine." }]); // only mine
    expect(field("Subtitle").value).toBe("Their new subtitle."); // theirs, from the server's answer
  });

  it("Keep editing brings the fields I did not touch up to what the server holds now", async () => {
    await open();
    type("Title", "Mine.");
    state.blocks.welcome.title = "Theirs.";
    state.blocks.welcome.subtitle = "Their new subtitle.";
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole("button", { name: "Keep editing" }));
    expect(field("Subtitle").value).toBe("Their new subtitle.");
    expect(field("Title").value).toBe("Mine.");
  });
});

describe("the same editor on a block with a text of paragraphs", () => {
  it("shows a text box for it, counts it by letters with a limit of 600, and cleans it as the server does", async () => {
    await open({ blockKey: "why_visit", heading: "Why Visit" });
    const body = field("Text");
    expect(body.tagName).toBe("TEXTAREA");
    expect(body.value).toBe("One\n\nTwo");
    expect(count("body")).toBe("8 / 600");
    type("Text", "One  \n\n\n\n\nTwo");
    expect(count("body")).toBe("8 / 600"); // the same text once cleaned: "One\n\nTwo"
    expect(saveButton().disabled).toBe(true);
    type("Text", "x".repeat(601));
    expect(count("body")).toBe("601 / 600");
    expect(saveButton().disabled).toBe(true);
    type("Text", `${WAVE.repeat(600)}`);
    expect(WAVE.repeat(600).length).toBe(1200); // inside the test: .length would be twice the limit
    expect(count("body")).toBe("600 / 600");
    expect(saveButton().disabled).toBe(false);
  });
});
