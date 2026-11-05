/**
 * The hero of the Details modal: the picture fills it, with nothing of its background showing under the picture.
 * The sizes are read from Tourism_index.css itself, not written into this test; the page is drawn to see what the slideshow is given.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import DestinationManagement from "./DestinationManagement";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/destinations" }) }), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
}));
jest.mock("../../shared/LocationPicker", () => () => null);

const css = readFileSync(join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");

// Every rule for exactly this selector, their declarations added up in order, as the cascade does.
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = Array.from(css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g")));
  if (!found.length) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    found
      .map((match) => match[1])
      .join(";")
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
}

const DESTINATION = {
  resort_id: 4,
  resort_name: "Beach One",
  is_active: true,
  type: "Beach Resort",
  location: "Cagbalete, Mauban",
  access: "Boat",
  short_description: "A beach.",
  with_mayors_permit: true,
  tourism_rating: 4.8,
  review_count: 1,
  monthly_arrivals: 1,
  yearly_arrivals: 2,
  itinerary_ids: [],
  images: ["a.jpg", "b.jpg"],
  latitude: 14.2,
  longitude: 121.7,
};

function openDetails(destination = DESTINATION) {
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [destination], itineraries: [] },
    feedbackEntries: [],
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn(),
    unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(),
    updateResort: jest.fn(),
    uploadResortImage: jest.fn(),
  });
  render(<DestinationManagement initialTab="destinations" />);
  const card = screen.getByRole("heading", { name: destination.resort_name }).closest(".destination-card");
  fireEvent.click(within(card).getByRole("button", { name: /Details/ }));
  return document.querySelector(".gmaps-modal-hero");
}

describe("the hero in the CSS file", () => {
  it("is 200px tall", () => {
    expect(rule(".gmaps-modal-hero").height).toBe("200px");
  });

  it("no other rule gives it another height", () => {
    const heights = Array.from(css.matchAll(/(?:^|\n)\.gmaps-modal-hero\s*\{([^}]*)\}/g)).map((m) => m[1].match(/height:\s*([^;]+);/)?.[1]);
    expect(heights.filter(Boolean)).toEqual(["200px"]);
  });

  it("its picture fills it: width 100%, height 100%, display block, object-fit cover, object-position center", () => {
    expect(rule(".gmaps-modal-hero img")).toMatchObject({
      width: "100%",
      height: "100%",
      display: "block",
      "object-fit": "cover",
      "object-position": "center",
    });
  });

  it("the chips, the close button and the gradient are as they were", () => {
    expect(rule(".gmaps-modal-hero-overlay")).toMatchObject({
      position: "absolute",
      inset: "0",
      background: "linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, transparent 60%)",
    });
    expect(rule(".dest-hero-chips")).toMatchObject({ top: "12px", left: "12px" });
    expect(rule(".dest-close-round")).toMatchObject({ top: "12px", right: "12px", width: "32px", height: "32px" });
  });
});

describe("what the hero is given", () => {
  it("the slideshow in it takes the hero's whole height, so there is no gap under the picture", () => {
    const hero = openDetails();
    const heroHeight = parseFloat(rule(".gmaps-modal-hero").height); // from the CSS file
    const slideshow = hero.querySelector(".resort-carousel");
    const given = slideshow.style.height;

    // 100% of the hero, or at least as many pixels as the hero has: never fewer
    expect(given === "100%" || parseFloat(given) >= heroHeight).toBe(true);
  });

  it("the picture is the slideshow's picture, a real img and not a background", () => {
    const hero = openDetails();
    const img = hero.querySelector("img.resort-carousel-img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("a.jpg");
    expect(img.getAttribute("style")).toBeNull(); // no size of its own: the CSS gives it the whole hero
    expect(hero.getAttribute("style")).toBeNull();
  });

  it("with no photo the placeholder also fills the hero", () => {
    const hero = openDetails({ ...DESTINATION, images: [] });
    expect(hero.querySelector(".destination-image-fallback").style.height).toBe("100%");
  });

  it("the chips, the close button and the gradient are still in the hero", () => {
    const hero = openDetails();
    expect(hero.querySelector(".dest-hero-chips .dest-chip-status")).not.toBeNull();
    expect(hero.querySelector(".dest-hero-chips .dest-chip-category")).not.toBeNull();
    expect(within(hero).getByRole("button", { name: "Close details" })).toBeTruthy();
    expect(hero.querySelector(".gmaps-modal-hero-overlay")).not.toBeNull();
  });
});
