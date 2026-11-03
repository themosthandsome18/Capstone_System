/**
 * "Open destination" in the modal of an arrival comes to this page with the id of the resort in the router state: the page opens that
 * destination's Details, once for that visit.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import DestinationManagement from "./DestinationManagement";
import { useTourismData } from "../context/TourismDataContext";

let mockLocation = { pathname: "/destinations" };
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("react-router-dom", () => ({ useLocation: () => mockLocation }), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
}));
jest.mock("../../shared/LocationPicker", () => () => null);

const resort = (id, name) => ({
  resort_id: id, resort_name: name, is_active: true, type: "Beach Resort", location: "Mauban", access: "Boat", short_description: "d",
  with_mayors_permit: true, tourism_rating: 0, review_count: 0, monthly_arrivals: 0, yearly_arrivals: 0, itinerary_ids: [], images: [],
  latitude: 14.2, longitude: 121.7,
});

function draw() {
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [resort(4, "Beach One"), resort(5, "Cove Two")], itineraries: [] },
    feedbackEntries: [],
    updateFeedbackEntry: jest.fn(), hideFeedbackEntry: jest.fn(), unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(), updateResort: jest.fn(), uploadResortImage: jest.fn(),
  });
  return render(<DestinationManagement initialTab="destinations" />);
}

const details = () => document.querySelector(".gmaps-modal-content");

describe("opened from an arrival", () => {
  it("the Details of the resort named in the state open on their own", () => {
    mockLocation = { pathname: "/destinations", key: "visit-1", state: { openResortId: 5 } };
    draw();
    expect(details()).not.toBeNull();
    expect(within(details()).getByRole("heading", { name: "Cove Two" })).toBeTruthy();
  });

  it("an id that arrives as a text finds the resort too", () => {
    mockLocation = { pathname: "/destinations", key: "visit-2", state: { openResortId: "4" } };
    draw();
    expect(within(details()).getByRole("heading", { name: "Beach One" })).toBeTruthy();
  });

  it("an id that is not a destination opens nothing", () => {
    mockLocation = { pathname: "/destinations", key: "visit-3", state: { openResortId: 99 } };
    draw();
    expect(details()).toBeNull();
  });

  it("no state, or no id, opens nothing: the page is as it was", () => {
    for (const location of [{ pathname: "/destinations" }, { pathname: "/destinations", key: "k", state: null }, { pathname: "/destinations", key: "k", state: {} }]) {
      mockLocation = location;
      const { unmount } = draw();
      expect(details()).toBeNull();
      unmount();
    }
  });

  it("closing it does not bring it back while the page is redrawn for the same visit", () => {
    mockLocation = { pathname: "/destinations", key: "visit-4", state: { openResortId: 4 } };
    const { rerender } = draw();
    fireEvent.click(screen.getByRole("button", { name: "Close details" })); // it is in the hero, not in the body
    expect(details()).toBeNull();

    rerender(<DestinationManagement initialTab="destinations" />);

    expect(details()).toBeNull();
  });

  it("a new visit (another key) opens it again", () => {
    mockLocation = { pathname: "/destinations", key: "visit-5", state: { openResortId: 4 } };
    const { rerender } = draw();
    fireEvent.click(screen.getByRole("button", { name: "Close details" })); // it is in the hero, not in the body

    mockLocation = { pathname: "/destinations", key: "visit-6", state: { openResortId: 5 } };
    rerender(<DestinationManagement initialTab="destinations" />);

    expect(within(details()).getByRole("heading", { name: "Cove Two" })).toBeTruthy();
  });

  it("it opens on the destinations tab even if the page was last on the feedback tab", () => {
    mockLocation = { pathname: "/feedback", key: "visit-7", state: { openResortId: 4 } };
    useTourismData.mockReturnValue({
      referenceTables: { resorts: [resort(4, "Beach One")], itineraries: [] },
      feedbackEntries: [],
      updateFeedbackEntry: jest.fn(), hideFeedbackEntry: jest.fn(), unhideFeedbackEntry: jest.fn(),
      createResort: jest.fn(), updateResort: jest.fn(), uploadResortImage: jest.fn(),
    });
    render(<DestinationManagement />);
    expect(screen.getByRole("heading", { name: "Beach One", level: 3 })).toBeTruthy(); // the card is on the page: the tab is the destinations
    expect(details()).not.toBeNull();
  });
});
