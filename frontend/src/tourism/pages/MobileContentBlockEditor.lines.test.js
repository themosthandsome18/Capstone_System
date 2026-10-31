// The editor of a block, with a text of LINES (Commit 8a): the body of the port guide, where every line is a bullet in the app. A fake of the server sits
// behind a fake fetch, so the REAL tourismApi builds the requests. The title is a text of one line and the Why Visit is a text of paragraphs, in the same
// editor: they must not change. Every test with a fixture asserts, inside the test, that the fixture reached the case.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import MobileContentBlockEditor, { SAVED_NOTICE } from "./MobileContentBlockEditor";

const FEE = ["fee_regular", "fee_discounted", "fee_office"];
const BULLET = "•";
const LIMITS = {
  port_guide: {
    title: { kind: "line", max: 160, required: true },
    body: { kind: "lines", max: 400, max_lines: 8, required: true },
  },
  why_visit: {
    title: { kind: "line", max: 160, required: true },
    subtitle: { kind: "line", max: 300, required: true },
    body: { kind: "text", max: 600, required: true },
  },
};
const SEED_BODY = [
  "Standard boat departures from Mauban Port: 07:00 AM, 10:00 AM, 01:00 PM, and 04:00 PM.",
  "Island Port Arrival: Sabang Port (during high tide) or Mappit Port (during low tide).",
  "Environmental Fee: {fee_regular} per visitor. Pay at the {fee_office}.",
  "Boat fare is separate. You arrange and pay it directly with the boat operator.",
].join("\n");

let state;
let requests;
const reply = (status, body) => Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => JSON.parse(JSON.stringify(body)) });
const oneLine = (text) => text.split(/\s+/).filter(Boolean).join(" ");
// what the server does (api/views/mobile_content.py)
const serverClean = (kind, value) => {
  if (kind === "lines") return value.replace(/\r\n?/g, "\n").split("\n").map(oneLine).filter(Boolean).join("\n");
  if (kind === "text") return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return oneLine(value);
};
const block = (key) => ({
  key, name: key, ...state.blocks[key], fields: Object.keys(LIMITS[key]), limits: LIMITS[key],
  allowed_placeholders: Object.fromEntries(Object.keys(LIMITS[key]).map((field) => [field, FEE])),
});

beforeEach(() => {
  requests = [];
  state = {
    blocks: {
      port_guide: { title: "Mauban Port ↔ Cagbalete Boats", subtitle: "", body: SEED_BODY },
      why_visit: { title: "Why Visit", subtitle: "Sub", body: "One\n\nTwo" },
    },
    failNext: null,
  };
  global.fetch = jest.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const route = url.replace(/^.*\/api/, "");
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path: route, body });
    if (method === "GET" && route === "/mobile-content/blocks/") {
      const blocks = Object.keys(state.blocks).map(block);
      if (state.office) blocks.push({ key: "fee_office", title: "", subtitle: "", body: state.office, fields: ["body"], limits: {}, allowed_placeholders: {} });
      return reply(200, { blocks, fee: { regular: 80, discounted: 64 }, placeholders: {} });
    }
    const patch = route.match(/^\/mobile-content\/blocks\/([a-z_]+)\/$/);
    if (method === "PATCH" && patch) {
      if (state.failNext) {
        const failure = state.failNext;
        state.failNext = null;
        return reply(failure.status, failure.body);
      }
      Object.entries(body).forEach(([field, value]) => {
        if (field !== "confirm_dropped") state.blocks[patch[1]][field] = serverClean(LIMITS[patch[1]][field].kind, value);
      });
      return reply(200, { ...block(patch[1]), warnings: [] });
    }
    return reply(404, {});
  });
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
afterEach(settled);

async function open(key = "port_guide", props = {}) {
  const view = render(<MobileContentBlockEditor blockKey={key} heading={key === "port_guide" ? "Port & Boat Guide" : "Why Visit"} {...props} />);
  await screen.findByLabelText("Title");
  return view;
}
const field = (name) => screen.getByLabelText(name);
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const save = () => screen.getByRole("button", { name: /^(Save|Saving\.\.\.)$/ });
const writes = () => requests.filter((r) => r.method !== "GET");

describe("a text of lines is a box of several lines", () => {
  it("is a textarea of six rows, not the box of one line, and Enter is not cancelled in it", async () => {
    await open();
    expect(state.blocks.port_guide.body.split("\n")).toHaveLength(4); // the fixture: the body of the seed, four lines
    const box = field("Text");
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.rows).toBe(6);
    expect(box.className).not.toContain("mobile-content-line");
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true); // true: nobody cancelled it
    expect(box.value).toBe(SEED_BODY);
  });

  it("keeps the new lines that are typed or pasted into it", async () => {
    await open();
    type("Text", "one\ntwo\nthree");
    expect(field("Text").value).toBe("one\ntwo\nthree");
  });

  it("the title next to it is still a box of one line: Enter does nothing, a new line becomes a space", async () => {
    await open();
    expect(field("Title").className).toBe("mobile-content-line");
    expect(fireEvent.keyDown(field("Title"), { key: "Enter" })).toBe(false);
    type("Title", "a\nb");
    expect(field("Title").value).toBe("a b");
  });
});

describe("what is sent", () => {
  it("is the lines cleaned the way the server cleans them: each as a line, the blank ones gone, the new lines kept", async () => {
    await open();
    type("Text", "  first    line \n\n\n second\tline  \n   \nthird ");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ body: "first line\nsecond line\nthird" }]);
    expect(writes()[0].body.body.split("\n")).toHaveLength(3); // the fixture: three lines, not one
    expect(field("Text").value).toBe("first line\nsecond line\nthird"); // and the answer of the server is what is shown
  });

  it("is only the field that changed", async () => {
    await open();
    type("Title", "New title");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ title: "New title" }]);
  });

  it("a text with the same lines but other spaces and blank lines is not a change", async () => {
    await open();
    type("Text", `\n${SEED_BODY.replace(/\n/g, "\n\n   ")}\n\n`);
    expect(save().disabled).toBe(true);
    fireEvent.submit(document.querySelector("form"));
    await settled();
    expect(writes()).toEqual([]);
  });
});

describe("the two counters of a text of lines", () => {
  it("show the number of lines of the limit, and the longest line of the limit", async () => {
    await open();
    expect(screen.getByTestId("count-body").textContent).toBe("4 / 8 lines");
    expect(screen.getByTestId("longest-body").textContent).toBe(`Longest line: ${Math.max(...SEED_BODY.split("\n").map((line) => Array.from(line).length))} / 400`);
    type("Text", "ab\nabcdef\n\n\nabc");
    expect(screen.getByTestId("count-body").textContent).toBe("3 / 8 lines"); // the blank lines are not lines
    expect(screen.getByTestId("longest-body").textContent).toBe("Longest line: 6 / 400");
  });

  it("count letters like the server: an emoji is one", async () => {
    await open();
    const wave = "\u{1F30A}";
    type("Text", `${wave.repeat(400)}\nshort`);
    expect(wave.repeat(400).length).toBe(800); // the fixture: .length would say 800
    expect(screen.getByTestId("longest-body").textContent).toBe("Longest line: 400 / 400");
    expect(screen.queryByTestId("longline-body")).toBeNull();
    expect(save().disabled).toBe(false);
  });

  it("the title keeps the one counter it had, and shows no second one", async () => {
    await open();
    expect(screen.getByTestId("longest-body")).toBeTruthy(); // the fixture: the body has its two
    expect(screen.getByTestId("count-title").textContent).toMatch(/^\d+ \/ 160$/);
    expect(screen.queryByTestId("longest-title")).toBeNull();
    expect(screen.queryByTestId("toomanylines-title")).toBeNull();
  });

  it("the paragraphs of the Why Visit keep the one counter they had: all the letters, of 600", async () => {
    await open("why_visit");
    expect(screen.getByTestId("count-body").textContent).toMatch(/^\d+ \/ 600$/);
    expect(screen.queryByTestId("longest-body")).toBeNull();
  });
});

describe("the limits of a text of lines", () => {
  it("a line of 401 letters is refused before Save, named by its number, with the letters over", async () => {
    await open();
    type("Text", `short\n\n${"x".repeat(401)}\nok`);
    const message = screen.getByTestId("longline-body");
    expect(message.textContent).toBe("Line 2 is too long by 1 letter."); // the blank line before it does not count
    expect(message.getAttribute("role")).toBe("alert");
    expect(save().disabled).toBe(true);
  });

  it("names every line that is too long", async () => {
    await open();
    type("Text", `${"a".repeat(405)}\nfine\n${"b".repeat(410)}`);
    expect(screen.getAllByTestId("longline-body").map((node) => node.textContent)).toEqual(["Line 1 is too long by 5 letters.", "Line 3 is too long by 10 letters."]);
  });

  it("a line of exactly 400 letters is accepted", async () => {
    await open();
    type("Text", `${"x".repeat(400)}\nok`);
    expect(screen.queryByTestId("longline-body")).toBeNull();
    expect(save().disabled).toBe(false);
  });

  it("nine lines are too many, eight are not, and the blank lines are not counted", async () => {
    await open();
    const nine = Array.from({ length: 9 }, (_, index) => `line ${index + 1}`).join("\n");
    type("Text", nine);
    expect(screen.getByTestId("toomanylines-body").textContent).toBe("Too many lines by 1. The most it can have is 8.");
    expect(save().disabled).toBe(true);
    type("Text", Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join("\n\n\n"));
    expect(screen.queryByTestId("toomanylines-body")).toBeNull();
    expect(screen.getByTestId("count-body").textContent).toBe("8 / 8 lines"); // eight lines with blank ones between
    expect(save().disabled).toBe(false);
  });

  it("says how many lines over", async () => {
    await open();
    type("Text", Array.from({ length: 12 }, (_, index) => `l${index}`).join("\n"));
    expect(screen.getByTestId("toomanylines-body").textContent).toBe("Too many lines by 4. The most it can have is 8.");
  });

  it("no line at all is refused as the server does: the text is required", async () => {
    await open();
    type("Text", "\n  \n\t\n");
    expect(screen.getByText("The text is required.")).toBeTruthy();
    expect(save().disabled).toBe(true);
    expect(screen.getByTestId("count-body").textContent).toBe("0 / 8 lines");
  });
});

describe("a line that starts with a bullet", () => {
  it("is warned about before Save, with the number of the line as the server counts it, and Save stays open (the server decides)", async () => {
    await open();
    type("Text", `\n\nfine\n${BULLET} bad one\nalso fine`);
    const warning = screen.getByTestId("warning-body");
    expect(warning.textContent).toBe(`Line 2 starts with a bullet (${BULLET}). The app puts the bullet in front of every line by itself, so write the line without it.`);
    expect(warning.getAttribute("role")).toBe("note");
    expect(save().disabled).toBe(false); // a warning, not a refusal
  });

  it("warns of every such line", async () => {
    await open();
    type("Text", `${BULLET} one\ntwo\n${BULLET}three`);
    expect(screen.getAllByTestId("warning-body").map((node) => node.textContent.match(/^Line (\d+) starts with a bullet/)[1])).toEqual(["1", "3"]);
  });

  it("does not warn of a bullet in the middle of a line, or of another sign at the start", async () => {
    await open();
    type("Text", `a ${BULLET} b\n- dash\n* star`);
    expect(screen.queryByTestId("warning-body")).toBeNull();
  });

  it("is not warned about in a text of one line or of paragraphs (the server only refuses it in a text of lines)", async () => {
    await open("why_visit");
    type("Text", `${BULLET} a paragraph that starts with a bullet`);
    expect(screen.queryByTestId("warning-body")).toBeNull();
    type("Title", `${BULLET} a title`);
    expect(screen.queryByTestId("warning-title")).toBeNull();
  });

  it("when the server refuses the line anyway, its words are shown under the field and nothing typed is lost", async () => {
    const words = `Line 1 starts with a bullet (${BULLET}). The app puts the bullet in front of every line by itself, so write the line without it.`;
    state.failNext = { status: 400, body: { detail: words, body: [words] } };
    await open();
    type("Text", `${BULLET} typed`);
    fireEvent.click(save());
    expect((await screen.findByTestId("error-body")).textContent).toBe(words);
    expect(field("Text").value).toBe(`${BULLET} typed`);
  });
});

describe("the placeholders in a text of lines", () => {
  it("the buttons put a placeholder into the box of lines, at the caret", async () => {
    await open();
    type("Text", "Pay at ");
    fireEvent.click(within(screen.getByRole("group", { name: "Placeholders for the text" })).getByRole("button", { name: /fee_office/ }));
    expect(field("Text").value).toBe("Pay at {fee_office}");
  });
});

describe("the preview of a text of lines", () => {
  it("puts a bullet in front of every line, and fills the placeholders in", async () => {
    state.office = "Tourism Office, 2nd Floor";
    await open();
    const lines = screen.getByTestId("preview-body").querySelectorAll("li");
    expect(lines).toHaveLength(4); // the fixture: four lines of the seed, four bullets
    expect([...lines].map((line) => line.textContent.startsWith(`${BULLET} `))).toEqual([true, true, true, true]);
    expect(lines[2].textContent).toBe(`${BULLET} Environmental Fee: ₱80 per visitor. Pay at the Tourism Office, 2nd Floor.`); // {fee_regular} and {fee_office} filled
    expect(lines[2].querySelector('[data-kind="filled"]').getAttribute("title")).toBe("{fee_regular}");
  });

  it("follows what is typed, line by line", async () => {
    state.office = "Tourism Office";
    await open();
    type("Text", "one\n\n\ntwo");
    const lines = screen.getByTestId("preview-body").querySelectorAll("li");
    expect([...lines].map((line) => line.textContent)).toEqual([`${BULLET} one`, `${BULLET} two`]);
  });

  it("when the place of payment is not written, the built-in text shown instead is a list of bullets too", async () => {
    await open("port_guide", { builtIn: { title: "Built-in title", body: "First built-in line\nSecond built-in line" } });
    const body = screen.getByTestId("preview-body");
    expect(body.textContent).toContain("What the app will show instead"); // the fixture reached the case: {fee_office} has no place yet
    const lines = body.querySelectorAll("ul li");
    expect([...lines].map((line) => line.textContent)).toEqual([`${BULLET} First built-in line`, `${BULLET} Second built-in line`]);
  });

  it("a text of paragraphs is still a paragraph, not a list of bullets", async () => {
    await open("why_visit");
    expect(screen.getAllByTestId("preview-body").every((node) => node.querySelector("li") === null)).toBe(true);
    expect(screen.getAllByTestId("preview-body")[0].querySelector("p")).not.toBeNull();
  });
});

describe("the text of paragraphs and of one line are what they were", () => {
  it("a text of paragraphs keeps its blank line (three new lines are two), a line has no new line", async () => {
    await open("why_visit");
    type("Text", "a   b\n\n\n\nc  \n d");
    type("Subtitle", "x\ny");
    fireEvent.click(save());
    await screen.findByText(SAVED_NOTICE);
    expect(writes().map((r) => r.body)).toEqual([{ subtitle: "x y", body: "a   b\n\nc\n d" }]);
    expect(field("Text").tagName).toBe("TEXTAREA");
    expect(field("Text").rows).toBe(6);
  });

  it("their counter is one number of all the letters, and a text of paragraphs shows no number of lines", async () => {
    await open("why_visit");
    expect(screen.getByTestId("count-body").textContent).toMatch(/^\d+ \/ 600$/);
    expect(screen.queryByTestId("longest-body")).toBeNull();
    expect(screen.queryByTestId("toomanylines-body")).toBeNull();
    type("Text", "x".repeat(601));
    expect(screen.getByText("Too long by 1 letter.")).toBeTruthy();
    expect(save().disabled).toBe(true);
  });
});
