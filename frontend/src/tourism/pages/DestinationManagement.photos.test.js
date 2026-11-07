/**
 * The built-in photo of a destination is for SHOWING only. It is not in `images` (what the server holds, what the Edit form lists and
 * what Save sends), so it is never written to the database and it does not come back when a photo is removed.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DestinationManagement from "./DestinationManagement";
import { addResortImage } from "../services/tourismApi";
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

const UP1 = "http://127.0.0.1:8000/media/resorts/one.png";
const UP2 = "http://127.0.0.1:8000/media/resorts/two.png";
const S3 = "https://abcd.supabase.co/storage/v1/object/public/media/resorts/aa11.png";

// what the server sends, before the web adds anything
const server = (extra = {}) => ({
  resort_id: 4,
  resort_name: "Dona Choleng Camping Resort",
  image_key: "dona-choleng-camping-resort",
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
  ...extra,
});

describe("addResortImage: the built-in photo is not put in images", () => {
  it("no upload: images is empty, the built-in photo is only for showing", () => {
    const resort = addResortImage(server());
    expect(resort.images).toEqual([]);
    expect(resort.displayImages).toHaveLength(1);
    expect(resort.image).toBe(resort.displayImages[0]);
    expect(resort.image).toBeTruthy();
  });

  it("an upload: images is exactly what the server sent, and that is what is shown", () => {
    const resort = addResortImage(server({ images: [UP1, S3] }));
    expect(resort.images).toEqual([UP1, S3]);
    expect(resort.displayImages).toEqual([UP1, S3]);
    expect(resort.image).toBe(UP1);
  });

  it("a destination with no upload and no built-in photo shows nothing", () => {
    const resort = addResortImage(server({ image_key: "best-resort", resort_name: "ZZ-BAGO K7Q" }));
    expect(resort.images).toEqual([]);
    expect(resort.displayImages).toEqual([]);
    expect(resort.image).toBe("");
  });

  it("whatever the case, no build path is ever in images", () => {
    for (const images of [[], [UP1], [UP1, UP2, S3]]) {
      expect(JSON.stringify(addResortImage(server({ images })).images)).not.toContain("/static/media/");
    }
  });
});

let updateResort;

function openEdit(resort) {
  updateResort = jest.fn().mockImplementation(async (id, payload) => addResortImage({ ...server(), ...payload, resort_id: id }));
  useTourismData.mockReturnValue({
    referenceTables: { resorts: [addResortImage(resort)], itineraries: [] },
    feedbackEntries: [],
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn(),
    unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn(),
    updateResort,
    uploadResortImage: jest.fn(),
  });
  render(<DestinationManagement initialTab="destinations" />);
  const card = screen.getByRole("heading", { name: resort.resort_name }).closest(".destination-card");
  fireEvent.click(within(card).getByTitle("Edit Destination & Images"));
  return screen.getByRole("form", { name: "Edit destination" });
}

const thumbnails = () => document.querySelectorAll(".image-preview-card");

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save destination" }));
  await waitFor(() => expect(updateResort).toHaveBeenCalled());
  return updateResort.mock.calls[updateResort.mock.calls.length - 1][1];
}

describe("the Edit form shows only what was really uploaded", () => {
  it("a destination with a built-in photo and no upload: no thumbnail, none to remove, count 0", () => {
    const form = openEdit(server());
    expect(thumbnails()).toHaveLength(0);
    expect(within(form).getByText("Slideshow images (0)")).toBeTruthy();
    expect(within(form).queryByTitle("Remove image")).toBeNull();
  });

  it("Save sends no build path, and an empty list stays empty", async () => {
    openEdit(server());
    const payload = await save();
    expect(payload.images).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("/static/media/");
  });

  it("Save of a destination that has an upload sends exactly that upload", async () => {
    openEdit(server({ images: [UP1] }));
    expect(thumbnails()).toHaveLength(1);
    const payload = await save();
    expect(payload.images).toEqual([UP1]);
  });

  it("removing a real upload takes it out, and it stays out after Save", async () => {
    const form = openEdit(server({ images: [UP1, UP2] }));
    expect(thumbnails()).toHaveLength(2);
    fireEvent.click(within(form).getAllByTitle("Remove image")[0]);
    expect(thumbnails()).toHaveLength(1);
    const payload = await save();
    expect(payload.images).toEqual([UP2]);
    // the server's answer, as the page takes it back: the removed photo is not there and nothing was added
    const back = await updateResort.mock.results[0].value;
    expect(back.images).toEqual([UP2]);
  });

  it("removing the only upload leaves none, and the built-in photo is not put in its place", async () => {
    const form = openEdit(server({ images: [UP1] }));
    fireEvent.click(within(form).getByTitle("Remove image"));
    expect(thumbnails()).toHaveLength(0);
    const payload = await save();
    expect(payload.images).toEqual([]);
    const back = await updateResort.mock.results[0].value;
    expect(back.images).toEqual([]); // not [built-in]
    expect(back.displayImages).toHaveLength(1); // it is only shown
  });

  it("the card still SHOWS the built-in photo when there is no upload", () => {
    useTourismData.mockReturnValue({
      referenceTables: { resorts: [addResortImage(server())], itineraries: [] },
      feedbackEntries: [],
      updateFeedbackEntry: jest.fn(),
      hideFeedbackEntry: jest.fn(),
      unhideFeedbackEntry: jest.fn(),
      createResort: jest.fn(),
      updateResort: jest.fn(),
      uploadResortImage: jest.fn(),
    });
    render(<DestinationManagement initialTab="destinations" />);
    const card = screen.getByRole("heading", { name: "Dona Choleng Camping Resort" }).closest(".destination-card");
    const shown = card.querySelector("img.resort-carousel-img");
    expect(shown).toBeTruthy();
    expect(shown.getAttribute("src")).toBeTruthy();
  });
});
