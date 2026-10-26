// The preview, the built-in column, the button that fills the form with the app's own text, and the buttons and the warnings for the
// placeholders (Commit 5c). The REAL tourismApi builds the requests; a fake server answers. Every test with a fixture asserts, inside the
// test, that the fixture reached the case it is meant to test.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import MobileContentBlockEditor, {
  BUILT_IN_BUTTON,
  BUILT_IN_BUTTON_NOTE,
  BUILT_IN_ONLY,
  FEE_NOTE,
  FILLED_NOTE,
  NAME_NOTE,
  OFFICE_NOTE,
  PREVIEW_EMPTY,
  PREVIEW_INSTEAD,
  SAVED_NOTICE,
} from "./MobileContentBlockEditor";
import { BUILT_IN_BLOCKS } from "../utils/mobileContentBuiltIn";

const WELCOME = { title: "Mabuhay, {name}! \u{1F30A}", subtitle: "Welcome (a text the LGU saved before)." };
const OFFICE = "Tourism Office, 2nd Floor, Mauban Municipal Hall";
const NOTES = {
  name: "The visitor's name (a guest is called Explorer). The app fills it in; it belongs to the welcome banner only.",
  fee_regular: "The regular entrance fee. The server fills in the amount the reports use; it cannot be typed.",
  fee_discounted: "The discounted entrance fee. The server fills in the amount the reports use; it cannot be typed.",
  fee_office: "The place where the fee is paid. It is written once, in its own block, and filled in wherever this is used.",
};
const ALLOWED = {
  welcome: { title: ["fee_regular", "fee_discounted", "fee_office", "name"], subtitle: ["fee_regular", "fee_discounted", "fee_office", "name"] },
  why_visit: { title: ["fee_regular", "fee_discounted", "fee_office"], subtitle: ["fee_regular", "fee_discounted", "fee_office"], body: ["fee_regular", "fee_discounted", "fee_office"] },
};
const LIMITS = {
  welcome: { title: { kind: "line", max: 160, required: true }, subtitle: { kind: "line", max: 300, required: true } },
  why_visit: {
    title: { kind: "line", max: 160, required: true },
    subtitle: { kind: "line", max: 300, required: true },
    body: { kind: "text", max: 600, required: true },
  },
};

let state;
let requests;

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

const item = (key) => ({ key, name: key, ...state.blocks[key], fields: Object.keys(LIMITS[key]), limits: LIMITS[key], allowed_placeholders: state.allowed[key] });

function fakeFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^.*\/api/, "");
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });
  if (method === "GET" && path === "/mobile-content/blocks/") {
    if (state.failGet) return reply(state.failGet.status, state.failGet.body);
    const blocks = Object.keys(state.blocks).map(item);
    if (state.office !== undefined) blocks.push({ key: "fee_office", name: "Place", title: "", subtitle: "", body: state.office, fields: ["body"], limits: {}, allowed_placeholders: {} });
    return reply(200, { blocks, fee: state.fee, placeholders: NOTES });
  }
  const patch = path.match(/^\/mobile-content\/blocks\/([a-z_]+)\/$/);
  if (method === "PATCH" && patch) {
    Object.entries(body).forEach(([field, value]) => {
      state.blocks[patch[1]][field] = value;
    });
    return reply(200, { ...item(patch[1]), warnings: [] });
  }
  return reply(404, { detail: "no such route" });
}

beforeEach(() => {
  requests = [];
  state = {
    blocks: { welcome: { ...WELCOME, body: "" }, why_visit: { title: "T", subtitle: "S", body: "B" } },
    allowed: ALLOWED,
    fee: { regular: 80, discounted: 64 },
    office: OFFICE,
    failGet: null,
  };
  global.fetch = jest.fn(fakeFetch);
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function open(props = {}) {
  const view = render(
    <MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" builtIn={BUILT_IN_BLOCKS.welcome} {...props} />
  );
  await screen.findByLabelText("Title");
  return view;
}

const field = (name) => screen.getByLabelText(name);
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const saveButton = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const preview = (name) => screen.getByTestId(`preview-${name}`);
const builtIn = (name) => screen.getByTestId(`builtin-${name}`);
const writes = () => requests.filter((r) => r.method !== "GET");
const marks = (container, kind) => [...container.querySelectorAll(`[data-kind="${kind}"]`)].map((node) => node.textContent);

describe("the preview, when everything can be filled in", () => {
  it("shows the typed text with the amounts, the place and the guest's name filled in, and says where they come from", async () => {
    await open();
    type("Subtitle", "Fee {fee_regular}, or {fee_discounted} if you qualify. Pay at the {fee_office}.");
    const shown = preview("subtitle");
    expect(shown.textContent).toContain(`Fee ₱80, or ₱64 if you qualify. Pay at the ${OFFICE}.`);
    expect(shown.textContent).not.toContain("{fee_");
    expect(marks(shown, "filled")).toEqual(["₱80", "₱64", OFFICE]);
    expect(screen.getByText(FILLED_NOTE)).toBeTruthy();
    expect(preview("title").textContent).toContain("Mabuhay, Explorer! \u{1F30A}");
  });

  it("follows what is typed, and is cleaned as the server cleans it", async () => {
    await open();
    const typed = "  Hello    there  ";
    expect(typed).not.toBe("Hello there"); // the fixture: what is typed is not what will be held
    type("Title", typed);
    expect(preview("title").textContent).toContain("Hello there");
    expect(preview("title").textContent).not.toContain("Hello    there");
  });

  it("amounts follow the system: another fee, another amount", async () => {
    state.fee = { regular: 90, discounted: 72 };
    await open();
    type("Subtitle", "{fee_regular} / {fee_discounted}");
    expect(preview("subtitle").textContent).toContain("₱90 / ₱72");
  });

  it("says who Explorer is whenever the name is shown, in the agreed words, and not when it is not", async () => {
    await open();
    expect(NAME_NOTE).toMatch(/not logged in/);
    expect(NAME_NOTE).toMatch(/logged in sees their own name/);
    expect(preview("title").textContent).toContain("Explorer"); // the fixture: the name IS shown
    expect(screen.getAllByText(NAME_NOTE).length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByLabelText("What the app will show")).getByText(NAME_NOTE)).toBeTruthy();
    type("Title", "Mabuhay!");
    expect(within(screen.getByLabelText("What the app will show")).queryByText(NAME_NOTE)).toBeNull();
  });

  it("does not mention the amounts when there are none in the text", async () => {
    await open();
    expect(screen.queryByText(FILLED_NOTE)).toBeNull();
  });
});

describe("state: the place where the fee is paid is empty or missing", () => {
  const typeOffice = () => type("Subtitle", "Pay at the {fee_office}.");

  it("shows the app's built-in text instead of that field, muted, with the agreed words, and the other fields as usual", async () => {
    state.office = undefined; // there is no such block in the answer
    await open();
    typeOffice();
    const shown = preview("subtitle");
    expect(shown.textContent).toContain(PREVIEW_INSTEAD);
    expect(PREVIEW_INSTEAD).toBe("What the app will show instead (its built-in text)");
    expect(shown.textContent).toContain(BUILT_IN_BLOCKS.welcome.subtitle);
    expect(shown.textContent).not.toContain("Pay at the");
    expect(preview("title").textContent).not.toContain(PREVIEW_INSTEAD);
    expect(screen.getByText(OFFICE_NOTE)).toBeTruthy();
    expect(OFFICE_NOTE).toBe(
      "The place where the fee is paid is not filled in yet (Port & Boat Guide tab), so the app cannot show this text. Until it is, the app keeps using its built-in text. You can still save this text."
    );
  });

  it("is the same when the place is blank", async () => {
    state.office = "   ";
    await open();
    typeOffice();
    expect(preview("subtitle").textContent).toContain(PREVIEW_INSTEAD);
    expect(screen.getByText(OFFICE_NOTE)).toBeTruthy();
  });

  it("does not stop the save: the text is accepted by the server, and Save is open", async () => {
    state.office = undefined;
    await open();
    typeOffice();
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()[0].body).toEqual({ subtitle: "Pay at the {fee_office}." });
  });

  it("says nothing about the place when the text does not use it, even though the place is missing", async () => {
    state.office = undefined;
    await open();
    expect(screen.queryByText(OFFICE_NOTE)).toBeNull(); // the fixture: the place IS missing and the note is not shown
    type("Subtitle", "Fee {fee_regular}.");
    expect(screen.queryByText(OFFICE_NOTE)).toBeNull();
    expect(preview("subtitle").textContent).toContain("Fee ₱80.");
  });
});

describe("state: the entrance fee could not be read", () => {
  it("puts [fee not available] where the amount goes, with the agreed words, and Save stays open", async () => {
    state.fee = null;
    await open();
    type("Subtitle", "Fee {fee_regular} or {fee_discounted}.");
    const shown = preview("subtitle");
    expect(marks(shown, "missing")).toEqual(["[fee not available]", "[fee not available]"]);
    expect(screen.getByText(FEE_NOTE)).toBeTruthy();
    expect(FEE_NOTE).toBe(
      "The current entrance fee could not be loaded, so [fee not available] stands where the amount will be. The app will show the real amount. You can still save."
    );
    expect(saveButton().disabled).toBe(false);
  });

  it("only the amount that is missing is marked", async () => {
    state.fee = { regular: null, discounted: 64 };
    await open();
    type("Subtitle", "{fee_regular} or {fee_discounted}");
    expect(preview("subtitle").textContent).toContain("[fee not available] or ₱64");
  });

  it("says nothing when the text uses no amount", async () => {
    state.fee = null;
    await open();
    expect(screen.queryByText(FEE_NOTE)).toBeNull(); // the fixture: the fee IS missing and the note is not shown
  });
});

describe("state: a required field is empty", () => {
  it("says there is nothing to show yet, in the preview of that field only", async () => {
    await open();
    type("Title", "   ");
    expect(preview("title").textContent).toContain(PREVIEW_EMPTY);
    expect(PREVIEW_EMPTY).toBe("Nothing to show yet: this field is required.");
    expect(preview("subtitle").textContent).not.toContain(PREVIEW_EMPTY);
    expect(preview("title").textContent.trim()).not.toBe("Title"); // not an empty place
  });
});

describe("state: a placeholder that is not allowed, or a bracket with no partner", () => {
  it("warns under the field, in the agreed words, marks it in the preview, and does not stop the save", async () => {
    await open();
    type("Title", "Pay at the {fee_ofice}");
    const warning = screen.getByTestId("warning-title");
    expect(warning.textContent).toBe("{fee_ofice} is not one of the placeholders listed above, so this text will be refused when you save.");
    expect(marks(preview("title"), "unknown")).toEqual(["{fee_ofice}"]);
    expect(saveButton().disabled).toBe(false); // a warning, not a refusal: the server decides
  });

  it("warns about a bracket with no partner", async () => {
    await open();
    type("Subtitle", "Pay at {fee_regular and {fee_office}");
    expect(screen.getByTestId("warning-subtitle").textContent).toBe(
      "A curly bracket in this text has no partner, so this text will be refused when you save."
    );
    expect(saveButton().disabled).toBe(false);
  });

  it("warns about every one of the six malformed ones", async () => {
    await open();
    for (const text of ["{{fee_regular}}", "{ fee_regular }", "{fee_regular }", "{ fee_regular}", "{FEE_REGULAR}", "{{name}}"]) {
      type("Subtitle", text);
      expect({ text, warned: screen.queryAllByTestId("warning-subtitle").length > 0 }).toEqual({ text, warned: true });
    }
  });

  it("does not warn about a well-formed text, nor about a fee amount typed by hand (only the server says that)", async () => {
    await open();
    type("Subtitle", "Pay {fee_regular} at the {fee_office}.");
    expect(screen.queryByTestId("warning-subtitle")).toBeNull();
    type("Subtitle", "Pay P80 at the desk.");
    expect(screen.queryByTestId("warning-subtitle")).toBeNull(); // the fixture: this IS refused by the server, the page leaves that to it
  });

  it("a field that does not allow {name} warns about it", async () => {
    await open({ blockKey: "why_visit", heading: "Why Visit", builtIn: BUILT_IN_BLOCKS.why_visit });
    type("Title", "Hi {name}");
    expect(screen.getByTestId("warning-title").textContent).toBe(
      "{name} is not one of the placeholders listed above, so this text will be refused when you save."
    );
  });
});

describe("state: the content cannot be loaded", () => {
  it("still shows the app's built-in text, and says it is the only thing shown, with Try again; no form, no preview", async () => {
    state.failGet = { status: 500, body: { detail: "The server is down." } };
    render(<MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" builtIn={BUILT_IN_BLOCKS.welcome} />);
    await screen.findByText(/The server is down\./);
    expect(builtIn("title").textContent).toContain("Mabuhay, Explorer! \u{1F30A}");
    expect(builtIn("subtitle").textContent).toContain(BUILT_IN_BLOCKS.welcome.subtitle);
    expect(screen.getByText(BUILT_IN_ONLY)).toBeTruthy();
    expect(BUILT_IN_ONLY).toBe("Showing the app's built-in text only.");
    expect(screen.queryByLabelText("Title")).toBeNull(); // the fixture: there is no form
    expect(screen.queryByLabelText("What the app will show")).toBeNull();
    expect(screen.queryByRole("button", { name: BUILT_IN_BUTTON })).toBeNull(); // nothing to fill
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("when it can be loaded again, the form, the preview and the button appear, and the note goes", async () => {
    state.failGet = { status: 500, body: { detail: "The server is down." } };
    render(<MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" builtIn={BUILT_IN_BLOCKS.welcome} />);
    await screen.findByText(/The server is down\./);
    state.failGet = null;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("Title");
    expect(screen.queryByText(BUILT_IN_ONLY)).toBeNull();
    expect(screen.getByLabelText("What the app will show")).toBeTruthy();
    expect(screen.getByRole("button", { name: BUILT_IN_BUTTON })).toBeTruthy();
  });

  it("is shown while it is still loading, too", async () => {
    render(<MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" builtIn={BUILT_IN_BLOCKS.welcome} />);
    expect(builtIn("title").textContent).toContain("Explorer"); // before any answer
    await settled();
  });

  it("the block missing from the list is no different", async () => {
    render(<MobileContentBlockEditor blockKey="no_such_block" heading="x" builtIn={BUILT_IN_BLOCKS.welcome} />);
    await screen.findByText("This text is not available.");
    expect(builtIn("title")).toBeTruthy();
  });
});

describe("the built-in column", () => {
  it("shows the app's text for every field the page edits, as a guest reads it, and says who Explorer is", async () => {
    await open();
    expect(screen.getByLabelText("What the app shows now (built-in text)")).toBeTruthy();
    expect(builtIn("title").textContent).toContain("Mabuhay, Explorer! \u{1F30A}");
    expect(builtIn("subtitle").textContent).toContain(BUILT_IN_BLOCKS.welcome.subtitle);
    expect(within(screen.getByLabelText("What the app shows now (built-in text)")).getByText(NAME_NOTE)).toBeTruthy();
    expect(screen.queryByTestId("builtin-body")).toBeNull(); // the welcome has no text to show
  });

  it("is not there when the page is not given the app's text", async () => {
    await open({ builtIn: undefined });
    expect(screen.queryByLabelText("What the app shows now (built-in text)")).toBeNull();
    expect(screen.queryByRole("button", { name: BUILT_IN_BUTTON })).toBeNull();
  });
});

describe("the button that puts the app's built-in text into the form", () => {
  it("only fills the form: the template with its placeholder, and not one request is sent", async () => {
    await open();
    expect(field("Subtitle").value).not.toBe(BUILT_IN_BLOCKS.welcome.subtitle); // the fixture: the saved text differs from the built-in
    const before = requests.length;
    fireEvent.click(screen.getByRole("button", { name: BUILT_IN_BUTTON }));
    expect(field("Title").value).toBe(BUILT_IN_BLOCKS.welcome.title);
    expect(field("Title").value).toContain("{name}");
    expect(field("Subtitle").value).toBe(BUILT_IN_BLOCKS.welcome.subtitle);
    expect(requests.length).toBe(before);
    expect(screen.getByText(BUILT_IN_BUTTON_NOTE)).toBeTruthy();
    expect(BUILT_IN_BUTTON_NOTE).toBe("This only fills the form. Press Save to keep it.");
    expect(state.blocks.welcome.subtitle).toBe(WELCOME.subtitle); // nothing was saved
  });

  it("then needs the Save, which sends only what differs from what is saved", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: BUILT_IN_BUTTON }));
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ subtitle: BUILT_IN_BLOCKS.welcome.subtitle }]); // the title was the same already
    expect(state.blocks.welcome.subtitle).toBe(BUILT_IN_BLOCKS.welcome.subtitle);
  });

  it("leaves Save closed when the form already holds the app's text", async () => {
    state.blocks.welcome = { title: BUILT_IN_BLOCKS.welcome.title, subtitle: BUILT_IN_BLOCKS.welcome.subtitle, body: "" };
    await open();
    fireEvent.click(screen.getByRole("button", { name: BUILT_IN_BUTTON }));
    expect(saveButton().disabled).toBe(true);
  });

  it("clears the server's message of a field it replaces", async () => {
    await open();
    type("Title", "Bad {x}");
    fireEvent.click(saveButton());
    // (the fake accepts anything; make the message by hand through a refusal)
    global.fetch = jest.fn(() => reply(400, { detail: "No.", title: ["No."] }));
    type("Title", "Bad {y}");
    fireEvent.click(saveButton());
    await screen.findByTestId("error-title");
    fireEvent.click(screen.getByRole("button", { name: BUILT_IN_BUTTON }));
    expect(screen.queryByTestId("error-title")).toBeNull();
    await settled();
  });
});

describe("the buttons that put a placeholder in", () => {
  it("are the ones the SERVER allows for that field, with its note as the hint", async () => {
    await open();
    const group = screen.getByRole("group", { name: "Placeholders for the title" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["{fee_regular}", "{fee_discounted}", "{fee_office}", "{name}"]);
    expect(within(group).getByRole("button", { name: "Put in {name} in the title" }).title).toBe(NOTES.name);
  });

  it("follow what the server says: another list, other buttons", async () => {
    state.allowed = { ...ALLOWED, welcome: { title: ["fee_office"], subtitle: [] } };
    await open();
    expect(within(screen.getByRole("group", { name: "Placeholders for the title" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["{fee_office}"]);
    expect(screen.queryByRole("group", { name: "Placeholders for the subtitle" })).toBeNull(); // the fixture: an empty list, no group
  });

  it("a field that does not allow {name} has no button for it", async () => {
    await open({ blockKey: "why_visit", heading: "Why Visit", builtIn: BUILT_IN_BLOCKS.why_visit });
    const group = screen.getByRole("group", { name: "Placeholders for the title" });
    expect(within(group).queryByRole("button", { name: /\{name\}/ })).toBeNull();
    expect(within(group).getAllByRole("button")).toHaveLength(3);
  });

  it("put the placeholder at the caret, and the caret after it", async () => {
    await open();
    const box = field("Subtitle");
    type("Subtitle", "Pay at the .");
    box.setSelectionRange(11, 11);
    expect(box.selectionStart).toBe(11); // the fixture: the caret is in the middle
    fireEvent.click(screen.getByRole("button", { name: "Put in {fee_office} in the subtitle" }));
    expect(field("Subtitle").value).toBe("Pay at the {fee_office}.");
    expect(field("Subtitle").selectionStart).toBe(11 + "{fee_office}".length);
    expect(document.activeElement).toBe(field("Subtitle"));
    expect(preview("subtitle").textContent).toContain(OFFICE);
  });

  it("replace what is selected", async () => {
    await open();
    type("Subtitle", "Pay XXXX now");
    field("Subtitle").setSelectionRange(4, 8);
    expect(field("Subtitle").value.slice(4, 8)).toBe("XXXX"); // the fixture: something is selected
    fireEvent.click(screen.getByRole("button", { name: "Put in {fee_regular} in the subtitle" }));
    expect(field("Subtitle").value).toBe("Pay {fee_regular} now");
  });

  it("are closed while a request is on its way", async () => {
    await open();
    type("Title", "Hello!");
    let finish;
    const real = global.fetch;
    global.fetch = jest.fn((url, options = {}) => {
      if (options.method === "PATCH") return new Promise((resolve) => (finish = () => resolve(real(url, options))));
      return real(url, options);
    });
    fireEvent.click(saveButton());
    await settled();
    expect(screen.getByRole("button", { name: "Put in {name} in the title" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: BUILT_IN_BUTTON }).disabled).toBe(true);
    finish();
    await screen.findByText(SAVED_NOTICE);
  });
});
