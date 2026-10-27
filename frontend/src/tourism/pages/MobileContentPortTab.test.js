// The tab "Port & Boat Guide" (Commit 8b), Paraan A: the four lines of the body, each in a box of its own by position; the body built again with a new line; the
// fallback to ONE box of lines when the server does not hold four; the title; the place where the fee is paid; the box of the fee that cannot be changed here;
// the preview. A fake of the server sits behind a fake fetch, so the REAL tourismApi builds the requests. The seed and the real appContent are READ: the four
// lines of the seed must come back exactly after a round trip, and the preview must say what the real appContent says. Every test with a fixture asserts,
// inside the test, that the fixture reached the case.
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import MobileAppContent from "./MobileAppContent";
import {
  BULLET_WARNING,
  FOUR_NOW,
  LINE_LABELS,
  LOCK_HEADING,
  LOCK_NOTE_1,
  LOCK_NOTE_2,
  NOT_FOUR,
  OFFICE_NOTE,
  OFFICE_SAVED_NOTICE,
  OFFICE_USE,
  PREVIEW_SOURCE,
  SAVED_NOTICE,
  bodyMode,
  composeBody,
  splitBody,
} from "./MobileContentPortTab";
import { previewContext, previewParts, previewText } from "../utils/mobileContentPreview";
import { useAuth } from "../../auth/AuthContext";

const router = require("../testing/routerStub");

jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "backend", "api", "migrations", "seed_data", "mobile_content_0061.json"), "utf8"));
const REAL = JSON.parse(fs.readFileSync(path.join(ROOT, "mobile", "test", "data", "app_content_commit3.json"), "utf8"));
const SEED_GUIDE = SEED.blocks.find((block) => block.key === "port_guide");
const SEED_OFFICE = SEED.blocks.find((block) => block.key === "fee_office");
const FEE = ["fee_regular", "fee_discounted", "fee_office"];
const BULLET = "•";

const LIMITS = {
  title: { kind: "line", max: 160, required: true },
  body: { kind: "lines", max: 400, max_lines: 8, required: true },
};
let state;
let requests;
const reply = (status, body) => Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
const oneLine = (text) => text.split(/\s+/).filter(Boolean).join(" ");
const cleanLines = (text) => text.replace(/\r\n?/g, "\n").split("\n").map(oneLine).filter(Boolean).join("\n");
const blocksAnswer = () => ({
  blocks: [
    { key: "port_guide", name: "Port & Boat Guide", ...state.guide, fields: ["title", "body"], limits: LIMITS, allowed_placeholders: { title: FEE, body: FEE } },
    { key: "fee_office", name: "Place where the fee is paid", title: "", subtitle: "", body: state.office, fields: ["body"], limits: { body: { kind: "line", max: 120, required: true } }, allowed_placeholders: { body: [] } },
  ],
  ...(state.noFee ? {} : { fee: { regular: 80, discounted: 64 } }),
  placeholders: { fee_regular: "The regular amount.", fee_discounted: "The discounted amount.", fee_office: "The place where the fee is paid." },
});

beforeEach(() => {
  requests = [];
  state = {
    guide: { title: SEED_GUIDE.title, subtitle: "", body: SEED_GUIDE.body },
    office: SEED_OFFICE.body,
    failNext: null,
    confirmNeeded: null,
    warnOffice: null,
  };
  router.__setSearch("?tab=port-guide");
  useAuth.mockReturnValue({ role: "admin" });
  global.fetch = jest.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const route = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path: route, body });
    if (method === "GET" && route === "/mobile-content/blocks/") return reply(200, blocksAnswer());
    const patch = route.match(/^\/mobile-content\/blocks\/([a-z_]+)\/$/);
    if (method === "PATCH" && patch) {
      if (state.failNext) {
        const failure = state.failNext;
        state.failNext = null;
        return reply(failure.status, failure.body);
      }
      if (patch[1] === "port_guide" && state.confirmNeeded && !body.confirm_dropped) {
        return reply(409, { detail: "This change takes the place where the fee is paid out of the text, so visitors will no longer be told it here. It needs a confirmation.", code: "confirm_required", dropped: state.confirmNeeded });
      }
      if (patch[1] === "port_guide") {
        if (body.title !== undefined) state.guide.title = oneLine(body.title);
        if (body.body !== undefined) state.guide.body = cleanLines(body.body);
        return reply(200, { key: "port_guide", ...state.guide, fields: ["title", "body"], limits: LIMITS, allowed_placeholders: { title: FEE, body: FEE }, warnings: [] });
      }
      state.office = oneLine(body.body);
      return reply(200, { key: "fee_office", title: "", subtitle: "", body: state.office, warnings: state.warnOffice ? [state.warnOffice] : [] });
    }
    return reply(404, {});
  });
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function open() {
  const view = render(<MobileAppContent />);
  await screen.findByRole("form", { name: "Port & Boat Guide" });
  await settled();
  return view;
}
const guideForm = () => screen.getByRole("form", { name: "Port & Boat Guide" });
const officeForm = () => screen.getByRole("form", { name: "Place where the fee is paid" });
const box = (label) => within(guideForm()).getByRole("textbox", { name: label });
const type = (label, value) => fireEvent.change(box(label), { target: { value } });
const save = () => within(guideForm()).getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const writes = () => requests.filter((r) => r.method !== "GET");
const bullets = () => [...screen.getByTestId("port-bullets").querySelectorAll("li")].map((li) => li.textContent);

describe("the seed and the four boxes", () => {
  it("the seed holds four lines, and the four boxes show them by position", async () => {
    expect(SEED_GUIDE.body.split("\n")).toHaveLength(4); // the fixture reached the case: the real seed, four lines
    expect(bodyMode(SEED_GUIDE.body)).toBe("four");
    await open();
    LINE_LABELS.forEach((label, index) => expect(box(label).value).toBe(SEED_GUIDE.body.split("\n")[index]));
    expect(LINE_LABELS).toEqual(["Boat departure times", "Island port arrival", "Environmental fee", "Boat fare note"]);
    expect(box("Title").value).toBe(SEED_GUIDE.title);
  });

  it("builds the body again from the four boxes, and the four lines of the seed come back EXACTLY after a round trip", () => {
    const lines = splitBody(SEED_GUIDE.body);
    expect(lines).toHaveLength(4);
    expect(composeBody(lines)).toBe(SEED_GUIDE.body);
    expect(splitBody(composeBody(lines))).toEqual(lines);
    expect(composeBody(["  a   b ", "c", "d", "e  "])).toBe("a b\nc\nd\ne");
  });

  it("the round trip through the page: open, change nothing in the lines, change the title, save: the body is not sent, and the server's body is the seed", async () => {
    await open();
    type("Title", "Mauban Port ↔ Cagbalete Boats (new)");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "Mauban Port ↔ Cagbalete Boats (new)" }]); // the four lines went back as they were: no change
    expect(state.guide.body).toBe(SEED_GUIDE.body);
  });

  it("a change in one box changes one line of the body, in its place, and the other three stay", async () => {
    await open();
    type("Boat departure times", "Boats leave at 08:00 AM and 02:00 PM.");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    const expected = splitBody(SEED_GUIDE.body);
    expect(expected[0]).not.toBe("Boats leave at 08:00 AM and 02:00 PM."); // the fixture
    expected[0] = "Boats leave at 08:00 AM and 02:00 PM.";
    expect(writes().map((r) => r.body)).toEqual([{ body: expected.join("\n") }]);
    for (let index = 1; index < 4; index += 1) expect(splitBody(writes()[0].body.body)[index]).toBe(splitBody(SEED_GUIDE.body)[index]);
  });

  it("each of the four changes only its own line", async () => {
    for (let index = 0; index < 4; index += 1) {
      const view = await open();
      type(LINE_LABELS[index], `Changed line ${index + 1}`);
      fireEvent.click(save());
      await screen.findByText(SAVED_NOTICE);
      const sent = splitBody(writes().at(-1).body.body);
      expect(sent).toHaveLength(4);
      sent.forEach((line, at) => expect(line).toBe(at === index ? `Changed line ${index + 1}` : splitBody(SEED_GUIDE.body)[at]));
      view.unmount();
      state.guide.body = SEED_GUIDE.body;
    }
  });
});

describe("each of the four is one line", () => {
  it("is a box that grows, with Enter doing nothing (Enter is Save when Save is open), and a pasted new line becomes a space", async () => {
    await open();
    for (const label of LINE_LABELS) {
      expect(box(label).tagName).toBe("TEXTAREA");
      expect(box(label).rows).toBe(1);
      expect(box(label).className).toBe("mobile-content-line");
      expect(box(label).hasAttribute("maxlength")).toBe(false);
      expect(fireEvent.keyDown(box(label), { key: "Enter" })).toBe(false); // cancelled: no new line
    }
    type("Island port arrival", "one\ntwo");
    expect(box("Island port arrival").value).toBe("one two");
  });

  it("Enter saves when Save is open, and sends nothing when it is closed", async () => {
    await open();
    fireEvent.keyDown(box("Boat fare note"), { key: "Enter" });
    await settled();
    expect(writes()).toEqual([]); // nothing changed: closed
    type("Boat fare note", "A new fare note.");
    fireEvent.keyDown(box("Boat fare note"), { key: "Enter" });
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
  });
});

describe("the four are needed before Save", () => {
  it("a box left empty says so and closes Save; the body is never built with three lines", async () => {
    await open();
    type("Island port arrival", "   ");
    expect(screen.getByText(/The island port arrival is required: the guide needs all four lines\./)).toBeTruthy();
    expect(save().disabled).toBe(true);
    fireEvent.keyDown(box("Island port arrival"), { key: "Enter" });
    fireEvent.submit(guideForm());
    await settled();
    expect(writes()).toEqual([]);
  });

  it("each of the four, left empty, closes Save", async () => {
    for (const label of LINE_LABELS) {
      const view = await open();
      type(label, "");
      expect(save().disabled).toBe(true);
      view.unmount();
    }
  });

  it("a line over 400 letters is refused before Save; 400 exactly is accepted", async () => {
    await open();
    type("Boat fare note", "x".repeat(401));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(save().disabled).toBe(true);
    type("Boat fare note", "x".repeat(400));
    expect(save().disabled).toBe(false);
    expect(screen.getByTestId("count-line-4").textContent).toBe("400 / 400");
  });

  it("the title is needed, and at most the limit of the server", async () => {
    await open();
    type("Title", "");
    expect(screen.getByText("The title is required.")).toBeTruthy();
    expect(save().disabled).toBe(true);
    type("Title", "t".repeat(161));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(save().disabled).toBe(true);
  });
});

describe("the third line and the placeholders", () => {
  it("has the three buttons of the fee, and only the third line has them", async () => {
    await open();
    const group = within(guideForm()).getByRole("group", { name: "Placeholders for the environmental fee" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["{fee_regular}", "{fee_discounted}", "{fee_office}"]);
    expect(within(guideForm()).getAllByRole("group")).toHaveLength(1); // the fixture: one group of buttons in the form
    expect(within(guideForm()).queryByRole("button", { name: /\{name\}/ })).toBeNull();
  });

  it("puts a placeholder into the third line, at the caret, and nowhere else", async () => {
    await open();
    type("Environmental fee", "Fee: ");
    fireEvent.click(within(guideForm()).getByRole("button", { name: "Put in {fee_discounted} in the environmental fee" }));
    expect(box("Environmental fee").value).toBe("Fee: {fee_discounted}");
    expect(box("Boat fare note").value).toBe(splitBody(SEED_GUIDE.body)[3]);
  });

  it("the third line is EDITABLE (it is not locked), and its placeholders may be taken out only after a question (409)", async () => {
    state.confirmNeeded = ["fee_office", "fee_regular"];
    await open();
    expect(box("Environmental fee").disabled).toBe(false);
    type("Environmental fee", "Pay at the tourism office.");
    fireEvent.click(save());
    const question = await screen.findByRole("alertdialog", { name: "Confirm the change" });
    expect(writes()).toHaveLength(1);
    fireEvent.click(within(question).getByRole("button", { name: "Confirm" }));
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body.confirm_dropped)).toEqual([undefined, ["fee_office", "fee_regular"]]);
  });

  it("warns of a placeholder that is not on the list, and Save stays open (the server decides)", async () => {
    await open();
    type("Boat fare note", "Hello {name}");
    expect(screen.getByTestId("warning-line-4").textContent).toMatch(/\{name\} is not one of the placeholders listed above/);
    expect(save().disabled).toBe(false);
  });

  it("warns of a bullet at the start of a line, and Save stays open", async () => {
    await open();
    type("Island port arrival", `${BULLET} Sabang Port`);
    expect(screen.getByTestId("warning-line-2").textContent).toBe(BULLET_WARNING);
    expect(save().disabled).toBe(false);
    type("Island port arrival", `Sabang ${BULLET} Port`);
    expect(screen.queryByTestId("warning-line-2")).toBeNull(); // a bullet in the middle is not at the start
  });
});

describe("when the server does not hold four lines: ONE box of lines, and the reason", () => {
  const threeLines = ["First line", "Second line", "Third line"].join("\n");

  it("falls back to one box of lines with the reason in words, and no content is moved into the four boxes", async () => {
    state.guide.body = threeLines;
    expect(bodyMode(threeLines)).toBe("free");
    await open();
    expect(screen.getByTestId("free-box")).toBeTruthy(); // the fixture reached the case: three lines on the server
    expect(screen.getByTestId("free-why").textContent).toBe(NOT_FOUR(3));
    expect(NOT_FOUR(3)).toMatch(/3 lines on the server, not four/);
    expect(NOT_FOUR(3)).toMatch(/without guessing which line is which/);
    expect(NOT_FOUR(1)).toMatch(/1 line on the server/);
    LINE_LABELS.forEach((label) => expect(within(guideForm()).queryByRole("textbox", { name: label })).toBeNull()); // none of the four boxes
    expect(within(guideForm()).getByRole("textbox", { name: "Lines" }).value).toBe(threeLines);
  });

  it("also for five lines, for one line, and for a body with no line", async () => {
    for (const body of ["a\nb\nc\nd\ne", "only one", ""]) {
      state.guide.body = body;
      const view = await open();
      expect(screen.getByTestId("free-box")).toBeTruthy();
      expect(within(guideForm()).queryByRole("textbox", { name: "Boat fare note" })).toBeNull();
      view.unmount();
    }
  });

  it("never puts the lines in the wrong boxes: the content of a body that is not four lines is shown only in the box of lines", async () => {
    state.guide.body = threeLines;
    await open();
    const all = within(guideForm()).getAllByRole("textbox").map((element) => element.value);
    expect(all.filter((value) => value.includes("First line"))).toHaveLength(1); // once, in the box of lines
    expect(bullets()).toEqual([`${BULLET} First line`, `${BULLET} Second line`, `${BULLET} Third line`]);
  });

  it("is a box of lines (Enter works), with the two counters, and sends the lines cleaned", async () => {
    state.guide.body = threeLines;
    await open();
    const free = within(guideForm()).getByRole("textbox", { name: "Lines" });
    expect(fireEvent.keyDown(free, { key: "Enter" })).toBe(true);
    fireEvent.change(free, { target: { value: "  one   a \n\n two \nthree" } });
    expect(screen.getByTestId("count-free").textContent).toBe("3 / 8 lines");
    expect(screen.getByTestId("longest-free").textContent).toBe("Longest line: 5 / 400");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ body: "one a\ntwo\nthree" }]);
  });

  it("refuses nine lines, a line over 400, and no line; warns of a bullet", async () => {
    state.guide.body = threeLines;
    await open();
    const free = () => within(guideForm()).getByRole("textbox", { name: "Lines" });
    fireEvent.change(free(), { target: { value: Array.from({ length: 9 }, (_, index) => `l${index}`).join("\n") } });
    expect(screen.getByTestId("toomanylines-free").textContent).toBe("Too many lines by 1. The most it can have is 8.");
    expect(save().disabled).toBe(true);
    fireEvent.change(free(), { target: { value: `ok\n${"x".repeat(401)}` } });
    expect(screen.getByTestId("longline-free").textContent).toBe("Line 2 is too long by 1 letter.");
    expect(save().disabled).toBe(true);
    fireEvent.change(free(), { target: { value: "\n \n" } });
    expect(screen.getByText("The text is required.")).toBeTruthy();
    fireEvent.change(free(), { target: { value: `${BULLET} bullet\nfine` } });
    expect(screen.getByTestId("warning-free").textContent).toBe(BULLET_WARNING);
    expect(save().disabled).toBe(false);
  });

  it("after a save that leaves four lines, it stays one box (nothing is moved) and says the four boxes come at the next opening", async () => {
    state.guide.body = threeLines;
    await open();
    expect(screen.queryByTestId("four-now")).toBeNull(); // the fixture: three lines, nothing said yet
    fireEvent.change(within(guideForm()).getByRole("textbox", { name: "Lines" }), { target: { value: "a\nb\nc\nd" } });
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(screen.getByTestId("free-box")).toBeTruthy();
    expect(within(guideForm()).queryByRole("textbox", { name: "Boat fare note" })).toBeNull();
    expect(screen.getByTestId("four-now").textContent).toBe(FOUR_NOW);
    expect(state.guide.body).toBe("a\nb\nc\nd");
  });
});

describe("the place where the fee is paid", () => {
  const officeBox = () => within(officeForm()).getByRole("textbox", { name: "Place" });

  it("has its own box of one line, its own Save, and the line that other tabs use it with {fee_office}", async () => {
    await open();
    expect(officeBox().value).toBe(SEED_OFFICE.body);
    expect(officeBox().className).toBe("mobile-content-line");
    expect(screen.getByText(OFFICE_USE)).toBeTruthy();
    expect(OFFICE_USE).toMatch(/\{fee_office\}/);
    expect(within(officeForm()).getByRole("button", { name: "Save" }).disabled).toBe(true);
    expect(screen.getByTestId("count-office").textContent).toBe(`${SEED_OFFICE.body.length} / 120`);
  });

  it("sends ONE PATCH of the block fee_office, nothing else, and shows the server's warning about the texts that change", async () => {
    state.warnOffice = "This place is written in 4 texts of the app, so all of them change.";
    await open();
    fireEvent.change(officeBox(), { target: { value: "  Tourism   Office, Ground Floor " } });
    fireEvent.click(within(officeForm()).getByRole("button", { name: "Save" }));
    await screen.findByText(OFFICE_SAVED_NOTICE);
    const sent = writes();
    expect(sent.map((r) => `${r.method} ${r.path}`)).toEqual(["PATCH /mobile-content/blocks/fee_office/"]);
    expect(sent[0].body).toEqual({ body: "Tourism Office, Ground Floor" });
    expect((await screen.findByTestId("office-warning")).textContent).toBe(state.warnOffice);
    expect(state.office).toBe("Tourism Office, Ground Floor");
  });

  it("is a line of one: Enter saves when it is open, a pasted new line is a space, 120 is the most", async () => {
    await open();
    fireEvent.change(officeBox(), { target: { value: "a\nb" } });
    expect(officeBox().value).toBe("a b");
    expect(fireEvent.keyDown(officeBox(), { key: "Enter" })).toBe(false);
    await screen.findByText(OFFICE_SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
    fireEvent.change(officeBox(), { target: { value: "x".repeat(121) } });
    expect(within(officeForm()).getByText("Too long by 1 letter.")).toBeTruthy();
    expect(within(officeForm()).getByRole("button", { name: "Save" }).disabled).toBe(true);
    fireEvent.change(officeBox(), { target: { value: "" } });
    expect(within(officeForm()).getByText("The place is required.")).toBeTruthy();
  });

  it("shows the server's words under the field when it refuses (a fee amount typed in), and keeps what was typed", async () => {
    const words = "The place has the entrance fee amount typed in. It cannot be typed here.";
    state.failNext = { status: 400, body: { detail: words, body: [words] } };
    await open();
    fireEvent.change(officeBox(), { target: { value: "Pay P80 at the office" } });
    fireEvent.click(within(officeForm()).getByRole("button", { name: "Save" }));
    expect((await screen.findByTestId("error-office")).textContent).toBe(words);
    expect(officeBox().value).toBe("Pay P80 at the office");
  });

  it("changing the place does not change the title or the four boxes, and the guide's Save is not touched", async () => {
    await open();
    fireEvent.change(officeBox(), { target: { value: "New place" } });
    expect(save().disabled).toBe(true); // the guide did not change
    fireEvent.click(within(officeForm()).getByRole("button", { name: "Save" }));
    await screen.findByText(OFFICE_SAVED_NOTICE);
    expect(writes().every((r) => r.path.endsWith("/fee_office/"))).toBe(true);
  });
});

describe("the check before a save: someone else changed it", () => {
  it("looks again before the PATCH, and sends when nobody changed what I changed", async () => {
    await open();
    const before = requests.length;
    type("Boat fare note", "Mine");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(requests.slice(before).map((r) => `${r.method} ${r.path}`)).toEqual(["GET /mobile-content/blocks/", "PATCH /mobile-content/blocks/port_guide/"]);
  });

  it("asks, and does not send, when the other person changed the lines I changed, and does not promise", async () => {
    await open();
    state.guide.body = ["x", "y", "z", "w"].join("\n");
    type("Boat fare note", "Mine");
    fireEvent.click(save());
    const question = await screen.findByRole("alertdialog", { name: "Someone else changed this text" });
    expect(within(question).getByText("This check is not a guarantee: it cannot see a change made at the very moment you save.")).toBeTruthy();
    expect(writes()).toEqual([]);
    expect(save).toBeDefined();
    fireEvent.click(within(question).getByRole("button", { name: "Save my text anyway" }));
    await screen.findByText(SAVED_NOTICE);
    expect(writes()).toHaveLength(1);
  });

  it("Keep editing adopts what the other person wrote in the lines I did not touch, and keeps my own title", async () => {
    await open();
    state.guide.title = "Their title";
    state.guide.body = ["n1", "n2", "n3", "n4"].join("\n");
    type("Title", "My title");
    fireEvent.click(save());
    const question = await screen.findByRole("alertdialog", { name: "Someone else changed this text" });
    fireEvent.click(within(question).getByRole("button", { name: "Keep editing" }));
    await settled();
    expect(box("Boat departure times").value).toBe("n1"); // the fixture: the lines were not mine, they are theirs now
    expect(box("Boat fare note").value).toBe("n4");
    expect(box("Title").value).toBe("My title");
    expect(writes()).toEqual([]);
  });

  it("in the box of lines, Keep editing adopts all the lines of the other person, not the first only", async () => {
    state.guide.body = "a\nb\nc";
    await open();
    expect(screen.getByTestId("free-box")).toBeTruthy(); // the fixture: the fallback
    state.guide.title = "Their title";
    state.guide.body = "this is long enough\nsecond\nthird\nfourth\nfifth";
    type("Title", "My title");
    fireEvent.click(save());
    const question = await screen.findByRole("alertdialog", { name: "Someone else changed this text" });
    fireEvent.click(within(question).getByRole("button", { name: "Keep editing" }));
    await settled();
    expect(within(guideForm()).getByRole("textbox", { name: "Lines" }).value).toBe(state.guide.body);
  });

  it("the place where the fee is paid is checked the same way", async () => {
    await open();
    state.office = "Changed elsewhere";
    const field = within(officeForm()).getByRole("textbox", { name: "Place" });
    fireEvent.change(field, { target: { value: "Mine" } });
    fireEvent.click(within(officeForm()).getByRole("button", { name: "Save" }));
    const question = await screen.findByRole("alertdialog", { name: "Someone else changed the place" });
    expect(question.textContent).toMatch(/It now says: “Changed elsewhere” Yours says: “Mine”/);
    expect(writes()).toEqual([]);
  });
});

describe("the box of the fee that cannot be changed", () => {
  const locked = () => screen.getByTestId("locked-fee");

  it("shows the two amounts the server gave, and nothing in it can be typed in or pressed", async () => {
    await open();
    expect(within(locked()).getByRole("heading", { level: 2, name: LOCK_HEADING })).toBeTruthy();
    expect(LOCK_HEADING).toBe("Environmental fee — locked");
    expect(locked().querySelector('[data-part="regular"]').textContent).toBe("₱80");
    expect(locked().querySelector('[data-part="discounted"]').textContent).toBe("₱64");
    expect(within(locked()).getByText("Standard")).toBeTruthy();
    expect(within(locked()).getByText("Discounted")).toBeTruthy();
    expect(locked().querySelectorAll("input, textarea, select, button, a, form, [contenteditable]")).toHaveLength(0); // read only
    expect(locked().querySelector("svg").getAttribute("stroke")).toBe("#8A4F16"); // the padlock
  });

  it("has the two sentences of the owner, word for word", async () => {
    await open();
    expect(within(locked()).getByText(LOCK_NOTE_1)).toBeTruthy();
    expect(within(locked()).getByText(LOCK_NOTE_2)).toBeTruthy();
    expect(LOCK_NOTE_1).toBe("Kinukuwenta ito sa bawat ulat, hindi iniimbak sa bawat record. Kapag pinalitan, magbabago ang bawat nakaraang ulat ng LGU — pati ang kita noong nakaraang buwan.");
    expect(LOCK_NOTE_2).toBe("Ang pamasahe ng bangka ay nasa Registration Options › Boat Capacity and Fare, hindi dito.");
  });

  it("follows what the server says: another amount is shown, and a missing amount is a dash, not a made-up number", async () => {
    state.noFee = true;
    await open();
    expect(locked().querySelector('[data-part="regular"]').textContent).toBe("—");
    expect(locked().querySelector('[data-part="discounted"]').textContent).toBe("—");
  });

  it("has no way to send a fee: the page never writes the amounts", async () => {
    await open();
    fireEvent.change(box("Environmental fee"), { target: { value: "Fee: {fee_regular}" } });
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(JSON.stringify(writes())).not.toMatch(/"fee"|regular"?:\s*\d|discounted"?:\s*\d/);
  });
});

describe("the preview", () => {
  const frame = () => screen.getByTestId("port-frame");

  it("has the eyebrow, the heading, the title and four bullets, with the placeholders filled in", async () => {
    await open();
    const side = screen.getByLabelText("What the app will show");
    expect(within(side).getByText("Preview").className).toContain("mobile-content-eyebrow");
    expect(within(side).getByRole("heading", { level: 2, name: "How it looks in the app" })).toBeTruthy();
    expect(screen.getByTestId("port-title").textContent).toBe(SEED_GUIDE.title);
    expect(bullets()).toHaveLength(4); // the fixture: four bullets
    expect(bullets()[2]).toContain("₱80");
    expect(bullets()[2]).toContain("₱64");
    expect(bullets()[2]).toContain(SEED_OFFICE.body);
    expect(bullets()[2]).not.toMatch(/\{fee_/);
    expect(frame().querySelector('[data-kind="filled"]').getAttribute("title")).toMatch(/^\{fee_/);
  });

  it("says what the real appContent says, word for word: the title and the four bullets", async () => {
    await open();
    const real = REAL.blocks.port_guide;
    expect(screen.getByTestId("port-title").textContent).toBe(real.title);
    expect(bullets()).toEqual(real.body.split("\n").map((line) => `${BULLET} ${line}`));
    expect(real.body.split("\n")).toHaveLength(4); // the fixture: the real value has four lines
  });

  it("shows no empty bullet when a box is emptied", async () => {
    await open();
    expect(bullets()).toHaveLength(4);
    type("Island port arrival", "");
    expect(bullets()).toHaveLength(3);
    expect(bullets().every((text) => text.length > 2)).toBe(true);
  });

  it("follows what is typed, in the four boxes and in the title", async () => {
    await open();
    type("Title", "A new title");
    type("Island port arrival", "Go to the island.");
    expect(screen.getByTestId("port-title").textContent).toBe("A new title");
    expect(bullets()[1]).toBe(`${BULLET} Go to the island.`);
    expect(bullets()[0]).toBe(`${BULLET} ${splitBody(SEED_GUIDE.body)[0]}`);
  });

  it("has the line that says where the fee in it comes from, and it is not a note box", async () => {
    const { container } = await open();
    const line = screen.getByText(PREVIEW_SOURCE);
    expect(PREVIEW_SOURCE).toBe("Ang bayad sa linyang ito ay galing sa iisang pinagmulan — hindi ito maaaring maiba sa totoong kuwenta.");
    expect(line.tagName).toBe("P");
    expect(container.querySelector(".mobile-content-note")).toBeNull();
  });

  it("says when the place where the fee is paid is not written yet, in words that say nothing of what the app does", async () => {
    state.office = "   ";
    await open();
    expect(screen.getByTestId("preview-office-note").textContent).toBe(OFFICE_NOTE);
    expect(OFFICE_NOTE).not.toMatch(/the app (keeps|shows|will)/i);
    expect(bullets()[2]).toContain("{fee_office}"); // the placeholder stays as it is: it cannot be filled
  });

  it("the preview of the real texts, from the seed through the page: the same as the real appContent for the three tabs' shared place", async () => {
    const context = previewContext({ fee: { regular: 80, discounted: 64 }, blocks: [{ key: "fee_office", body: SEED_OFFICE.body }] });
    const filled = splitBody(SEED_GUIDE.body).map((line) => previewText(previewParts(line, context, FEE).parts));
    expect(filled.join("\n")).toBe(REAL.blocks.port_guide.body);
  });
});

describe("requests and the other tabs", () => {
  it("opens with ONE GET (the blocks), asks for nothing until the tab is opened, and never for the contacts or the items", async () => {
    router.__setSearch("?tab=welcome");
    render(<MobileAppContent />);
    await screen.findByRole("tabpanel");
    await settled();
    expect(requests.length).toBe(1); // the fixture: the Welcome asked once
    expect(requests.every((r) => r.path === "/mobile-content/blocks/")).toBe(true); // only the Welcome's own
    const before = requests.length;
    fireEvent.click(screen.getByRole("tab", { name: /^Port & Boat Guide/ }));
    await screen.findByRole("form", { name: "Port & Boat Guide" });
    await settled();
    expect(requests.slice(before).map((r) => `${r.method} ${r.path}`)).toEqual(["GET /mobile-content/blocks/"]);
    expect(requests.some((r) => /emergency-contacts|items/.test(r.path))).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: /^Welcome/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^Port & Boat Guide/ }));
    await settled();
    expect(requests.slice(before)).toHaveLength(1); // kept, not asked again
  });

  it("the tab has no Coming soon, no time input, no plus and no times", async () => {
    await open();
    expect(screen.getByRole("tab", { name: /^Port & Boat Guide/ }).textContent).not.toContain("Coming soon");
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /add time|\+ add|×/i })).toBeNull();
    expect(document.querySelector(".mobile-content-note")).toBeNull();
  });

  it("sends anyone but the admin away, with no request", async () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<MobileAppContent />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    await settled();
    expect(requests).toEqual([]);
  });

  it("shows the error with Try again when the blocks cannot be read, and reads again on Try again", async () => {
    const real = global.fetch;
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<MobileAppContent />);
    await screen.findByRole("button", { name: "Try again" });
    global.fetch = real;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("form", { name: "Port & Boat Guide" });
  });
});

describe("the CSS holds the values of the design", () => {
  const CSS = fs.readFileSync(path.join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");
  const part = CSS.slice(CSS.indexOf("the Port & Boat Guide: the box of the fee that cannot be changed here, and the preview (Commit 8b)"));
  const decl = (selector, property) => {
    const start = part.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const found = part.slice(start, part.indexOf("\n}", start)).match(new RegExp(`^\\s*${property}:\\s*(.+);$`, "m"));
    expect(found).not.toBeNull();
    return found[1].toLowerCase();
  };

  it("the locked box", () => {
    expect(decl(".mobile-content-locked", "background")).toBe("#fdf0e2");
    expect(decl(".mobile-content-locked", "border")).toBe("1px solid #ebd3b6");
    expect(decl(".mobile-content-locked", "border-radius")).toBe("16px");
    expect(decl(".mobile-content-locked", "padding")).toBe("21px 22px");
    expect(decl(".mobile-content-locked-head h2", "font-size")).toBe("15.5px");
    expect(decl(".mobile-content-locked-head h2", "font-weight")).toBe("700");
    expect(decl(".mobile-content-locked-head h2", "color")).toBe("#6f3e11");
    expect(decl(".mobile-content-locked-price", "flex")).toBe("1");
    expect(decl(".mobile-content-locked-price", "border")).toBe("1px solid #ebd3b6");
    expect(decl(".mobile-content-locked-price", "border-radius")).toBe("11px");
    expect(decl(".mobile-content-locked-price", "padding")).toBe("12px 14px");
    expect(decl(".mobile-content-locked-price", "background")).toBe("var(--th-surface)");
    expect(decl(".mobile-content-locked-label", "font-size")).toBe("10.5px");
    expect(decl(".mobile-content-locked-label", "letter-spacing")).toBe("0.09em");
    expect(decl(".mobile-content-locked-label", "color")).toBe("#9b7349");
    expect(decl(".mobile-content-locked-label", "font-weight")).toBe("700");
    expect(decl(".mobile-content-locked-price strong", "font-size")).toBe("24px");
    expect(decl(".mobile-content-locked-price strong", "font-weight")).toBe("800");
    expect(decl(".mobile-content-locked-price strong", "letter-spacing")).toBe("-0.02em");
    expect(decl(".mobile-content-locked p", "font-size")).toBe("13px");
    expect(decl(".mobile-content-locked p", "line-height")).toBe("1.65");
    expect(decl(".mobile-content-locked p", "color")).toBe("#6b4f32");
  });

  it("the frame of the preview, its title, its bullets and its last line", () => {
    const frameRule = ".mobile-content-phone.mobile-content-port-frame";
    expect(decl(frameRule, "padding")).toBe("16px 15px");
    expect(decl(frameRule, "font-size")).toBe("12.5px");
    expect(decl(frameRule, "line-height")).toBe("1.75");
    expect(decl(frameRule, "color")).toBe("#3c4851");
    expect(decl(".mobile-content-port-title", "font-size")).toBe("13.5px");
    expect(decl(".mobile-content-port-title", "font-weight")).toBe("700");
    expect(decl(".mobile-content-port-title", "color")).toBe("#0a6e78");
    expect(decl(".mobile-content-port-bullets", "gap")).toBe("7px");
    expect(decl(".mobile-content-port-source", "font-size")).toBe("12.5px");
    expect(decl(".mobile-content-port-source", "color")).toBe("#8a7664");
  });

  it("every rule of the tab starts with a class of its own", () => {
    const selectors = part.split("\n").filter((line) => /^[.\[a-z].*[,{]$/.test(line) && !line.startsWith(" "));
    expect(selectors.length).toBeGreaterThan(10); // the fixture
    selectors.forEach((line) => expect(line).toMatch(/^\.mobile-content-/));
  });
});
