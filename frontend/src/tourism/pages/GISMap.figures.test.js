/**
 * GIS Map: the four boxes under the map. Total Locations is as it was; the other three are written exactly as the server sends them,
 * and nothing in the page adds them up (the resorts it is given here have other numbers than the server's on purpose).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import GISMap from "./GISMap";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../components/maps/MaubanDestinationMap", () => () => <div data-testid="map" />);
jest.mock("../services/tourismApi", () => ({ tourismApi: { getDestinationFigures: jest.fn() } }));

// Two destinations on the map, one of them inactive, with arrivals and a rating the page could add up if it wanted to.
const RESORTS = [
  { resort_id: 1, resort_name: "Alpha Beach", type: "Beach Resort", location: "Mauban", latitude: 14.2, longitude: 121.7, image_key: "a", is_active: true, yearly_arrivals: 10, tourism_rating: 4 },
  { resort_id: 2, resort_name: "Bravo Island", type: "Island", location: "Mauban", latitude: 14.3, longitude: 121.8, image_key: "b", is_active: false, yearly_arrivals: 20, tourism_rating: 3 },
];

function box(title) {
  return screen.getByText(title).closest(".gis-stat-box");
}

function setup(figures) {
  useTourismData.mockReturnValue({ referenceTables: { resorts: RESORTS } });
  if (figures instanceof Error) tourismApi.getDestinationFigures.mockRejectedValue(figures);
  else tourismApi.getDestinationFigures.mockResolvedValue(figures);
  return render(<GISMap />);
}

const SENT = { year: 2026, activeCount: 7, totalCount: 9, arrivalsThisYear: 123456, mostVisited: { resort_id: 5, name: "Zed Cove", arrivals: 4242 } };

describe("the four boxes", () => {
  it("are Total Locations, Active in the app, Arrivals this year and Most visited this year, in that order, and the old three are gone", async () => {
    const { container } = setup(SENT);
    await screen.findByText("Zed Cove");

    const titles = Array.from(container.querySelectorAll(".gis-stat-box > p:first-child")).map((p) => p.textContent);
    expect(titles).toEqual(["Total Locations", "Active in the app", "Arrivals this year", "Most visited this year"]);
    expect(screen.queryByText("Beach Destinations")).toBeNull();
    expect(screen.queryByText("Island Destinations")).toBeNull();
    expect(screen.queryByText("Average Rating")).toBeNull();
  });

  it("Total Locations is still the number of mapped destinations", async () => {
    setup(SENT);
    await screen.findByText("Zed Cove");

    expect(within(box("Total Locations")).getByRole("heading", { level: 2 }).textContent).toBe("2");
  });

  it("writes the server's figures as they are, not what the page's own list would add up to", async () => {
    setup(SENT);
    await screen.findByText("Zed Cove");

    expect(within(box("Active in the app")).getByRole("heading", { level: 2 }).textContent).toBe("7 of 9"); // the list says 1 of 2
    expect(within(box("Arrivals this year")).getByRole("heading", { level: 2 }).textContent).toBe("123456"); // the list adds to 30
    const most = box("Most visited this year");
    expect(within(most).getByRole("heading", { level: 2 }).textContent).toBe("Zed Cove"); // not in the list at all
    expect(most.textContent).toContain("4242 arrivals");
  });

  it("says None yet, and no count, when the server has no most visited", async () => {
    setup({ ...SENT, arrivalsThisYear: 0, mostVisited: null });
    await screen.findByText("None yet");

    const most = box("Most visited this year");
    expect(within(most).getByRole("heading", { level: 2 }).textContent).toBe("None yet");
    expect(most.textContent).not.toMatch(/arrivals$/);
    expect(within(box("Arrivals this year")).getByRole("heading", { level: 2 }).textContent).toBe("0");
  });

  it("shows a dash, not a guess from the list, while the figures have not come or when they fail", async () => {
    setup(new Error("down"));
    await waitFor(() => expect(tourismApi.getDestinationFigures).toHaveBeenCalled());

    for (const title of ["Active in the app", "Arrivals this year", "Most visited this year"]) {
      expect(within(box(title)).getByRole("heading", { level: 2 }).textContent).toBe("—");
    }
  });
});
