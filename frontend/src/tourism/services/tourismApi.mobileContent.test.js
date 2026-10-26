// The Mobile App Content blocks as the web page will call them (Commit 5a): the two methods of tourismApi and the way a 409
// "confirm_required" is told from every other failure. The REAL apiRequest builds the requests; a fake fetch answers.
import { blockConfirmRequired, tourismApi } from "./tourismApi";
import { AUTH_TOKEN_KEY } from "../../shared/apiClient";

let requests;
let answer;

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  });
}

beforeEach(() => {
  requests = [];
  answer = () => reply(200, { key: "welcome" });
  window.localStorage.setItem(AUTH_TOKEN_KEY, "token-123");
  global.fetch = jest.fn((url, options = {}) => {
    requests.push({
      method: (options.method || "GET").toUpperCase(),
      path: url.replace(/^.*\/api/, ""),
      body: options.body ? JSON.parse(options.body) : null,
      rawBody: options.body,
      headers: options.headers,
    });
    return answer();
  });
});
afterEach(() => window.localStorage.removeItem(AUTH_TOKEN_KEY));

const failure = async (call) => {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error("the call was expected to fail");
};

const CONFIRM = {
  detail: "This change takes the place where the fee is paid out of the text, so visitors will no longer be told it here. It needs a confirmation.",
  code: "confirm_required",
  dropped: ["fee_office"],
};

describe("getMobileContentBlocks", () => {
  it("asks for the list, once, as the logged-in admin, and returns what the server sent", async () => {
    const list = { blocks: [{ key: "welcome" }], fee: { regular: 80, discounted: 64 }, placeholders: { name: "x" } };
    answer = () => reply(200, list);
    expect(await tourismApi.getMobileContentBlocks()).toEqual(list);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "GET", path: "/mobile-content/blocks/", body: null });
    expect(requests[0].headers.Authorization).toBe("Token token-123");
  });

  it("lets a refusal through as it came: the status, the server's words and the details", async () => {
    answer = () => reply(403, { detail: "Only the system admin can manage the content of the mobile app." });
    const error = await failure(() => tourismApi.getMobileContentBlocks());
    expect(error.status).toBe(403);
    expect(error.message).toBe("Only the system admin can manage the content of the mobile app.");
    expect(error.details).toEqual({ detail: "Only the system admin can manage the content of the mobile app." });
    expect(requests).toHaveLength(1); // not asked again
  });
});

describe("updateMobileContentBlock", () => {
  it("sends one PATCH to the block, with ONLY the fields it was given", async () => {
    await tourismApi.updateMobileContentBlock("welcome", { subtitle: "A new line." });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "PATCH", path: "/mobile-content/blocks/welcome/", body: { subtitle: "A new line." } });
    expect(Object.keys(requests[0].body)).toEqual(["subtitle"]); // no title, no body, no key, no confirmation
  });

  it("sends the confirmation, as a list, only when it is given", async () => {
    await tourismApi.updateMobileContentBlock("why_visit", { body: "No place named." }, ["fee_office"]);
    expect(requests[0].body).toEqual({ body: "No place named.", confirm_dropped: ["fee_office"] });
    await tourismApi.updateMobileContentBlock("why_visit", { body: "Again." }, ["fee_discounted", "fee_regular"]);
    expect(requests[1].body.confirm_dropped).toEqual(["fee_discounted", "fee_regular"]); // as given: the server sorts
    await tourismApi.updateMobileContentBlock("why_visit", { body: "Third." }, []);
    expect(requests[2].body).toEqual({ body: "Third.", confirm_dropped: [] }); // an empty list is still a list
    await tourismApi.updateMobileContentBlock("why_visit", { body: "Fourth." });
    expect("confirm_dropped" in requests[3].body).toBe(false); // absent, not null
    expect(requests[3].rawBody).not.toContain("confirm_dropped");
  });

  it("puts the key in the address safely", async () => {
    await tourismApi.updateMobileContentBlock("a/b c", { title: "x" });
    expect(requests[0].path).toBe("/mobile-content/blocks/a%2Fb%20c/");
  });

  it("does not change what it was given", async () => {
    const changes = Object.freeze({ title: "Kept" });
    const confirm = Object.freeze(["fee_office"]);
    await tourismApi.updateMobileContentBlock("welcome", changes, confirm);
    expect(changes).toEqual({ title: "Kept" });
    expect(confirm).toEqual(["fee_office"]);
  });

  it("refuses, before any request, a confirmation that is not a list, or one hidden among the changes", async () => {
    for (const bad of ["fee_office", { fee_office: true }, null, 1, true]) {
      const error = await failure(() => tourismApi.updateMobileContentBlock("welcome", { title: "x" }, bad));
      expect(error).toBeInstanceOf(TypeError);
    }
    const hidden = await failure(() => tourismApi.updateMobileContentBlock("welcome", { title: "x", confirm_dropped: ["fee_office"] }));
    expect(hidden).toBeInstanceOf(TypeError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns the block as the server answered, warnings and all", async () => {
    const block = { key: "welcome", title: "Mabuhay!", warnings: ["The welcome banner no longer uses the visitor's name, so everyone is greeted the same way."] };
    answer = () => reply(200, block);
    expect(await tourismApi.updateMobileContentBlock("welcome", { title: "Mabuhay!" })).toEqual(block);
  });

  it("lets a refusal of a field through with its details, and sends the request only once", async () => {
    answer = () => reply(400, { detail: "The title is 161 letters long. The most it can have here is 160.", title: ["The title is 161 letters long. The most it can have here is 160."] });
    const error = await failure(() => tourismApi.updateMobileContentBlock("welcome", { title: "x".repeat(161) }));
    expect(error.status).toBe(400);
    expect(error.details.title).toEqual(["The title is 161 letters long. The most it can have here is 160."]);
    expect(requests).toHaveLength(1);
  });
});

describe("telling a request to confirm from every other failure", () => {
  it("a 409 confirm_required carries the names and the server's words", async () => {
    answer = () => reply(409, CONFIRM);
    const error = await failure(() => tourismApi.updateMobileContentBlock("why_visit", { body: "No place." }));
    expect(error.status).toBe(409);
    expect(blockConfirmRequired(error)).toEqual({ dropped: ["fee_office"], message: CONFIRM.detail });
  });

  it("gives back a copy of the list, not the server's own array", async () => {
    answer = () => reply(409, CONFIRM);
    const error = await failure(() => tourismApi.updateMobileContentBlock("why_visit", { body: "No place." }));
    const asked = blockConfirmRequired(error);
    asked.dropped.push("x");
    expect(error.details.dropped).toEqual(["fee_office"]);
  });

  it("sends it again with the same names and the answer is the block", async () => {
    answer = () => reply(409, CONFIRM);
    const error = await failure(() => tourismApi.updateMobileContentBlock("why_visit", { body: "No place." }));
    answer = () => reply(200, { key: "why_visit", body: "No place.", warnings: [] });
    const saved = await tourismApi.updateMobileContentBlock("why_visit", { body: "No place." }, blockConfirmRequired(error).dropped);
    expect(saved.body).toBe("No place.");
    expect(requests.map((r) => r.body)).toEqual([{ body: "No place." }, { body: "No place.", confirm_dropped: ["fee_office"] }]);
  });

  it("is null for anything that is not that: another 409, another code, a refusal of a field, a lost connection, a 500", async () => {
    const make = (status, details) => Object.assign(new Error("x"), { status, details });
    const others = [
      make(409, { detail: "x", code: "text_in_use", dropped: ["fee_office"] }),
      make(409, { detail: "x", code: "confirm_required" }),
      make(409, { detail: "x", code: "confirm_required", dropped: "fee_office" }),
      make(409, { detail: "x", dropped: ["fee_office"] }),
      make(409, null),
      make(409, "text"),
      make(400, { detail: "x", code: "confirm_required", dropped: ["fee_office"] }),
      make(403, CONFIRM),
      make(500, { detail: "x" }),
      make(undefined, undefined),
      new Error("Cannot connect to the backend"),
      null,
      undefined,
    ];
    others.forEach((error, index) => expect({ index, asked: blockConfirmRequired(error) }).toEqual({ index, asked: null }));
    expect(blockConfirmRequired(make(409, CONFIRM))).not.toBeNull(); // the fixture: the one that IS, is found
  });
});
