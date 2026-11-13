/**
 * "Open" on a notification (the bell) comes to Destinations & Feedback as /feedback?openFeedbackId=<id>: the Feedback tab opens, scrolls to that review
 * and marks it for a moment. A review that has only just come in may not be in the list yet: the list is refreshed once and the review is found when it
 * arrives.
 */
import { act, render, screen } from "@testing-library/react";
import DestinationManagement from "./DestinationManagement";
import { useTourismData } from "../context/TourismDataContext";

let mockLocation = { pathname: "/feedback", search: "", key: "k0" };
jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("react-router-dom", () => ({ useLocation: () => mockLocation }), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
}));
jest.mock("../../shared/LocationPicker", () => () => null);

const resort = { resort_id: 4, resort_name: "Beach One", is_active: true, type: "Beach Resort", location: "Mauban", access: "Boat", short_description: "d",
  with_mayors_permit: true, tourism_rating: 0, review_count: 0, monthly_arrivals: 0, yearly_arrivals: 0, itinerary_ids: [], images: [], latitude: 14.2, longitude: 121.7 };

const entry = (id, extra = {}) => ({
  id, destinationId: 4, reviewer: `Reviewer ${id}`, rating: 4, status: "positive", date: "2026-11-01", title: "Mobile tourism feedback", message: `Message ${id}`,
  reply: "", photos: [], is_hidden: false, hidden_at: null, hidden_by_display: null, ...extra,
});

let feedbackEntries;
let refreshFeedbackEntries;
let scrolled;

function draw() {
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [resort], itineraries: [] },
    feedbackEntries,
    refreshFeedbackEntries,
    updateFeedbackEntry: jest.fn(), hideFeedbackEntry: jest.fn(), unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(), updateResort: jest.fn(), uploadResortImage: jest.fn(),
  });
  return render(<DestinationManagement />);
}

const card = (id) => document.querySelector(`[data-feedback-id="${id}"]`);

beforeEach(() => {
  jest.useFakeTimers();
  mockLocation = { pathname: "/feedback", search: "", key: "k0" };
  feedbackEntries = [entry(5), entry(6), entry(7), entry(8, { is_hidden: true })];
  refreshFeedbackEntries = jest.fn().mockResolvedValue(undefined);
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(options) {
    scrolled.push({ id: this.getAttribute("data-feedback-id"), options });
  };
});

afterEach(() => {
  jest.useRealTimers();
  delete Element.prototype.scrollIntoView;
});

describe("opened from a notification", () => {
  it("shows the Feedback tab, scrolls to that review and marks it", () => {
    mockLocation = { pathname: "/destinations", search: "?openFeedbackId=7", key: "n1" };
    draw();

    expect(screen.getByText(/Feedback Monitoring/).closest("button").className).toContain("active");
    expect(card(7)).not.toBeNull();
    expect(scrolled).toEqual([{ id: "7", options: { behavior: "smooth", block: "center" } }]);
    expect(card(7).className).toContain("feedback-card-marked");
    expect(card(5).className).not.toContain("feedback-card-marked");
    expect(card(6).className).not.toContain("feedback-card-marked");
  });

  it("the mark goes away after a moment", () => {
    mockLocation = { pathname: "/feedback", search: "?openFeedbackId=6", key: "n2" };
    draw();
    expect(card(6).className).toContain("feedback-card-marked");

    act(() => jest.advanceTimersByTime(2700));

    expect(card(6).className).not.toContain("feedback-card-marked");
  });

  it("a hidden review is found too (the filters are cleared so that it is in the list)", () => {
    mockLocation = { pathname: "/feedback", search: "?openFeedbackId=8", key: "n3" };
    draw();

    expect(card(8)).not.toBeNull();
    expect(card(8).className).toContain("feedback-card-marked");
  });

  it("a review that is not in the list yet: the list is refreshed once, and the review is found when it comes", () => {
    feedbackEntries = [entry(5)];
    mockLocation = { pathname: "/feedback", search: "?openFeedbackId=9", key: "n4" };
    const { rerender } = draw();

    expect(refreshFeedbackEntries).toHaveBeenCalledTimes(1);
    expect(card(9)).toBeNull();
    expect(scrolled).toEqual([]);

    feedbackEntries = [entry(9), entry(5)];
    useTourismData.mockReturnValue({
      referenceTables: { resorts: [resort], itineraries: [] }, feedbackEntries, refreshFeedbackEntries,
      updateFeedbackEntry: jest.fn(), hideFeedbackEntry: jest.fn(), unhideFeedbackEntry: jest.fn(),
      createResort: jest.fn(), updateResort: jest.fn(), uploadResortImage: jest.fn(),
    });
    rerender(<DestinationManagement />);

    expect(card(9).className).toContain("feedback-card-marked");
    expect(refreshFeedbackEntries).toHaveBeenCalledTimes(1); // not asked again
  });

  it("an id that is not there even after the refresh opens nothing and marks nothing", () => {
    mockLocation = { pathname: "/feedback", search: "?openFeedbackId=999", key: "n5" };
    draw();

    expect(document.querySelector(".feedback-card-marked")).toBeNull();
    expect(scrolled).toEqual([]);
  });

  it("no id in the address: nothing is marked and nothing scrolls, and the list is not refreshed", () => {
    draw();

    expect(document.querySelector(".feedback-card-marked")).toBeNull();
    expect(scrolled).toEqual([]);
    expect(refreshFeedbackEntries).not.toHaveBeenCalled();
  });

  it("only once for a visit: drawing the page again does not mark it again", () => {
    mockLocation = { pathname: "/feedback", search: "?openFeedbackId=7", key: "n6" };
    const { rerender } = draw();
    act(() => jest.advanceTimersByTime(2700));
    expect(card(7).className).not.toContain("feedback-card-marked");

    rerender(<DestinationManagement />);

    expect(card(7).className).not.toContain("feedback-card-marked");
    expect(scrolled).toHaveLength(1);
  });
});
