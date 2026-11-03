/**
 * A destination is never deleted, so the page has no way to ask for it: no trash button on the card, no confirmation modal, and nothing in the
 * page, the context or the API client that deletes a resort. Inactive (in Edit) is the end of a destination.
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

const read = (...parts) => readFileSync(join(__dirname, ...parts), "utf8");

const RESORT = {
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
  images: ["a.jpg"],
  latitude: 14.2,
  longitude: 121.7,
};

function draw(extra = {}) {
  const value = {
    referenceTables: { resorts: [RESORT, { ...RESORT, resort_id: 5, resort_name: "Cove Two", is_active: false }], itineraries: [] },
    feedbackEntries: [],
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn(),
    unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(),
    updateResort: jest.fn().mockResolvedValue(RESORT),
    uploadResortImage: jest.fn(),
    // a function that is NOT supposed to exist any more: if the page still called one, this would see it
    deleteResort: jest.fn(),
    ...extra,
  };
  useTourismData.mockReturnValue(value);
  render(<DestinationManagement initialTab="destinations" />);
  return value;
}

const cardOf = (name) => screen.getByRole("heading", { name }).closest(".destination-card");

describe("the destination card", () => {
  it("has no trash button: its buttons are Details and Edit, and nothing else", () => {
    draw();
    for (const name of ["Beach One", "Cove Two"]) {
      const row = cardOf(name).querySelector(".destination-action-row");
      const buttons = Array.from(row.querySelectorAll("button")).map((b) => b.textContent.trim());
      expect(buttons).toEqual(["Details", "Edit"]);
      expect(row.querySelector(".destination-delete-btn")).toBeNull();
    }
    expect(screen.queryByTitle("Delete Destination")).toBeNull();
    expect(document.querySelector(".destination-delete-btn")).toBeNull();
  });

  it("clicking every button of a card leaves no delete modal and no question about deleting", () => {
    const value = draw();
    const card = cardOf("Beach One");
    for (const button of Array.from(card.querySelectorAll("button"))) {
      fireEvent.click(button);
    }
    expect(screen.queryByText(/Are you sure you want to delete/)).toBeNull();
    expect(screen.queryByText(/prevent deletion/)).toBeNull();
    expect(document.querySelector(".delete-record-confirm")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(value.deleteResort).not.toHaveBeenCalled();
  });

  it("an inactive destination has no trash button either: Inactive is not a step before deleting", () => {
    draw();
    expect(within(cardOf("Cove Two")).queryByTitle("Delete Destination")).toBeNull();
    expect(within(cardOf("Cove Two")).getByText("Inactive", { selector: ".destination-status" })).toBeTruthy();
  });
});

describe("Details and Edit", () => {
  it("Details has no delete in it", () => {
    const value = draw();
    fireEvent.click(within(cardOf("Beach One")).getByRole("button", { name: /Details/ }));
    const body = document.querySelector(".gmaps-modal-content");
    expect(within(body).queryByRole("button", { name: /delete/i })).toBeNull();
    expect(value.deleteResort).not.toHaveBeenCalled();
  });

  it("Edit has no delete in it: its buttons are Close, Active, Inactive, the chips, Cancel and Save destination", () => {
    const value = draw();
    fireEvent.click(within(cardOf("Beach One")).getByTitle("Edit Destination & Images"));
    const form = document.querySelector("form.dest-edit");
    expect(within(form).queryByRole("button", { name: /delete/i })).toBeNull();
    expect(within(form).getByRole("button", { name: "Inactive" })).toBeTruthy(); // the way out is here
    expect(value.deleteResort).not.toHaveBeenCalled();
  });
});

describe("nothing in the code deletes a resort", () => {
  it("the page: no deleteResort, no confirmation text, no trash icon, no delete state", () => {
    const page = read("DestinationManagement.js");
    for (const gone of ["deleteResort", "Delete Destination", "Are you sure you want to delete", "FiTrash2", "deleteTarget", "confirmDeleteDestination"]) {
      expect({ gone, found: page.includes(gone) }).toEqual({ gone, found: false });
    }
  });

  it("the context does not hand out a deleteResort, and the API client has none", () => {
    const context = read("..", "context", "TourismDataContext.js");
    const api = read("..", "services", "tourismApi.js");
    expect(context).not.toMatch(/deleteResort/);
    expect(api).not.toMatch(/deleteResort/);
    // no DELETE to /resorts/ anywhere in the client
    expect(api).not.toMatch(/resorts\/\$\{[^}]*\}\/`[^)]*method:\s*"DELETE"/s);
  });

  it("the stylesheet no longer has the trash button's rule", () => {
    expect(read("..", "Tourism_index.css")).not.toMatch(/\.destination-delete-btn/);
  });
});
