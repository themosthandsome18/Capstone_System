import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DestinationManagement from "./DestinationManagement";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ pathname: "/feedback" }) }),
  { virtual: true }
);
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
}));
jest.mock("../../shared/LocationPicker", () => () => null);

const HIDE_NOTE =
  "Hidden reviews don't show in the app and don't count in the destination's rating.";
const PHOTO_WARNING = /The photo link stays reachable to anyone who already has it\./;

function entry(id, extra = {}) {
  return {
    id,
    destinationId: 4,
    reviewer: `Reviewer ${id}`,
    rating: 4,
    status: "positive",
    date: "2026-09-22",
    title: "Mobile tourism feedback",
    message: `Message ${id}`,
    reply: "",
    photos: [],
    is_hidden: false,
    hidden_at: null,
    hidden_by_display: null,
    ...extra,
  };
}

// 1 visible positive, 1 visible negative, 1 visible neutral,
// 1 HIDDEN positive without a photo, 1 HIDDEN negative WITH a photo.
function fixtures() {
  return [
    entry(1, { status: "positive" }),
    entry(2, { status: "negative" }),
    entry(3, { status: "neutral" }),
    entry(4, {
      status: "positive",
      is_hidden: true,
      hidden_at: "2026-09-23T10:30:00Z",
      hidden_by_display: "Maria Santos",
    }),
    entry(5, {
      status: "negative",
      photos: ["https://example.test/p.jpg"],
      is_hidden: true,
      hidden_at: "2026-09-23T11:00:00Z",
      hidden_by_display: "Maria Santos",
    }),
  ];
}

function setup(entries = fixtures(), extra = {}) {
  const value = {
    referenceTables: {
      resorts: [{ resort_id: 4, resort_name: "Beach One", tourism_rating: 4 }],
    },
    feedbackEntries: entries,
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn().mockResolvedValue({}),
    unhideFeedbackEntry: jest.fn().mockResolvedValue({}),
    createResort: jest.fn(),
    updateResort: jest.fn(),
    deleteResort: jest.fn(),
    uploadResortImage: jest.fn(),
    ...extra,
  };
  useTourismData.mockReturnValue(value);
  render(<DestinationManagement initialTab="feedback" />);
  return value;
}

function statValue(title) {
  const label = screen.getByText(title, { selector: ".feedback-stat-card p" });
  return label.parentElement.querySelector("h2").textContent;
}

function card(reviewer) {
  return screen.getByRole("heading", { name: new RegExp(reviewer) }).closest(".feedback-card");
}

describe("Hide / show a review: the card", () => {
  it("a hidden review has the Hidden badge and who / when", () => {
    setup();
    const hidden = card("Reviewer 4");
    expect(within(hidden).getByText("Hidden", { selector: ".feedback-hidden-badge" })).toBeTruthy();
    expect(within(hidden).getByText(/Hidden by Maria Santos on/)).toBeTruthy();
  });

  it("a visible review has neither the badge nor the who / when", () => {
    setup();
    const visible = card("Reviewer 1");
    expect(within(visible).queryByText("Hidden", { selector: ".feedback-hidden-badge" })).toBeNull();
    expect(within(visible).queryByText(/Hidden by/)).toBeNull();
  });

  it("the button says Hide on a visible one and Show again on a hidden one", () => {
    setup();
    expect(within(card("Reviewer 1")).getByRole("button", { name: "Hide" })).toBeTruthy();
    expect(within(card("Reviewer 4")).getByRole("button", { name: "Show again" })).toBeTruthy();
    expect(within(card("Reviewer 4")).queryByRole("button", { name: "Hide" })).toBeNull();
  });

  it("a hidden review still shows its whole content to staff", () => {
    setup();
    expect(within(card("Reviewer 4")).getByText("Message 4")).toBeTruthy();
  });

  it("Hide calls hideFeedbackEntry with the id, and not unhide", async () => {
    const value = setup();
    fireEvent.click(within(card("Reviewer 1")).getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(value.hideFeedbackEntry).toHaveBeenCalledWith(1));
    expect(value.unhideFeedbackEntry).not.toHaveBeenCalled();
  });

  it("Show again calls unhideFeedbackEntry with the id, and not hide", async () => {
    const value = setup();
    fireEvent.click(within(card("Reviewer 4")).getByRole("button", { name: "Show again" }));
    await waitFor(() => expect(value.unhideFeedbackEntry).toHaveBeenCalledWith(4));
    expect(value.hideFeedbackEntry).not.toHaveBeenCalled();
  });

  it("a failed hide shows the error", async () => {
    setup(fixtures(), {
      hideFeedbackEntry: jest.fn().mockRejectedValue(new Error("Nope")),
    });
    fireEvent.click(within(card("Reviewer 1")).getByRole("button", { name: "Hide" }));
    expect(await screen.findByText("Nope")).toBeTruthy();
  });
});

describe("Hide / show a review: the counts", () => {
  it("the four sentiment counts leave the hidden ones out", () => {
    setup();
    // 5 reviews, 2 hidden -> 3 visible: 1 positive, 1 neutral, 1 negative.
    expect(statValue("Total Feedback")).toBe("3");
    expect(statValue("Positive")).toBe("1");
    expect(statValue("Neutral")).toBe("1");
    expect(statValue("Negative")).toBe("1");
  });

  it("the Hidden count is the hidden ones", () => {
    setup();
    expect(statValue("Hidden")).toBe("2");
  });

  it("the tab count INCLUDES the hidden ones (the list under it shows them)", () => {
    setup();
    expect(screen.getByText("Feedback Monitoring (5)")).toBeTruthy();
  });

  it("with nothing hidden the Hidden count is 0 and Total is all", () => {
    setup([entry(1), entry(2, { status: "negative" })]);
    expect(statValue("Hidden")).toBe("0");
    expect(statValue("Total Feedback")).toBe("2");
  });
});

describe("Hide / show a review: the Visibility filter", () => {
  const filter = () => screen.getByLabelText("Filter by visibility");

  it("All (the default) lists every review", () => {
    setup();
    expect(filter().value).toBe("all");
    expect(document.querySelectorAll(".feedback-card").length).toBe(5);
  });

  it("Visible lists only the visible ones", () => {
    setup();
    fireEvent.change(filter(), { target: { value: "visible" } });
    expect(document.querySelectorAll(".feedback-card").length).toBe(3);
    expect(document.querySelectorAll(".feedback-card-hidden").length).toBe(0);
  });

  it("Hidden lists only the hidden ones", () => {
    setup();
    fireEvent.change(filter(), { target: { value: "hidden" } });
    expect(document.querySelectorAll(".feedback-card").length).toBe(2);
    expect(document.querySelectorAll(".feedback-card-hidden").length).toBe(2);
  });
});

describe("Hide / show a review: the two texts", () => {
  it("(a) says what Hide does, before anyone presses it", () => {
    setup([entry(1)]);
    expect(screen.getByText(HIDE_NOTE)).toBeTruthy();
  });

  it("(b) the photo warning shows on a hidden review WITH a photo", () => {
    setup();
    expect(within(card("Reviewer 5")).getByText(PHOTO_WARNING)).toBeTruthy();
  });

  it("(b) the photo warning does NOT show on a hidden review without a photo", () => {
    setup();
    expect(within(card("Reviewer 4")).queryByText(PHOTO_WARNING)).toBeNull();
  });

  it("(b) the photo warning does NOT show on a visible review with a photo", () => {
    setup([entry(1, { photos: ["https://example.test/p.jpg"] })]);
    expect(screen.queryByText(PHOTO_WARNING)).toBeNull();
  });
});

describe("Hide / show a review: the destination detail", () => {
  function openDetail() {
    fireEvent.click(screen.getByRole("button", { name: /^Destinations \(/ }));
    fireEvent.click(screen.getByRole("heading", { name: "Beach One" }));
  }

  it("its review list and count leave the hidden out, and say how many are hidden", () => {
    setup();
    openDetail();
    // 5 reviews for the destination, 2 hidden.
    expect(screen.getByRole("heading", { name: /Visitor Reviews \(3\)/ })).toBeTruthy();
    expect(screen.getByText(/2 hidden/)).toBeTruthy();
    expect(screen.queryByText("Message 4")).toBeNull();
    expect(screen.getByText("Message 1")).toBeTruthy();
  });
});
