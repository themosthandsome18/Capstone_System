/**
 * "Maubanin" in the modal of one arrival: a quiet line under "In the group" of "What the records say". Maubanin are a PART of the Filipino count,
 * so the line is never added to the group's number and never shows more than the Filipino count. The look is read from Tourism_index.css itself.
 */
import { render } from "@testing-library/react";
import ArrivalRecordModal from "./ArrivalRecordModal";
import { buildArrivalRecordView, DASH, maubaninText } from "../utils/arrivalRecordView";
import { rule } from "../testing/cssRules";

const record = (over = {}) => ({
  survey_id: "SURV-MAU-001",
  full_name: "Sample Person",
  total_visitors: 6,
  filipino_count: 5,
  foreigner_count: 1,
  maubanin_count: 3,
  total_male: 2,
  total_female: 4,
  status: "arrived",
  computed: {},
  ...over,
});

function draw(over) {
  render(<ArrivalRecordModal record={record(over)} referenceTables={{}} onClose={jest.fn()} onOpenDestination={jest.fn()} />);
}

const groups = () => Array.from(document.querySelectorAll(".arm-group"));
const cellOf = (group, label) => Array.from(group.querySelectorAll(".arm-grid > div")).find((c) => c.querySelector(".arm-label")?.textContent === label);
const sub = () => document.querySelector(".arm-subline");
const subNumber = () => sub().querySelector(".arm-subline-value").textContent;

describe("the Maubanin line under In the group", () => {
  it("is in the first group, in the cell of In the group, after its number", () => {
    draw();

    const cell = cellOf(groups()[0], "In the group");
    const line = cell.querySelector(".arm-subline");
    expect(line).not.toBeNull();
    expect(line.querySelector(".arm-subline-label").textContent).toBe("Maubanin");
    expect(subNumber()).toBe("3");
    // after the group's number, in the same cell
    expect(cell.querySelector(".arm-value").nextElementSibling).toBe(line);
    // and nowhere else
    expect(document.querySelectorAll(".arm-subline")).toHaveLength(1);
    expect(cellOf(groups()[1], "In the group").querySelector(".arm-subline")).toBeNull();
  });

  it("adds no row and no group: the same labels and the same seven groups", () => {
    draw();

    expect(groups()).toHaveLength(7);
    expect(Array.from(groups()[0].querySelectorAll(".arm-label")).map((l) => l.textContent)).toEqual(["Overnight", "Same day", "In the group", "Fee paid"]);
    expect(groups()[0].querySelectorAll(".arm-grid > div")).toHaveLength(4);
  });

  it("is not added to In the group: its number is the same with 0, 3 or 5 Maubanin", () => {
    const seen = [];
    for (const maubanin of [0, 3, 5]) {
      document.body.innerHTML = "";
      draw({ maubanin_count: maubanin });
      seen.push(cellOf(groups()[0], "In the group").querySelector(".arm-value").textContent);
    }
    expect(seen).toEqual(["6 visitors", "6 visitors", "6 visitors"]);
  });

  it("does not change any other field of the modal", () => {
    draw({ maubanin_count: 0 });
    const without = Array.from(document.querySelectorAll(".arm-value")).map((v) => v.textContent);
    document.body.innerHTML = "";
    draw({ maubanin_count: 4 });
    const withSome = Array.from(document.querySelectorAll(".arm-value")).map((v) => v.textContent);
    expect(withSome).toEqual(without);
  });

  it("never shows more than the Filipino count", () => {
    draw({ filipino_count: 5, maubanin_count: 9 });
    expect(subNumber()).toBe("5");
    expect(maubaninText(9, 5)).toBe("5");
    expect(maubaninText(5, 5)).toBe("5");
    expect(maubaninText(2, 5)).toBe("2");
  });

  it("shows 0 when there is no Maubanin", () => {
    draw({ maubanin_count: 0 });
    expect(subNumber()).toBe("0");
  });

  it("is the dash when the record does not say, never undefined, null or NaN", () => {
    for (const value of [undefined, null, "", "x", NaN]) {
      document.body.innerHTML = "";
      draw({ maubanin_count: value });
      expect(subNumber()).toBe(DASH);
      expect(document.body.textContent).not.toMatch(/undefined|null|NaN/);
    }
  });

  it("the view puts it under In the group of the first group only", () => {
    const view = buildArrivalRecordView(record(), {});
    const withSub = view.groups.flatMap((g) => g.items.filter((i) => i.sub).map((i) => [g.title, i.label, i.sub]));
    expect(withSub).toEqual([["What the records say", "In the group", { label: "Maubanin", text: "3" }]]);
  });
});

// jsdom does not apply the stylesheet, so the look is read from the file.
describe("the look of the Maubanin line", () => {
  const line = rule(".arm-subline");
  const word = rule(".arm-subline-label");
  const number = rule(".arm-subline-value");
  const px = (v) => Number(String(v).replace("px", ""));

  it("is 13px, indented, in the colour of the small labels", () => {
    expect(px(line["font-size"])).toBe(13);
    expect(line.margin).toMatch(/^\d+px 0 0 [1-9]\d*px$/);
    expect(line.color.toLowerCase()).toBe(rule(".arm-label").color.toLowerCase());
    expect(word.color.toLowerCase()).toBe(rule(".arm-label").color.toLowerCase());
    expect(number.color.toLowerCase()).toBe(rule(".arm-label").color.toLowerCase());
  });

  it("has a semibold number and a normal word", () => {
    expect(number["font-weight"]).toBe("600");
    expect(word["font-weight"]).toBe("400");
  });

  it("is smaller and lighter than the number of the group it sits under", () => {
    expect(px(line["font-size"])).toBeLessThan(px(rule(".arm-value")["font-size"]));
    expect(line.color.toLowerCase()).not.toBe(rule(".arm-value").color.toLowerCase());
  });
});
