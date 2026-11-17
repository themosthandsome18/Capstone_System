/**
 * GIS Map: the four boxes under the map, and which destinations the map is given. The boxes are written exactly as the server sends them,
 * and nothing in the page adds them up (the resorts it is given here have other numbers than the server's on purpose).
 * The map asks two things of a destination: coordinates inside Mauban, and not a placeholder. Not a photo, not a permit, not an id.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import GISMap from "./GISMap";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("../components/maps/MaubanDestinationMap", () => ({ destinations }) => (
  <div data-testid="map">
    {destinations.map((d) => (
      <span key={d.resort_id}>{`pin:${d.resort_name}`}</span>
    ))}
  </div>
));
jest.mock("../services/tourismApi", () => ({ tourismApi: { getDestinationFigures: jest.fn() } }));

// Two destinations on the map, one of them inactive, with arrivals and a rating the page could add up if it wanted to.
const RESORTS = [
  { resort_id: 1, resort_name: "Alpha Beach", type: "Beach Resort", location: "Mauban", latitude: 14.2, longitude: 121.7, image_key: "a", is_active: true, yearly_arrivals: 10, tourism_rating: 4 },
  { resort_id: 2, resort_name: "Bravo Island", type: "Island", location: "Mauban", latitude: 14.3, longitude: 121.8, image_key: "b", is_active: false, yearly_arrivals: 20, tourism_rating: 3 },
];

function box(title) {
  return screen.getByText(title).closest(".gis-stat-box");
}

function setup(figures, resorts = RESORTS) {
  useTourismData.mockReturnValue({ referenceTables: { resorts } });
  if (figures instanceof Error) tourismApi.getDestinationFigures.mockRejectedValue(figures);
  else tourismApi.getDestinationFigures.mockResolvedValue(figures);
  return render(<GISMap />);
}

const pins = () => within(screen.getByTestId("map")).queryAllByText(/^pin:/).map((el) => el.textContent.replace("pin:", ""));

const SENT = {
  year: 2026,
  activeCount: 7,
  totalCount: 9,
  arrivalsThisYear: 123456,
  mostVisited: { resort_id: 5, name: "Zed Cove", arrivals: 4242 },
  mostVisitedSharePercent: 3,
  leastVisited: { resort_id: 8, name: "Yan Point", arrivals: 11 },
  placesWithNoArrivals: 2,
};

describe("the four boxes", () => {
  it("are Active in the app, Arrivals this year, Most visited this year and Least visited this year, in that order, and Total Locations and the old three are gone", async () => {
    const { container } = setup(SENT);
    await screen.findByText("Zed Cove");

    const titles = Array.from(container.querySelectorAll(".gis-stat-box > p:first-child")).map((p) => p.textContent);
    expect(titles).toEqual(["Active in the app", "Arrivals this year", "Most visited this year", "Least visited this year"]);
    expect(screen.queryByText("Total Locations")).toBeNull();
    expect(screen.queryByText("Beach Destinations")).toBeNull();
    expect(screen.queryByText("Island Destinations")).toBeNull();
    expect(screen.queryByText("Average Rating")).toBeNull();
  });

  it("there is no Total Locations even while the figures have not come", async () => {
    setup(new Error("down"));
    await waitFor(() => expect(tourismApi.getDestinationFigures).toHaveBeenCalled());

    expect(screen.queryByText("Total Locations")).toBeNull();
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
    setup({ ...SENT, arrivalsThisYear: 0, mostVisited: null, mostVisitedSharePercent: null, leastVisited: null });
    await screen.findAllByText("None yet");

    const most = box("Most visited this year");
    expect(within(most).getByRole("heading", { level: 2 }).textContent).toBe("None yet");
    expect(most.textContent).not.toMatch(/arrivals$/);
    expect(within(box("Arrivals this year")).getByRole("heading", { level: 2 }).textContent).toBe("0");
  });

  it("shows a dash, not a guess from the list, while the figures have not come or when they fail", async () => {
    setup(new Error("down"));
    await waitFor(() => expect(tourismApi.getDestinationFigures).toHaveBeenCalled());

    for (const title of ["Active in the app", "Arrivals this year", "Most visited this year", "Least visited this year"]) {
      expect(within(box(title)).getByRole("heading", { level: 2 }).textContent).toBe("—");
    }
    expect(screen.queryByText(/none yet/)).toBeNull();
    expect(screen.queryByText(/of them/)).toBeNull();
  });
});

describe("Arrivals this year: the share of the busiest place", () => {
  it("says the busiest place has N% of them, N as the server sent it", async () => {
    setup({ ...SENT, mostVisitedSharePercent: 63 });
    await screen.findByText("Zed Cove");

    expect(box("Arrivals this year").textContent).toContain("the busiest place has 63% of them");
  });

  it("has no such line at a zero total, where the server sends none", async () => {
    setup({ ...SENT, arrivalsThisYear: 0, mostVisited: null, mostVisitedSharePercent: null, leastVisited: null });
    await screen.findAllByText("None yet");

    expect(box("Arrivals this year").textContent).not.toContain("busiest");
    expect(screen.queryByText(/NaN|undefined|null/)).toBeNull();
  });

  it("writes 0% if the server says 0, it does not take it for none", async () => {
    setup({ ...SENT, mostVisitedSharePercent: 0 });
    await screen.findByText("Zed Cove");

    expect(box("Arrivals this year").textContent).toContain("the busiest place has 0% of them");
  });
});

describe("Least visited this year", () => {
  it("is the place the server names, with its count, and how many have none yet", async () => {
    setup(SENT);
    await screen.findByText("Yan Point");

    const least = box("Least visited this year");
    expect(within(least).getByRole("heading", { level: 2 }).textContent).toBe("Yan Point");
    expect(least.textContent).toContain("11 arrivals");
    expect(least.textContent).toContain("2 places have none yet");
  });

  it("says 1 place has none yet in the singular", async () => {
    setup({ ...SENT, placesWithNoArrivals: 1 });
    await screen.findByText("Yan Point");

    expect(box("Least visited this year").textContent).toContain("1 place has none yet");
    expect(box("Least visited this year").textContent).not.toContain("1 places");
  });

  it("has no none-yet line when every place has arrivals", async () => {
    setup({ ...SENT, placesWithNoArrivals: 0 });
    await screen.findByText("Yan Point");

    expect(box("Least visited this year").textContent).not.toContain("none yet");
    expect(box("Least visited this year").textContent).toContain("11 arrivals");
  });

  it("says None yet, with no count, when nobody has arrivals", async () => {
    setup({ ...SENT, arrivalsThisYear: 0, mostVisited: null, mostVisitedSharePercent: null, leastVisited: null, placesWithNoArrivals: 9 });
    await screen.findAllByText("None yet");

    const least = box("Least visited this year");
    expect(within(least).getByRole("heading", { level: 2 }).textContent).toBe("None yet");
    expect(least.textContent).not.toMatch(/\d arrivals/);
  });
});

describe("the map is given every destination with a place in Mauban that is not a placeholder", () => {
  const base = { type: "Beach Resort", location: "Mauban", is_active: true, tourism_rating: 0 };

  it("a 16th resort the admin added, with no photo and no permit but a real coordinate, is on the map (the original fault)", async () => {
    setup(SENT, [
      { ...base, resort_id: 1, resort_name: "Old One", latitude: 14.2, longitude: 121.7, image_key: "a", is_placeholder: false },
      { ...base, resort_id: 16, resort_name: "Added By Admin", latitude: 14.3, longitude: 121.8, image_key: "", with_mayors_permit: false, is_placeholder: false },
    ]);
    await screen.findByText("Zed Cove");

    expect(pins()).toEqual(["Old One", "Added By Admin"]);
  });

  it("a resort far past 16 with nothing but a coordinate is on the map: the id has no part in it", async () => {
    setup(SENT, [{ ...base, resort_id: 240, resort_name: "Two Forty", latitude: 14.25, longitude: 121.75, image_key: "", is_placeholder: false }]);
    await screen.findByText("Zed Cove");

    expect(pins()).toEqual(["Two Forty"]);
  });

  it("a resort with no coordinate, or outside Mauban, is not on the map, whatever its id, photo or permit", async () => {
    setup(SENT, [
      { ...base, resort_id: 1, resort_name: "No Coordinate", latitude: null, longitude: null, image_key: "a", with_mayors_permit: true },
      { ...base, resort_id: 2, resort_name: "Empty Coordinate", latitude: "", longitude: "", image_key: "a" },
      { ...base, resort_id: 17, resort_name: "Manila", latitude: 14.6, longitude: 121.0, image_key: "a", with_mayors_permit: true },
      { ...base, resort_id: 18, resort_name: "Too South", latitude: 13.5, longitude: 121.7, image_key: "a" },
      { ...base, resort_id: 19, resort_name: "On The Map", latitude: 14.2, longitude: 121.7, image_key: "", is_placeholder: false },
    ]);
    await screen.findByText("Zed Cove");

    expect(pins()).toEqual(["On The Map"]);
  });

  it("a placeholder is not on the map, even with an id of 1 to 15 or with a photo and a permit", async () => {
    setup(SENT, [
      { ...base, resort_id: 3, resort_name: "Made Up", latitude: 14.185, longitude: 121.731, image_key: "x", with_mayors_permit: true, is_placeholder: true },
      { ...base, resort_id: 4, resort_name: "Real", latitude: 14.2, longitude: 121.7, is_placeholder: false },
    ]);
    await screen.findByText("Zed Cove");

    expect(pins()).toEqual(["Real"]);
  });

  it("a placeholder the admin gave a real coordinate (the server now says it is not one) is on the map", async () => {
    const asSent = { ...base, resort_id: 16, resort_name: "Others / Private Residence", latitude: 14.185, longitude: 121.725, is_placeholder: true };
    const { unmount } = setup(SENT, [asSent]);
    await screen.findByText("Zed Cove");
    expect(pins()).toEqual([]);
    unmount();

    setup(SENT, [{ ...asSent, latitude: 14.2501, longitude: 121.8123, is_placeholder: false }]);
    await screen.findAllByText("Zed Cove");
    expect(pins()).toEqual(["Others / Private Residence"]);
  });

  it("a resort whose answer has no is_placeholder at all is taken as not one (an older answer)", async () => {
    setup(SENT, [{ ...base, resort_id: 30, resort_name: "No Key", latitude: 14.2, longitude: 121.7 }]);
    await screen.findByText("Zed Cove");

    expect(pins()).toEqual(["No Key"]);
  });

  it("the coverage text says what the rule now is", async () => {
    setup(SENT);
    await screen.findByText("Zed Cove");

    expect(screen.getByText(/Placeholder records made by an import are hidden from the map until an admin gives them exact coordinates/)).toBeTruthy();
    expect(screen.queryByText(/official destinations/i)).toBeNull();
  });
});
