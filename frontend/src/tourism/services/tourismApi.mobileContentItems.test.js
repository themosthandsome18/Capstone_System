// The Mobile App Content ITEMS as the web page will call them (Commit 6a): the list, the add, the edit, the switch off and the bringing back, and the way
// a 409 "confirm_required" is told from every other failure (the same blockConfirmRequired as the blocks). The REAL apiRequest builds the requests; a fake
// fetch answers. The addresses are held to backend/api/urls.py, so a path the backend changes makes this test fail.
import fs from "fs";
import path from "path";
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
  answer = () => reply(200, { id: 7 });
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

describe("getMobileContentItems", () => {
  it("asks for the items of ONE section, once, as the logged-in admin, and returns what the server sent", async () => {
    const list = [{ id: 1, section: "why_visit", title: "One" }];
    answer = () => reply(200, list);
    expect(await tourismApi.getMobileContentItems("why_visit")).toEqual(list);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "GET", path: "/mobile-content/items/?section=why_visit", body: null });
    expect(requests[0].headers.Authorization).toBe("Token token-123");
  });

  it("asks for the items of the other section too, and for every item when no section is given", async () => {
    await tourismApi.getMobileContentItems("travel_guide");
    await tourismApi.getMobileContentItems();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /mobile-content/items/?section=travel_guide", "GET /mobile-content/items/"]);
  });

  it("puts the section in the address safely", async () => {
    await tourismApi.getMobileContentItems("a b&c=d");
    expect(requests[0].path).toBe("/mobile-content/items/?section=a%20b%26c%3Dd");
  });

  it("lets a refusal through as it came: the status, the server's words and the details", async () => {
    answer = () => reply(400, { detail: "That section does not exist.", section: ["Not a section."] });
    const error = await failure(() => tourismApi.getMobileContentItems("nope"));
    expect(error.status).toBe(400);
    expect(error.message).toBe("That section does not exist.");
    expect(error.details.section).toEqual(["Not a section."]);
  });
});

describe("createMobileContentItem", () => {
  it("sends one POST with exactly the values given, and returns the item the server made", async () => {
    answer = () => reply(201, { id: 9, title: "New", warnings: [] });
    const values = { section: "why_visit", title: "New", short_text: "A line", full_text: "", icon: "beach", display_order: 50 };
    expect(await tourismApi.createMobileContentItem(values)).toEqual({ id: 9, title: "New", warnings: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST", path: "/mobile-content/items/", body: values });
    expect(requests[0].headers.Authorization).toBe("Token token-123");
  });

  it("sends nothing that was not given (no position: the server puts the item at the end)", async () => {
    await tourismApi.createMobileContentItem({ section: "travel_guide", title: "T", short_text: "S" });
    expect(requests[0].body).toEqual({ section: "travel_guide", title: "T", short_text: "S" });
    expect(Object.keys(requests[0].body)).not.toContain("display_order");
  });

  it("does not change the object it was given", async () => {
    const values = { section: "why_visit", title: "T", short_text: "S" };
    const copy = JSON.stringify(values);
    await tourismApi.createMobileContentItem(values);
    expect(JSON.stringify(values)).toBe(copy);
  });

  it("lets the refusals through with their details (a position held, a title taken, a section full)", async () => {
    answer = () => reply(400, { detail: "Position 20 is already used by 'X'. Free positions next to it: 15 (just before it) and 25 (just after it).", display_order: ["Position 20 is already used by 'X'."] });
    const error = await failure(() => tourismApi.createMobileContentItem({ section: "why_visit", title: "T", short_text: "S", display_order: 20 }));
    expect(error.status).toBe(400);
    expect(error.details.display_order[0]).toMatch(/already used/);
    expect(blockConfirmRequired(error)).toBeNull();
  });
});

describe("updateMobileContentItem", () => {
  it("sends one PATCH with only the changes, to the address of that item", async () => {
    answer = () => reply(200, { id: 12, title: "Changed", warnings: [] });
    expect(await tourismApi.updateMobileContentItem(12, { title: "Changed" })).toEqual({ id: 12, title: "Changed", warnings: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "PATCH", path: "/mobile-content/items/12/", body: { title: "Changed" } });
    expect(requests[0].headers.Authorization).toBe("Token token-123");
  });

  it("takes the id as a whole number or as digits (an address gives text)", async () => {
    await tourismApi.updateMobileContentItem("12", { icon: "boat" });
    await tourismApi.updateMobileContentItem(3, { display_order: 30 });
    expect(requests.map((r) => r.path)).toEqual(["/mobile-content/items/12/", "/mobile-content/items/3/"]);
  });

  it("refuses an id that could change the address, before anything is sent", async () => {
    for (const bad of ["12/deactivate", "../1", "1?x=1", "", " 12", "1.5", 0, -1, 1.5, null, undefined, {}, NaN]) {
      await expect(tourismApi.updateMobileContentItem(bad, { title: "x" })).rejects.toThrow(TypeError);
    }
    expect(requests).toHaveLength(0);
  });

  it("sends the confirmation in confirm_dropped, with the names the server asked about", async () => {
    await tourismApi.updateMobileContentItem(12, { full_text: "no placeholder now" }, ["fee_office"]);
    expect(requests[0].body).toEqual({ full_text: "no placeholder now", confirm_dropped: ["fee_office"] });
  });

  it("sends no confirm_dropped when there is no confirmation", async () => {
    await tourismApi.updateMobileContentItem(12, { title: "x" });
    expect(Object.keys(requests[0].body)).toEqual(["title"]);
  });

  it("does not take a confirmation hidden among the changes, nor one that is not a list", async () => {
    await expect(tourismApi.updateMobileContentItem(12, { title: "x", confirm_dropped: ["fee_office"] })).rejects.toThrow(TypeError);
    await expect(tourismApi.updateMobileContentItem(12, { title: "x" }, "fee_office")).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });

  it("tells a request to confirm (409 confirm_required) from any other failure", async () => {
    answer = () => reply(409, CONFIRM);
    const asked = await failure(() => tourismApi.updateMobileContentItem(12, { full_text: "x" }));
    expect(asked.status).toBe(409);
    expect(blockConfirmRequired(asked)).toEqual({ dropped: ["fee_office"], message: CONFIRM.detail });
  });

  it("does not take another 409, a 400, or a 403 for a request to confirm", async () => {
    answer = () => reply(409, { detail: "Something else clashed." });
    expect(blockConfirmRequired(await failure(() => tourismApi.updateMobileContentItem(12, { title: "x" })))).toBeNull();
    answer = () => reply(400, { ...CONFIRM });
    expect(blockConfirmRequired(await failure(() => tourismApi.updateMobileContentItem(12, { title: "x" })))).toBeNull();
    answer = () => reply(403, { detail: "Only the system admin can manage the content of the mobile app." });
    const forbidden = await failure(() => tourismApi.updateMobileContentItem(12, { title: "x" }));
    expect(forbidden.status).toBe(403);
    expect(blockConfirmRequired(forbidden)).toBeNull();
  });

  it("lets the field errors through (a length, a position held, an icon, a placeholder)", async () => {
    answer = () => reply(400, { detail: "The title is 61 letters long. The most it can have here is 60.", title: ["The title is 61 letters long. The most it can have here is 60."] });
    const error = await failure(() => tourismApi.updateMobileContentItem(12, { title: "x".repeat(61) }));
    expect(error.status).toBe(400);
    expect(error.details.title[0]).toMatch(/61 letters/);
  });
});

describe("deactivateMobileContentItem and reactivateMobileContentItem", () => {
  it("switch an item off with one POST that has no body, and bring it back with another", async () => {
    answer = () => reply(200, { id: 5, is_active: false, warnings: ["No item of “Why Visit” is shown now, so the app will leave that whole part out."] });
    const off = await tourismApi.deactivateMobileContentItem(5);
    expect(off.warnings).toHaveLength(1);
    answer = () => reply(200, { id: 5, is_active: true, warnings: [] });
    await tourismApi.reactivateMobileContentItem("5");
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["POST /mobile-content/items/5/deactivate/", "POST /mobile-content/items/5/reactivate/"]);
    expect(requests.every((r) => r.rawBody === undefined)).toBe(true);
  });

  it("refuse an id that is not a whole number, before anything is sent", async () => {
    await expect(tourismApi.deactivateMobileContentItem("5/reactivate")).rejects.toThrow(TypeError);
    await expect(tourismApi.reactivateMobileContentItem(undefined)).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });
});

describe("there is no way to delete an item, and no call for one item", () => {
  it("tourismApi has no delete or get-one method for the items", () => {
    const names = Object.keys(tourismApi).filter((name) => /MobileContentItem/.test(name)).sort();
    expect(names).toEqual(["createMobileContentItem", "deactivateMobileContentItem", "getMobileContentItems", "reactivateMobileContentItem", "updateMobileContentItem"]);
    expect(names).toContain("getMobileContentItems"); // the list: the fixture reached the case; it is the only way to read
    expect(Object.keys(tourismApi).some((name) => /delete.*MobileContentItem|MobileContentItem.*delete/i.test(name))).toBe(false);
  });
});

describe("the addresses are the backend's", () => {
  const URLS = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "backend", "api", "urls.py"), "utf8");

  it("urls.py has the four addresses the methods use, with the id as a whole number", () => {
    const found = [...URLS.matchAll(/path\("(mobile-content\/items\/[^"]*)"/g)].map((match) => match[1]);
    expect(found).toEqual([
      "mobile-content/items/",
      "mobile-content/items/<int:item_id>/",
      "mobile-content/items/<int:item_id>/deactivate/",
      "mobile-content/items/<int:item_id>/reactivate/",
    ]);
  });

  it("each method calls one of them", async () => {
    await tourismApi.getMobileContentItems("why_visit");
    await tourismApi.createMobileContentItem({ section: "why_visit", title: "T", short_text: "S" });
    await tourismApi.updateMobileContentItem(8, { title: "x" });
    await tourismApi.deactivateMobileContentItem(8);
    await tourismApi.reactivateMobileContentItem(8);
    const shapes = requests.map((r) => r.path.replace(/\?.*$/, "").replace(/\/\d+\//g, "/<int:item_id>/"));
    expect(shapes).toEqual([
      "/mobile-content/items/",
      "/mobile-content/items/",
      "/mobile-content/items/<int:item_id>/",
      "/mobile-content/items/<int:item_id>/deactivate/",
      "/mobile-content/items/<int:item_id>/reactivate/",
    ]);
    shapes.forEach((shape) => expect(URLS).toContain(`path("${shape.slice(1)}"`));
  });
});
