/**
 * The hint under "Destination name", in the Add and in the Edit form (one form serves both): renaming does not move records, but the
 * online booking import matches rows by name, so rows with the old name land in "Others / Private Residence".
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import DestinationManagement, { RENAME_HINT } from "./DestinationManagement";
import { useTourismData } from "../context/TourismDataContext";

jest.mock("../context/TourismDataContext", () => ({ useTourismData: jest.fn() }));
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/destinations" }) }), { virtual: true });
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: jest.fn(), getZoom: () => 13 }),
  useMapEvents: () => null,
}));
jest.mock("leaflet", () => ({
  __esModule: true,
  default: { DivIcon: class {} },
  DivIcon: class {},
}));

const EXPECTED =
  'Renaming a destination does not move its records, but the online booking import matches rows by name. Rows that still carry the old name would land in "Others / Private Residence" instead.';

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
  images: [],
  latitude: 14.2,
  longitude: 121.7,
};

function show() {
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [RESORT], itineraries: [] },
    feedbackEntries: [],
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn(),
    unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(),
    updateResort: jest.fn(),
    uploadResortImage: jest.fn(),
  });
  render(<DestinationManagement initialTab="destinations" />);
}

// the hint is the paragraph right after the Destination name field, in the same group
function hintUnderName(form) {
  const field = within(form).getByLabelText(/Destination name/);
  const group = field.closest(".dest-group");
  const hints = Array.from(group.querySelectorAll("p.dest-hint")).map((p) => p.textContent);
  return { hints, after: field.closest("label, .tourist-record-field") };
}

describe("the rename hint", () => {
  it("is the words that were asked for", () => {
    expect(RENAME_HINT).toBe(EXPECTED);
  });

  it("is in the Edit form, under Destination name, in the style of the other hints", () => {
    show();
    const card = screen.getByRole("heading", { name: "Beach One" }).closest(".destination-card");
    fireEvent.click(within(card).getByTitle("Edit Destination & Images"));
    const form = screen.getByRole("form", { name: "Edit destination" });
    const { hints } = hintUnderName(form);
    expect(hints).toContain(EXPECTED);
    const hint = within(form).getByText(EXPECTED);
    expect(hint.tagName).toBe("P");
    expect(hint.className).toBe("dest-hint"); // the class the other hints of this form carry
  });

  it("is in the Add form too", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /Add Destination/ }));
    const form = screen.getByRole("form", { name: "Add destination" });
    expect(within(form).getByText(EXPECTED)).toBeTruthy();
  });

  it("sits right under the name field, before Category", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /Add Destination/ }));
    const form = screen.getByRole("form", { name: "Add destination" });
    const hint = within(form).getByText(EXPECTED);
    const name = within(form).getByLabelText(/Destination name/);
    const category = within(form).getByLabelText(/Category/);
    expect(name.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
