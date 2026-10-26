// A text of ONE line (the title and the subtitle) is held in a box that grows with its text and wraps it, so that all of it can be read, and
// it STAYS one line (Commit 5c-fix). What is sent to the server is exactly what it was: the typed text cleaned as the server cleans it.
// The REAL tourismApi builds the requests; a fake server answers. Every test with a fixture asserts, inside the test, that it reached the case.
import { act, fireEvent, render, screen } from "@testing-library/react";
import MobileContentBlockEditor, { SAVED_NOTICE } from "./MobileContentBlockEditor";
import { BUILT_IN_BLOCKS } from "../utils/mobileContentBuiltIn";

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
  return Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
}
const item = (key) => ({ key, name: key, ...state[key], fields: Object.keys(LIMITS[key]), limits: LIMITS[key], allowed_placeholders: {} });
const line = (text) => text.split(/\s+/).filter(Boolean).join(" ");

beforeEach(() => {
  requests = [];
  state = {
    welcome: { title: BUILT_IN_BLOCKS.welcome.title, subtitle: BUILT_IN_BLOCKS.welcome.subtitle, body: "" },
    why_visit: { title: "T", subtitle: "S", body: "One\n\nTwo" },
  };
  global.fetch = jest.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const path = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path, body, raw: options.body });
    if (method === "GET") return reply(200, { blocks: Object.keys(state).map(item), fee: { regular: 80, discounted: 64 }, placeholders: {} });
    const key = path.match(/blocks\/([a-z_]+)\//)[1];
    Object.entries(body).forEach(([field, value]) => {
      state[key][field] = LIMITS[key][field].kind === "text" ? value.trim() : line(value);
    });
    return reply(200, { ...item(key), warnings: [] });
  });
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function open(props = {}) {
  const view = render(<MobileContentBlockEditor blockKey="welcome" heading="Welcome banner" {...props} />);
  await screen.findByLabelText("Title");
  return view;
}
const field = (name) => screen.getByLabelText(name);
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const save = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const writes = () => requests.filter((r) => r.method !== "GET");

describe("the title and the subtitle are boxes that wrap, of one row to begin with", () => {
  it("are textareas of one row, with the classes that make them look like the other boxes, and no maxlength", async () => {
    await open();
    for (const name of ["Title", "Subtitle"]) {
      expect(field(name).tagName).toBe("TEXTAREA");
      expect(field(name).rows).toBe(1);
      expect(field(name).className).toBe("mobile-content-line");
      expect(field(name).hasAttribute("maxlength")).toBe(false);
    }
  });

  it("a text of paragraphs is not one of them: its box keeps its rows, and Enter works in it", async () => {
    await open({ blockKey: "why_visit", heading: "Why Visit" });
    expect(field("Text").tagName).toBe("TEXTAREA");
    expect(field("Text").rows).toBe(6);
    expect(field("Text").className).not.toContain("mobile-content-line");
    expect(fireEvent.keyDown(field("Text"), { key: "Enter" })).toBe(true); // not cancelled: a new line is allowed here
    type("Text", "One\n\nTwo\n\nThree");
    expect(field("Text").value).toBe("One\n\nTwo\n\nThree"); // the new lines are kept
  });
});

describe("Enter does not add a new line", () => {
  it("in the title and in the subtitle the key is cancelled, whatever it is pressed with, and nothing is sent", async () => {
    await open();
    for (const name of ["Title", "Subtitle"]) {
      for (const keys of [{}, { shiftKey: true }, { ctrlKey: true }, { altKey: true }]) {
        const accepted = fireEvent.keyDown(field(name), { key: "Enter", ...keys });
        expect({ name, keys, accepted }).toEqual({ name, keys, accepted: false }); // false = the page cancelled the key
      }
    }
    expect(requests.map((r) => r.method)).toEqual(["GET"]); // Enter saved nothing either
    expect(field("Title").value).toBe(BUILT_IN_BLOCKS.welcome.title);
  });

  it("other keys are not cancelled", async () => {
    await open();
    for (const key of ["a", " ", "Tab", "Backspace", "ArrowLeft", "Escape"]) {
      expect({ key, accepted: fireEvent.keyDown(field("Title"), { key }) }).toEqual({ key, accepted: true });
    }
  });

  it("Enter that belongs to a keyboard still composing a letter is left alone", async () => {
    await open();
    expect(fireEvent.keyDown(field("Title"), { key: "Enter", isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(field("Title"), { key: "Enter", isComposing: false })).toBe(false); // the fixture: the same key, not composing, is cancelled
  });

  it("a new line that comes in another way (a paste, a keyboard) becomes a space, in the box and in what is sent", async () => {
    await open();
    for (const [typed, shown] of [
      ["Line one\nLine two", "Line one Line two"],
      ["Line one\r\nLine two", "Line one Line two"],
      ["Line one\rLine two", "Line one Line two"],
      ["A\n\n\nB", "A   B"],
      ["\nStart", " Start"],
    ]) {
      expect(/[\r\n]/.test(typed)).toBe(true); // inside the test: what is typed HAS a new line
      type("Title", typed);
      expect(field("Title").value).toBe(shown);
      expect(/[\r\n]/.test(field("Title").value)).toBe(false);
    }
    type("Subtitle", "First part\nSecond part\r\nThird");
    expect(/[\r\n]/.test(field("Subtitle").value)).toBe(false);
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({ title: "Start", subtitle: "First part Second part Third" }); // the server's own cleaning, as before
    expect(/\\n|\\r/.test(writes()[0].raw)).toBe(false); // not a new line anywhere in the request
  });
});

describe("what the box itself does with a carriage return", () => {
  it("a textarea turns CR LF and CR into LF by itself, so the page only ever meets LF (the page also handles the other two, as a second line of defence)", async () => {
    await open();
    const box = field("Title");
    box.value = "a\r\nb\rc";
    expect(box.value).toBe("a\nb\nc"); // the fixture: the box has already done it, before any code of this page runs
    expect(/\r/.test(box.value)).toBe(false);
  });
});

describe("a long text is not lost", () => {
  const exactly300 = () => `${"word ".repeat(59)}abcde`; // 59 x 5 + 5 = 300 letters, single spaces

  it("300 letters (the most a subtitle can have) are all sent, word for word, and all shown after", async () => {
    await open();
    const typed = exactly300();
    expect(Array.from(typed).length).toBe(300); // inside the test: the fixture is the longest text allowed
    expect(typed.length).toBeGreaterThan(160); // and longer than what the old box showed on one line
    type("Subtitle", typed);
    expect(screen.getByTestId("count-subtitle").textContent).toBe("300 / 300");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()[0].body).toEqual({ subtitle: typed });
    expect(writes()[0].body.subtitle).toHaveLength(300);
    expect(field("Subtitle").value).toBe(typed); // the server's answer, whole
  });

  it("300 letters with no space at all are sent whole too", async () => {
    await open();
    const typed = "x".repeat(300);
    type("Subtitle", typed);
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()[0].body.subtitle).toBe(typed);
  });

  it("300 emoji (600 for .length) are 300 letters and are sent whole", async () => {
    await open();
    const typed = "\u{1F30A}".repeat(300);
    expect(typed.length).toBe(600); // inside the test: .length would say twice the limit
    expect(Array.from(typed).length).toBe(300);
    type("Subtitle", typed);
    expect(screen.getByTestId("count-subtitle").textContent).toBe("300 / 300");
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()[0].body.subtitle).toBe(typed);
  });

  it("160 letters in the title, and what is over the limit still closes Save", async () => {
    await open();
    type("Title", "t".repeat(160));
    expect(save().disabled).toBe(false);
    type("Title", "t".repeat(161));
    expect(save().disabled).toBe(true);
  });

  it("is sent exactly as it was before the box changed: cleaned the same way", async () => {
    await open();
    type("Subtitle", "  A   new    line.  ");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes()[0].body).toEqual({ subtitle: "A new line." });
  });
});

describe("the box grows with its text and shrinks with it", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const LINE = 20;
  const PER_ROW = 50; // letters that fit in one row of the box in this test

  beforeEach(() => {
    // jsdom has no layout: a box whose text height is its number of rows of PER_ROW letters, as a real textarea reports it
    // (a box that is taller than its text reports its own height, so a box that was not made small first cannot shrink)
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        if (this.tagName !== "TEXTAREA") return 0;
        const content = Math.max(1, Math.ceil(Array.from(this.value).length / PER_ROW)) * LINE;
        const fixed = this.style.height && this.style.height !== "auto" ? parseInt(this.style.height, 10) : 0;
        return Math.max(content, fixed);
      },
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, "scrollHeight", original);
    else delete HTMLElement.prototype.scrollHeight;
  });

  const height = (name) => parseInt(field(name).style.height, 10);

  it("starts as high as the text it holds", async () => {
    await open();
    expect(Array.from(BUILT_IN_BLOCKS.welcome.subtitle).length).toBe(160); // the fixture: four rows of 50
    expect(height("Subtitle")).toBe(4 * LINE);
    expect(height("Title")).toBe(1 * LINE);
  });

  it("grows while typing, up to the rows the longest allowed text needs, and shrinks when the text gets short", async () => {
    await open();
    type("Subtitle", "x".repeat(300));
    expect(height("Subtitle")).toBe(6 * LINE); // 300 letters, six rows: all of it can be seen
    type("Subtitle", "x".repeat(10));
    expect(height("Subtitle")).toBe(1 * LINE); // it shrank: the fixture is a box that was taller before
    type("Subtitle", "x".repeat(120));
    expect(height("Subtitle")).toBe(3 * LINE);
  });

  it("grows the title too", async () => {
    await open();
    type("Title", "y".repeat(160));
    expect(height("Title")).toBe(4 * LINE);
  });

  it("fits again when the window changes its width (the text wraps differently)", async () => {
    await open();
    expect(height("Subtitle")).toBe(4 * LINE);
    const wider = 80; // letters per row after the window got wider: the same 160 letters now take two rows
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        if (this.tagName !== "TEXTAREA") return 0;
        const content = Math.max(1, Math.ceil(Array.from(this.value).length / wider)) * LINE;
        const fixed = this.style.height && this.style.height !== "auto" ? parseInt(this.style.height, 10) : 0;
        return Math.max(content, fixed);
      },
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(height("Subtitle")).toBe(2 * LINE);
  });

  it("leaves a box of paragraphs as the browser makes it", async () => {
    await open({ blockKey: "why_visit", heading: "Why Visit" });
    expect(field("Text").style.height).toBe("");
    await settled();
  });
});
