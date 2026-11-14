import { readFileSync } from "fs";
import { join } from "path";
import { REGULAR_ENTRANCE_FEE, DISCOUNTED_ENTRANCE_FEE } from "./entranceFee";
import {
  RECORD_EDIT_FIELDS,
  RECORD_EDIT_ROLES,
  canEditRecords,
  recordEditBlankProblem,
  recordEditChanges,
  recordEditPayload,
  serverErrorLines,
} from "./recordEdit";

// What this screen sends and who may send it is what the server says, read from the server's own files, so that the two cannot drift apart.
const BACKEND = join(__dirname, "..", "..", "..", "..", "backend", "api");
const read = (file) => readFileSync(join(BACKEND, file), "utf8");

describe("what the screen sends is what the server allows", () => {
  it("the 14 fields are the server's editable fields, without the status (a PATCH of its own, sent by the Arrived / Cancelled buttons)", () => {
    const block = read("serializers.py").match(/TOURIST_RECORD_EDITABLE_FIELDS = \(([\s\S]*?)\)/)[1];
    const server = Array.from(block.matchAll(/"([a-z0-9_]+)"/g)).map((match) => match[1]);
    expect(server).toContain("status");
    expect([...RECORD_EDIT_FIELDS].sort()).toEqual(server.filter((name) => name !== "status").sort());
    expect(RECORD_EDIT_FIELDS).toHaveLength(14);
  });

  it("admin and the Tourism Office, equal, as the server's MODULE_ROLES for tourism", () => {
    const block = read("permissions.py").match(/"tourism": \{([^}]*)\}/)[1];
    const server = Array.from(block.matchAll(/ROLE_([A-Z]+)/g)).map((match) => match[1].toLowerCase());
    expect([...RECORD_EDIT_ROLES].sort()).toEqual(server.sort());
    ["admin", "tourism"].forEach((role) => expect(canEditRecords(role)).toBe(true));
    ["resort", "sanitation", "tourist", "establishment", "", undefined].forEach((role) => expect(canEditRecords(role)).toBe(false));
  });

  it("the Environmental Fee rates are the server's (services/tourism.py), so the live fee is the one that will be worked out", () => {
    const source = read("services/tourism.py");
    expect(Number(source.match(/REGULAR_ENTRANCE_FEE = (\d+)/)[1])).toBe(REGULAR_ENTRANCE_FEE);
    expect(Number(source.match(/DISCOUNTED_ENTRANCE_FEE = (\d+)/)[1])).toBe(DISCOUNTED_ENTRANCE_FEE);
  });
});

describe("recordEditPayload", () => {
  const form = {
    filipino_count: "3", foreigner_count: "1", maubanin_count: "2", total_male: "2", total_female: "2", age_0_7: "1", age_8_59: "2", age_60_above: "1",
    special_group_count: "0", discounted_count: "2", itinerary_id: "12", resort_id: "4", boat_capacity_fare: "3-4 pax", first_name: "X", email: "x@x.test",
    status: "arrived",
  };

  it("is exactly the 14, as numbers (the tier as its text), with the total worked out and nothing else", () => {
    const payload = recordEditPayload(form);
    expect(Object.keys(payload).sort()).toEqual([...RECORD_EDIT_FIELDS].sort());
    expect(payload).toEqual({
      foreigner_count: 1, filipino_count: 3, maubanin_count: 2, total_visitors: 4, total_male: 2, total_female: 2, age_0_7: 1, age_8_59: 2,
      age_60_above: 1, special_group_count: 0, discounted_count: 2, itinerary_id: 12, resort_id: 4, boat_capacity_fare: "3-4 pax",
    });
  });

  it("a record and a form of the same values give the same payload, so before and after can be compared", () => {
    const record = { ...form, filipino_count: 3, foreigner_count: 1, itinerary_id: 12, resort_id: 4 };
    expect(recordEditPayload(record)).toEqual(recordEditPayload(form));
  });

  it("Maubanin is 0 when there is no Filipino", () => {
    expect(recordEditPayload({ ...form, filipino_count: "0", maubanin_count: "2" }).maubanin_count).toBe(0);
  });
});

describe("recordEditChanges", () => {
  const names = { itinerary: (id) => ({ 11: "5 Nights and above", 12: "2 Nights" }[id]), resort: (id) => ({ 3: "Tent Place", 4: "Orlan Beach Resort" }[id]) };
  const before = recordEditPayload({
    filipino_count: 12, foreigner_count: 0, maubanin_count: 0, total_male: 6, total_female: 6, age_0_7: 0, age_8_59: 12, age_60_above: 0,
    special_group_count: 0, discounted_count: 0, itinerary_id: 11, resort_id: 3,
  });

  it("names only what changed: old and new, the three first and then the fee", () => {
    const after = recordEditPayload({ ...before, filipino_count: 9, total_male: 5, total_female: 4, age_8_59: 9, itinerary_id: 12, resort_id: 4 });
    expect(recordEditChanges(before, after, names).map((c) => [c.label, c.from, c.to])).toEqual([
      ["Pax", "12", "9"],
      ["Length of stay", "5 Nights and above", "2 Nights"],
      ["Resort", "Tent Place", "Orlan Beach Resort"],
      ["Environmental Fee", "₱960", "₱720"],
      ["Filipinos", "12", "9"],
      ["Male", "6", "5"],
      ["Female", "6", "4"],
      ["Age 8-59", "12", "9"],
    ]);
  });

  it("names the Boat Capacity and Fare, old and new, after the resort and before the fee; a tier never chosen is (none)", () => {
    const withTier = (tier) => ({ ...before, boat_capacity_fare: tier });
    expect(recordEditChanges(withTier("11-12 pax"), withTier("5-6 pax"), names).map((c) => [c.label, c.from, c.to])).toEqual([
      ["Boat capacity and fare", "11-12 pax", "5-6 pax"],
    ]);
    expect(recordEditChanges(withTier(""), withTier("5-6 pax"), names).map((c) => [c.label, c.from, c.to])).toEqual([
      ["Boat capacity and fare", "(none)", "5-6 pax"],
    ]);
    const all = recordEditPayload({ ...before, filipino_count: 9, total_male: 5, total_female: 4, age_8_59: 9, resort_id: 4, boat_capacity_fare: "9-10 pax" });
    const labels = recordEditChanges(withTier("11-12 pax"), all, names).map((c) => c.label);
    expect(labels.slice(0, 4)).toEqual(["Pax", "Resort", "Boat capacity and fare", "Environmental Fee"]);
  });

  it("nothing changed gives nothing", () => {
    expect(recordEditChanges(before, { ...before }, names)).toEqual([]);
  });
});

describe("recordEditBlankProblem", () => {
  const ok = { resort_id: "3", itinerary_id: "11", discounted_count: "0" };
  it("is quiet when the three are there, 0 included", () => expect(recordEditBlankProblem(ok)).toBe(""));
  it("says what is missing", () => {
    expect(recordEditBlankProblem({ ...ok, resort_id: "" })).toBe("Resort is required.");
    expect(recordEditBlankProblem({ ...ok, itinerary_id: "" })).toBe("Length of Stay is required.");
    expect(recordEditBlankProblem({ ...ok, discounted_count: "" })).toMatch(/^Discounted is required\. Write 0/);
  });
});

describe("serverErrorLines", () => {
  it("gives one line for each field the server names, and its words as they are", () => {
    const error = { details: { email: ["No."], discounted_count: ["Too many.", "Really."] } };
    expect(serverErrorLines(error)).toEqual(["email: No.", "discounted_count: Too many. Really."]);
  });
  it("names the refused fields together and writes what a record may change ONCE, at the end (the server repeats it for each field)", () => {
    const allowed = "A record may only change: foreigner_count, filipino_count, status.";
    const error = {
      details: {
        email: [`This field cannot be changed here. ${allowed}`],
        arrival_date: [`This field cannot be changed here. ${allowed}`],
        discounted_count: ["The discounted count (4) cannot be greater than the number of visitors (3)."],
      },
    };
    const lines = serverErrorLines(error);
    expect(lines).toEqual([
      "discounted_count: The discounted count (4) cannot be greater than the number of visitors (3).",
      "These fields cannot be changed here: email, arrival_date.",
      allowed,
    ]);
    expect(lines.join(" ").match(/A record may only change/g)).toHaveLength(1);
  });
  it("a single message stays a single message", () => {
    expect(serverErrorLines({ details: { detail: "You do not have access to this module." } })).toEqual(["You do not have access to this module."]);
    expect(serverErrorLines(new Error("Network down"))).toEqual(["Network down"]);
  });
  it("is never an empty list and never a made-up 'something went wrong'", () => {
    expect(serverErrorLines({})[0]).toMatch(/sent no reason/);
  });
});
