/**
 * The modal of one arrival: what it says, from the record the server sent and the web's referenceTables.
 * The figures of the split and of the fee are the server's (`computed`); the web only writes them down.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import ArrivalRecordModal from "./ArrivalRecordModal";
import { buildArrivalRecordView, DASH } from "../utils/arrivalRecordView";
import { expectedNorm, normalised } from "../testing/cssRules";

const REFERENCE = {
  countries: [{ id: 1, name: "Philippines" }, { id: 2, name: "Japan" }],
  regions: [{ id: 4, name: "CALABARZON Region" }],
  provinces: [{ id: 41, name: "Quezon" }],
  itineraries: [{ id: 7, name: "2 Nights", stay_nights: 2 }],
  travelModes: [{ id: 3, name: "Public Bus" }],
  boatTypes: [{ id: 2, name: "Tourist Boat" }],
  visitPurposes: [{ id: 5, name: "Outing" }],
  resorts: [{ resort_id: 9, resort_name: "Aquazul Hotel and Resort", location: "Cagbalete Island, Mauban", access: "Boat Access" }],
};

// Numbers that no real calculation of this record would give, so a figure on the screen can only have come from here.
const RECORD = {
  survey_id: "SURV-2026-001",
  submitted_at: "2026-04-02T02:30:00Z",
  created_at: "2026-04-03T08:00:00Z",
  email: "someone@example.test",
  first_name: "Ana",
  last_name: "Reyes",
  full_name: "Ana Reyes",
  contact_number: "09170000000",
  country_id: 1,
  region_id: 4,
  province_id: 41,
  total_visitors: 6,
  total_male: 2,
  total_female: 4,
  discounted_count: 2,
  arrival_date: "2026-04-02",
  itinerary_id: 7,
  resort_id: 9,
  travel_mode_id: 3,
  boat_type_id: 2,
  visit_purpose_id: 5,
  status: "arrived",
  computed: {
    overnight: { male: 101, female: 202, total: 303 },
    sameDay: { male: 404, female: 505, total: 909 },
    fee: {
      total: 7777,
      regularCount: 41,
      regularRate: 81,
      regularTotal: 3321,
      discountedCount: 17,
      discountedRate: 65,
      discountedTotal: 1105,
    },
  },
};

const BLANK = { survey_id: "SURV-2026-099", computed: {} };

function draw(record = RECORD, extra = {}) {
  const props = { record, referenceTables: REFERENCE, onClose: jest.fn(), onOpenDestination: jest.fn(), ...extra };
  render(<ArrivalRecordModal {...props} />);
  return props;
}

const modal = () => document.querySelector(".arm-modal");
const groups = () => Array.from(document.querySelectorAll(".arm-group"));
const valueOf = (group, label) => {
  const cell = Array.from(group.querySelectorAll(".arm-grid > div")).find((c) => c.querySelector(".arm-label")?.textContent === label);
  return cell ? cell.querySelector(".arm-value").textContent : null;
};
const labelsOf = (group) => Array.from(group.querySelectorAll(".arm-label")).map((l) => l.textContent);

describe("the modal", () => {
  it("is a dialog with the name for its title", () => {
    draw();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("Ana Reyes");
    expect(dialog.getAttribute("aria-labelledby")).toBe(document.querySelector(".arm-name").id);
  });

  it("the band has the status with a check, the Length of Stay and the number of visitors, and a Close", () => {
    draw();
    const band = document.querySelector(".arm-band");
    const chips = Array.from(band.querySelectorAll(".arm-chip"));
    expect(chips.map((c) => c.textContent)).toEqual(["Arrived", "2 Nights", "6 visitors"]);
    expect(chips[0].classList.contains("status")).toBe(true);
    expect(chips[0].querySelector("svg")).not.toBeNull(); // the check
    expect(chips[1].querySelector("svg")).toBeNull();
    expect(within(band).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("the subline is the resort, a dot, and arrived with the date", () => {
    draw();
    expect(document.querySelector(".arm-sub").textContent).toBe("Aquazul Hotel and Resort · arrived Apr 2, 2026");
  });

  it("the button under the name is Open destination, and the footer has a Close", () => {
    draw();
    const actions = Array.from(document.querySelectorAll(".arm-actions button"));
    expect(actions.map((b) => b.textContent)).toEqual(["Open destination"]);
    expect(actions[0].classList.contains("primary")).toBe(true);
    expect(document.querySelector(".arm-footer button").textContent).toBe("Close");
  });

  it("there is no Print record in the modal: not as a button, not as text, and nothing in it calls window.print", () => {
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    draw();
    expect(screen.queryByRole("button", { name: /print/i })).toBeNull();
    expect(modal().textContent).not.toMatch(/print/i);
    for (const button of Array.from(modal().querySelectorAll("button"))) fireEvent.click(button);
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it("has seven groups, in this order, and none of them has an Edit", () => {
    draw();
    expect(groups().map((g) => g.querySelector("h3").textContent)).toEqual([
      "What the records say",
      "Male and female",
      "Tourist info",
      "Where they went",
      "Travel details",
      "Entrance fee",
      "Registration",
    ]);
    expect(within(modal()).queryByRole("button", { name: /edit/i })).toBeNull();
    expect(modal().querySelector("input, select, textarea")).toBeNull();
  });

  it("each group has its labels in the order of the design", () => {
    draw();
    expect(groups().map(labelsOf)).toEqual([
      ["Overnight", "Same day", "In the group", "Fee paid"],
      ["In the group", "Overnight", "Same day"],
      ["First name", "Last name", "Email", "Contact number", "Country"],
      ["Resort", "Location", "Region", "Province", "Access", "Length of stay"],
      ["Travel mode", "Boat type", "Visit purpose", "Arrival date", "Arrival status"],
      ["Total paid", "Regular", "Discounted"],
      ["Registered on", "Survey ID"],
    ]);
  });
});

describe("the figures are the server's `computed`, not worked out here", () => {
  it("What the records say: the totals of computed, with person-nights and person-days in the quieter words", () => {
    draw();
    const [first] = groups();
    expect(valueOf(first, "Overnight")).toBe("303 person-nights");
    expect(valueOf(first, "Same day")).toBe("909 person-days");
    expect(valueOf(first, "In the group")).toBe("6 visitors");
    expect(valueOf(first, "Fee paid")).toBe("₱7,777");
    const units = Array.from(first.querySelectorAll(".arm-unit")).map((u) => u.textContent);
    expect(units).toEqual(["person-nights", "person-days"]);
  });

  it("Male and female: the split of computed, and the record's own numbers for the group", () => {
    draw();
    const second = groups()[1];
    expect(valueOf(second, "In the group")).toBe("2 male · 4 female");
    expect(valueOf(second, "Overnight")).toBe("101 male · 202 female");
    expect(valueOf(second, "Same day")).toBe("404 male · 505 female");
  });

  it("Entrance fee: the total, and each line with its own count, rate and amount from computed (nothing multiplied here)", () => {
    draw();
    const fee = groups()[5];
    expect(valueOf(fee, "Total paid")).toBe("₱7,777");
    expect(valueOf(fee, "Regular")).toBe("41 × ₱81 = ₱3,321"); // 41 x 81 is 3321, but the screen is given it, not asked to work it out
    expect(valueOf(fee, "Discounted")).toBe("17 × ₱65 = ₱1,105");
    expect(fee.querySelector(".arm-note").textContent).toBe(
      "Worked out at report time from the current rates. It is not stored on the record."
    );
    expect(fee.querySelector(".arm-note").className).toBe("arm-note");
  });

  it("an amount that does not add up is still written as the server sent it: the screen does not correct it", () => {
    const odd = { ...RECORD, computed: { ...RECORD.computed, fee: { ...RECORD.computed.fee, regularTotal: 1 } } };
    draw(odd);
    expect(valueOf(groups()[5], "Regular")).toBe("41 × ₱81 = ₱1");
  });

  it("the singular: one visitor, one person-night, one person-day", () => {
    const one = {
      ...RECORD,
      total_visitors: 1,
      computed: { ...RECORD.computed, overnight: { male: 0, female: 1, total: 1 }, sameDay: { male: 0, female: 2, total: 1 } },
    };
    draw(one);
    const [first] = groups();
    expect(valueOf(first, "Overnight")).toBe("1 person-night");
    expect(valueOf(first, "Same day")).toBe("1 person-day");
    expect(valueOf(first, "In the group")).toBe("1 visitor");
  });
});

describe("names, from referenceTables", () => {
  it("the foreign keys become names", () => {
    draw();
    expect(valueOf(groups()[2], "Country")).toBe("Philippines");
    const where = groups()[3];
    expect(valueOf(where, "Resort")).toBe("Aquazul Hotel and Resort");
    expect(valueOf(where, "Location")).toBe("Cagbalete Island, Mauban");
    expect(valueOf(where, "Region")).toBe("CALABARZON Region");
    expect(valueOf(where, "Province")).toBe("Quezon");
    expect(valueOf(where, "Access")).toBe("Boat Access");
    expect(valueOf(where, "Length of stay")).toBe("2 Nights");
    const travel = groups()[4];
    expect(valueOf(travel, "Travel mode")).toBe("Public Bus");
    expect(valueOf(travel, "Boat type")).toBe("Tourist Boat");
    expect(valueOf(travel, "Visit purpose")).toBe("Outing");
    expect(valueOf(travel, "Arrival date")).toBe("Apr 2, 2026");
    expect(valueOf(travel, "Arrival status")).toBe("Arrived");
  });

  it("an id with no match in the tables is the dash, and so is a missing table", () => {
    const lost = { ...RECORD, country_id: 99, region_id: 99, province_id: 99, travel_mode_id: 99, boat_type_id: 99, visit_purpose_id: 99, itinerary_id: 99, resort_id: 99 };
    draw(lost);
    const everything = [2, 3, 4].flatMap((i) => labelsOf(groups()[i]).map((label) => [i, label]));
    const names = {
      Country: [2], Resort: [3], Location: [3], Region: [3], Province: [3], Access: [3], "Length of stay": [3],
      "Travel mode": [4], "Boat type": [4], "Visit purpose": [4],
    };
    for (const [i, label] of everything) {
      if (names[label]?.includes(i)) expect({ label, value: valueOf(groups()[i], label) }).toEqual({ label, value: DASH });
    }
    expect(document.querySelector(".arm-chips").textContent).toContain(DASH); // the Length of Stay chip
    expect(document.querySelector(".arm-sub").textContent.startsWith(`${DASH} ·`)).toBe(true);
  });

  it("an id that arrives as a text still finds its name", () => {
    draw({ ...RECORD, country_id: "2" });
    expect(valueOf(groups()[2], "Country")).toBe("Japan");
  });

  it("with no referenceTables at all nothing breaks", () => {
    draw(RECORD, { referenceTables: undefined });
    expect(valueOf(groups()[2], "Country")).toBe(DASH);
    expect(modal().textContent).not.toMatch(/undefined|null|NaN/);
  });
});

describe("blank, null and missing", () => {
  const forbidden = /undefined|null|NaN/;

  it("a record with nothing in it but its id: every value is the dash, and nothing says undefined, null or NaN", () => {
    draw(BLANK);
    expect(modal().textContent).not.toMatch(forbidden);
    expect(document.querySelector(".arm-name").textContent).toBe("SURV-2026-099"); // no name: the survey id
    for (const group of groups()) {
      for (const label of labelsOf(group)) {
        const value = valueOf(group, label);
        if (label === "Survey ID") expect(value).toBe("SURV-2026-099");
        else expect({ group: group.querySelector("h3").textContent, label, value }).toEqual({ group: group.querySelector("h3").textContent, label, value: DASH });
      }
    }
  });

  it("a record that is entirely null is not a crash", () => {
    const allNull = Object.fromEntries(Object.keys(RECORD).map((key) => [key, null]));
    expect(() => draw(allNull)).not.toThrow();
    expect(modal().textContent).not.toMatch(forbidden);
  });

  it("blank texts and numbers that are not numbers are the dash", () => {
    draw({
      ...RECORD,
      first_name: "   ",
      last_name: "",
      email: null,
      contact_number: undefined,
      total_male: "x",
      total_female: Number.NaN,
      total_visitors: Number.POSITIVE_INFINITY,
      computed: { overnight: { male: null, female: undefined, total: "12" }, sameDay: {}, fee: { total: Number.NaN, regularCount: 4 } },
    });
    expect(modal().textContent).not.toMatch(forbidden);
    expect(valueOf(groups()[2], "First name")).toBe(DASH);
    expect(valueOf(groups()[2], "Last name")).toBe(DASH);
    expect(valueOf(groups()[2], "Email")).toBe(DASH);
    expect(valueOf(groups()[2], "Contact number")).toBe(DASH);
    expect(valueOf(groups()[1], "In the group")).toBe(DASH);
    expect(valueOf(groups()[1], "Overnight")).toBe(DASH);
    expect(valueOf(groups()[0], "Overnight")).toBe(DASH); // "12" is a text, not a number the server sent
    expect(valueOf(groups()[0], "Fee paid")).toBe(DASH);
    expect(valueOf(groups()[5], "Regular")).toBe(DASH);
  });

  it("one side of the split missing is the dash on that side only", () => {
    draw({ ...RECORD, total_male: null });
    expect(valueOf(groups()[1], "In the group")).toBe(`${DASH} male · 4 female`);
  });

  it("a record from a server that does not send `computed` at all still opens", () => {
    const { computed, ...older } = RECORD; // eslint-disable-line no-unused-vars
    draw(older);
    expect(modal().textContent).not.toMatch(forbidden);
    expect(valueOf(groups()[0], "Overnight")).toBe(DASH);
    expect(valueOf(groups()[5], "Total paid")).toBe(DASH);
    expect(valueOf(groups()[2], "First name")).toBe("Ana");
  });

  it("the name in the title is full_name, or the survey id when it is blank", () => {
    draw({ ...RECORD, full_name: "  " });
    expect(document.querySelector(".arm-name").textContent).toBe("SURV-2026-001");
  });

  it("an unknown status is written as it is, capitalised, and gets no check", () => {
    draw({ ...RECORD, status: "no_show" });
    expect(valueOf(groups()[4], "Arrival status")).toBe("Cancelled");
    expect(document.querySelector(".arm-chip.status svg")).toBeNull();
    expect(document.querySelector(".arm-sub").textContent).toContain("cancelled");
  });

  it("a date that is not a date is the dash", () => {
    draw({ ...RECORD, arrival_date: "soon" });
    expect(valueOf(groups()[4], "Arrival date")).toBe(DASH);
    expect(document.querySelector(".arm-sub").textContent.endsWith(`arrived ${DASH}`)).toBe(true);
  });
});

describe("Registered on", () => {
  const registered = () => valueOf(groups()[6], "Registered on");

  it("is submitted_at when there is one", () => {
    draw();
    const asked = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(RECORD.submitted_at));
    expect(registered()).toBe(asked);
  });

  it("is created_at when submitted_at is null (a record made at the desk)", () => {
    draw({ ...RECORD, submitted_at: null });
    const asked = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(RECORD.created_at));
    expect(registered()).toBe(asked);
  });

  it("is created_at when submitted_at is not a date", () => {
    draw({ ...RECORD, submitted_at: "garbage" });
    expect(registered()).not.toBe(DASH);
  });

  it("is the dash when there is neither", () => {
    draw({ ...RECORD, submitted_at: null, created_at: null });
    expect(registered()).toBe(DASH);
  });

  it("the survey id is in the same group", () => {
    draw();
    expect(valueOf(groups()[6], "Survey ID")).toBe("SURV-2026-001");
  });
});

describe("the buttons", () => {
  it("Close in the band, Close in the footer, the backdrop and Escape all close it", () => {
    for (const how of ["band", "footer", "backdrop", "escape"]) {
      const props = draw();
      if (how === "band") fireEvent.click(document.querySelector(".arm-close"));
      if (how === "footer") fireEvent.click(document.querySelector(".arm-footer button"));
      if (how === "backdrop") fireEvent.click(document.querySelector(".arm-backdrop"));
      if (how === "escape") fireEvent.keyDown(document, { key: "Escape" });
      expect({ how, closed: props.onClose.mock.calls.length >= 1 }).toEqual({ how, closed: true });
      document.body.innerHTML = "";
    }
  });

  it("a click inside the modal does not close it", () => {
    const props = draw();
    fireEvent.click(document.querySelector(".arm-name"));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Open destination gives the id of the resort", () => {
    const props = draw();
    fireEvent.click(screen.getByRole("button", { name: "Open destination" }));
    expect(props.onOpenDestination).toHaveBeenCalledWith(9);
  });

  it("Open destination is off when the resort is not known", () => {
    draw({ ...RECORD, resort_id: 99 });
    expect(screen.getByRole("button", { name: "Open destination" }).disabled).toBe(true);
  });

  it("the Close of the band has the focus when it opens", () => {
    draw();
    expect(document.activeElement).toBe(document.querySelector(".arm-close"));
  });
});

describe("the view is a pure function of the record and the tables", () => {
  it("the same input gives the same output, and the input is not changed", () => {
    const record = JSON.parse(JSON.stringify(RECORD));
    const before = JSON.stringify(record);
    expect(buildArrivalRecordView(record, REFERENCE)).toEqual(buildArrivalRecordView(record, REFERENCE));
    expect(JSON.stringify(record)).toBe(before);
  });

  it("it holds no arithmetic of its own: every number it shows is one of the record's", () => {
    const view = buildArrivalRecordView(RECORD, REFERENCE);
    const text = JSON.stringify(view);
    for (const number of ["303", "909", "101", "202", "404", "505", "7,777", "3,321", "1,105", "81", "65", "41", "17"]) {
      expect({ number, found: text.includes(number) }).toEqual({ number, found: true });
    }
  });
});

describe("the classes the stylesheet aims at", () => {
  it("every selector of the modal's rules finds something in the drawn modal", () => {
    draw();
    const selectors = [
      ".arm-backdrop", ".arm-modal", ".arm-band", ".arm-chips", ".arm-chip", ".arm-chip.status", ".arm-close", ".arm-body", ".arm-name",
      ".arm-sub", ".arm-actions", ".arm-btn", ".arm-btn.primary", ".arm-group", ".arm-group h3", ".arm-grid", ".arm-label", ".arm-value",
      ".arm-unit", ".arm-note", ".arm-footer",
    ];
    for (const selector of selectors) {
      expect({ selector, found: document.querySelectorAll(selector).length > 0 }).toEqual({ selector, found: true });
      expect(() => normalised(selector)).not.toThrow(); // and the stylesheet has a rule for it
    }
    expect(expectedNorm({ a: "0.5" })).toEqual({ a: ".5" });
  });
});
