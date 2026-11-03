/**
 * The look of the four boxes under the GIS map, read from Tourism_index.css itself (jsdom applies no stylesheet): the sizes are not
 * written into this test but taken from the file and compared with the design's.
 */
import { render, screen } from "@testing-library/react";
import GISMap from "./GISMap";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";
import { expectedNorm, normalised, tourismCss } from "../testing/cssRules";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../components/maps/MaubanDestinationMap", () => () => <div data-testid="map" />);
jest.mock("../services/tourismApi", () => ({ tourismApi: { getDestinationFigures: jest.fn() } }));

const has = (selector, expected) => expect(normalised(selector)).toMatchObject(expectedNorm(expected));

const LONG_NAME = "The Very Long Name of a Destination in Mauban That Will Not Fit in Two Lines of the Box Under the Map";

function setup(figures) {
  useTourismData.mockReturnValue({ referenceTables: { resorts: [] } });
  tourismApi.getDestinationFigures.mockResolvedValue(figures);
  return render(<GISMap />);
}

describe("the numbers", () => {
  it("Total Locations and Arrivals this year keep the size of the box's number: nothing narrows or resizes a plain h2", () => {
    // the box's own h2 rule is still the only one for a plain h2, and still 34px; the smaller sizes are named classes
    const plain = Array.from(tourismCss.matchAll(/\n\.gis-stat-box h2\s*\{([^}]*)\}/g));
    expect(plain).toHaveLength(1);
    expect(plain[0][1]).toContain("text-[34px]");
  });
});

describe("15 of 15", () => {
  it("the ' of 15' is 17px, weight 600, #7A6755", () => {
    has(".gis-stat-box h2 .gis-stat-of", { "font-size": "17px", "font-weight": "600", color: "#7A6755" });
  });

  it("only the ' of N' is in the small span; the first number is the h2's own text, at the size of the other numbers", async () => {
    const { container } = setup({ activeCount: 15, totalCount: 15, arrivalsThisYear: 3, mostVisited: null });
    await screen.findByText("None yet");

    const h2 = Array.from(container.querySelectorAll(".gis-stat-box h2")).find((el) => el.querySelector(".gis-stat-of"));
    expect(h2.className).toBe("");
    expect(h2.textContent).toBe("15 of 15");
    expect(h2.querySelector(".gis-stat-of").textContent).toBe(" of 15");
    expect(h2.firstChild.textContent).toBe("15");
  });
});

describe("Most visited this year", () => {
  it("the name is 20px, weight 800, line-height 1.25, at most 2 lines with an ellipsis", () => {
    has(".gis-stat-box h2.gis-stat-name", {
      "font-size": "20px",
      "font-weight": "800",
      "line-height": "1.25",
      "-webkit-line-clamp": "2",
      overflow: "hidden",
    });
    // what -webkit-line-clamp needs to take effect
    has(".gis-stat-box h2.gis-stat-name", { display: "-webkit-box", "-webkit-box-orient": "vertical" });
  });

  it("the count under it is 12.5px, #87705C", () => {
    has(".gis-stat-box p.gis-stat-note", { "font-size": "12.5px", color: "#87705C" });
  });

  it("a long name carries its whole text in title, and the count is under it", async () => {
    const { container } = setup({ activeCount: 1, totalCount: 1, arrivalsThisYear: 24, mostVisited: { resort_id: 3, name: LONG_NAME, arrivals: 24 } });
    await screen.findByText(LONG_NAME);

    const name = container.querySelector("h2.gis-stat-name");
    expect(name.getAttribute("title")).toBe(LONG_NAME);
    expect(name.textContent).toBe(LONG_NAME); // cut by the stylesheet only, never in the text
    expect(name.nextElementSibling.className).toBe("gis-stat-note");
    expect(name.nextElementSibling.textContent).toBe("24 arrivals");
  });

  it("only the name has that smaller size: the other boxes' numbers do not use the class", async () => {
    const { container } = setup({ activeCount: 1, totalCount: 1, arrivalsThisYear: 24, mostVisited: { resort_id: 3, name: "Alpha", arrivals: 24 } });
    await screen.findByText("Alpha");

    expect(container.querySelectorAll(".gis-stat-name")).toHaveLength(1);
  });
});

describe("the four boxes are level", () => {
  it("the row stretches every box to the tallest, so a name of two lines does not leave the others short", () => {
    has(".gis-bottom-stats", { "align-items": "stretch" });
  });
});
