import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
// The same three parts as the real picker, in its order, to show where the form puts its own fields.
jest.mock("../../shared/LocationPicker", () => ({ beforeMap, applyLabel = "Apply Pin", hideHeader }) => (
  <div className="location-picker" data-hide-header={String(Boolean(hideHeader))}>
    <div className="location-picker-search">
      <input type="text" placeholder="Paste Google Maps URL" />
      <button type="button">{applyLabel}</button>
    </div>
    {beforeMap}
    <div className="location-picker-map" />
  </div>
));

// Beach One: 1 review, 4.8. Cove Two: no review (the server sends 0 and a count of 0).
const BEACH = {
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
  monthly_arrivals: 18,
  yearly_arrivals: 240,
  itinerary_ids: [1, 3],
  images: ["a.jpg", "b.jpg"],
  latitude: 14.2,
  longitude: 121.7,
};
const COVE = {
  ...BEACH,
  resort_id: 5,
  resort_name: "Cove Two",
  tourism_rating: 0,
  review_count: 0,
  monthly_arrivals: 0,
  yearly_arrivals: 0,
  itinerary_ids: [],
  images: [],
};
const CLOSED = { ...BEACH, resort_id: 6, resort_name: "Closed Cove", is_active: false };

const ITINERARIES = [
  { id: 1, name: "Overnight", is_active: true },
  { id: 2, name: "Same Day", is_active: true },
  { id: 3, name: "2 Nights", is_active: true },
  { id: 4, name: "Retired Trip", is_active: false },
];

function review(id, destinationId, extra = {}) {
  return {
    id,
    destinationId,
    reviewer: `Reviewer ${id}`,
    rating: 5,
    status: "positive",
    date: "2026-09-22",
    title: `Title ${id}`,
    message: `Message ${id}`,
    reply: "",
    photos: [],
    is_hidden: false,
    ...extra,
  };
}

function setup(resorts = [BEACH, COVE], feedbackEntries = [], extra = {}) {
  const value = {
    referenceTables: { resorts, itineraries: ITINERARIES },
    feedbackEntries,
    updateFeedbackEntry: jest.fn(),
    hideFeedbackEntry: jest.fn(),
    unhideFeedbackEntry: jest.fn(),
    createResort: jest.fn().mockResolvedValue({}),
    updateResort: jest.fn().mockResolvedValue({ ...BEACH }),
    uploadResortImage: jest.fn(),
    ...extra,
  };
  useTourismData.mockReturnValue(value);
  render(<DestinationManagement initialTab="destinations" />);
  return value;
}

function cardOf(name) {
  return screen.getByRole("heading", { name }).closest(".destination-card");
}

function openDetails(name) {
  fireEvent.click(within(cardOf(name)).getByRole("button", { name: /Details/ }));
  return document.querySelector(".gmaps-modal-content");
}

function openEdit(name) {
  fireEvent.click(within(cardOf(name)).getByTitle("Edit Destination & Images"));
  return document.querySelector("form.dest-edit");
}

const texts = (nodes) => Array.from(nodes).map((node) => node.textContent);

describe("the rating on the card", () => {
  it("says No ratings yet when nothing counts, never 0.0", () => {
    setup();
    expect(within(cardOf("Cove Two")).getByText("No ratings yet", { selector: ".destination-rating" })).toBeTruthy();
    expect(within(cardOf("Cove Two")).queryByText(/0\.0/)).toBeNull();
  });

  it("shows the rating when a review counts", () => {
    setup();
    expect(within(cardOf("Beach One")).getByText("4.8", { selector: ".destination-rating" })).toBeTruthy();
  });

  it("the average at the foot leaves out the destinations with no review", () => {
    setup();
    const foot = document.querySelector(".destination-footer");
    expect(within(foot).getByText("4.8")).toBeTruthy(); // not (4.8 + 0) / 2 = 2.4
    expect(foot.textContent).not.toMatch(/2\.4|0\.0/);
  });

  it("the average says No ratings yet when none of them has a review", () => {
    setup([COVE]);
    expect(within(document.querySelector(".destination-footer")).getByText("No ratings yet")).toBeTruthy();
  });
});

describe("Inactive on the web", () => {
  it("an inactive destination is still in the list, with an Inactive badge", () => {
    setup([BEACH, CLOSED]);
    expect(screen.getByRole("heading", { name: "Closed Cove" })).toBeTruthy();
    expect(within(cardOf("Closed Cove")).getByText("Inactive", { selector: ".destination-status" })).toBeTruthy();
    expect(within(cardOf("Beach One")).getByText("Active", { selector: ".destination-status" })).toBeTruthy();
    expect(texts(document.querySelectorAll(".destination-footer strong")).slice(0, 2)).toEqual(["2", "2"]); // SHOWING 2 / 2
  });

  it("a destination from an older server, with no status, counts as active", () => {
    const { is_active, ...older } = BEACH; // eslint-disable-line no-unused-vars
    setup([older]);
    expect(within(cardOf("Beach One")).getByText("Active", { selector: ".destination-status" })).toBeTruthy();
  });

  it("Details of an inactive one say Inactive in the hero, without the check", () => {
    setup([CLOSED]);
    openDetails("Closed Cove");
    const chip = document.querySelector(".gmaps-modal-hero .dest-chip-status");
    expect(chip.textContent).toBe("Inactive");
    expect(chip.classList.contains("inactive")).toBe(true);
    expect(chip.querySelector("svg")).toBeNull();
  });
});

describe("Details", () => {
  it("the hero has the status chip with a check and the category chip, and a round close button", () => {
    setup();
    openDetails("Beach One");
    const hero = document.querySelector(".gmaps-modal-hero");
    const status = hero.querySelector(".dest-chip-status");
    expect(status.textContent).toBe("Active");
    expect(status.querySelector("svg")).not.toBeNull(); // the check
    expect(hero.querySelector(".dest-chip-category").textContent).toBe("Beach Resort");
    expect(within(hero).getByRole("button", { name: "Close details" }).className).toBe("dest-close-round");
  });

  it("the slideshow in the hero has no height of its own: it takes the hero's", () => {
    setup();
    openDetails("Beach One");
    expect(document.querySelector(".gmaps-modal-hero .resort-carousel").style.height).toBe("100%");
  });

  it("the name, then the place and the permit, then the three buttons", () => {
    setup();
    const body = openDetails("Beach One");
    expect(body.querySelector(".dest-details-name").textContent).toBe("Beach One");
    expect(body.querySelector(".dest-details-sub").textContent).toBe("Cagbalete · Mayor's permit verified");
    const buttons = texts(body.querySelectorAll(".gmaps-quick-actions button")).map((t) => t.trim());
    expect(buttons).toEqual(["Open in Google Maps", "Reviews (0)", "Edit / Add photos"]);
    expect(body.querySelector(".gmaps-quick-actions button").className).toContain("dest-btn-orange");
  });

  it("says No Mayor's permit in the line under the name when there is none", () => {
    setup([{ ...BEACH, with_mayors_permit: false }]);
    expect(openDetails("Beach One").querySelector(".dest-details-sub").textContent).toBe("Cagbalete · No Mayor's permit");
  });

  it("has five groups, in this order", () => {
    setup([BEACH], [review(1, 4)]);
    const body = openDetails("Beach One");
    expect(texts(body.querySelectorAll(".dest-detail-group h3"))).toEqual([
      "What the records say",
      "How a visitor gets here",
      "About this destination",
      "On the map",
      "Visitor reviews (1)",
    ]);
  });

  it("What the records say: four cells, label and value", () => {
    setup([BEACH], [review(1, 4)]);
    const group = openDetails("Beach One").querySelector(".dest-detail-group");
    const cells = Array.from(group.querySelectorAll(".dest-fact")).map((cell) => [
      cell.querySelector(".dest-label").textContent,
      cell.querySelector(".dest-value").textContent,
    ]);
    expect(cells).toEqual([
      ["Tourist rating", "4.8 from 1 review"],
      ["Arrivals this month", "18 visitors"],
      ["Arrivals this year", "240 visitors"],
      ["Photos in slideshow", "2"],
    ]);
  });

  it("says 0 visitors and No ratings yet, and 0 photos, when there is nothing", () => {
    setup();
    const group = openDetails("Cove Two").querySelector(".dest-detail-group");
    const values = texts(group.querySelectorAll(".dest-value"));
    expect(values).toEqual(["No ratings yet", "0 visitors", "0 visitors", "0"]);
    expect(group.textContent).not.toMatch(/0\.0/);
  });

  it("says visitor, not visitors, for one", () => {
    setup([{ ...BEACH, monthly_arrivals: 1, yearly_arrivals: 1 }]);
    const values = texts(openDetails("Beach One").querySelector(".dest-detail-group").querySelectorAll(".dest-value"));
    expect(values.slice(1, 3)).toEqual(["1 visitor", "1 visitor"]);
  });

  it("has no icon at the head of any row: label and value only", () => {
    setup();
    const body = openDetails("Beach One");
    const groups = body.querySelectorAll(".dest-detail-group");
    for (const group of Array.from(groups).slice(0, 3)) {
      expect(group.querySelector("svg")).toBeNull();
    }
    expect(body.querySelector(".gmaps-info-icon")).toBeNull();
  });

  it("How a visitor gets here: Access and Address, then the Length of Stay as chips by name", () => {
    setup();
    const group = openDetails("Beach One").querySelectorAll(".dest-detail-group")[1];
    const facts = Array.from(group.querySelectorAll(".dest-fact .dest-label")).map((l) => l.textContent);
    expect(facts).toEqual(["Access", "Address", "Length of stay offered"]);
    expect(texts(group.querySelectorAll(".dest-chip-static"))).toEqual(["Overnight", "2 Nights"]);
  });

  it("About this destination holds the paragraph", () => {
    setup();
    expect(openDetails("Beach One").querySelector(".dest-about").textContent).toBe("A beach.");
  });

  it("On the map: the coordinates, then the map", () => {
    setup();
    const group = openDetails("Beach One").querySelectorAll(".dest-detail-group")[3];
    expect(group.querySelector(".dest-coords").textContent).toBe("14.20000° N, 121.70000° E");
    expect(group.querySelector(".gmaps-map-preview-wrap")).not.toBeNull();
  });

  it("says how many reviews stand behind the rating, in the plural too", () => {
    setup([{ ...BEACH, review_count: 3 }]);
    const group = openDetails("Beach One").querySelector(".dest-detail-group");
    expect(within(group).getByText("4.8 from 3 reviews")).toBeTruthy();
  });
});

describe("the Edit modal: header and the box of what is worked out", () => {
  it("has the title, the name of the destination under it, and a close button", () => {
    setup();
    const form = openEdit("Beach One");
    const header = form.querySelector(".dest-edit-header");
    expect(header.querySelector("h2").textContent).toBe("Edit destination");
    expect(header.querySelector("p").textContent).toBe("Beach One");
    expect(within(header).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("the close button closes it", () => {
    setup();
    const form = openEdit("Beach One");
    fireEvent.click(within(form).getByRole("button", { name: "Close" }));
    expect(document.querySelector("form.dest-edit")).toBeNull();
  });

  it("the read-only box is the first thing after the header, with two facts, not three", () => {
    setup();
    const body = openEdit("Beach One").querySelector(".dest-edit-body");
    expect(body.firstElementChild.className).toBe("dest-readonly");
    const labels = texts(body.firstElementChild.querySelectorAll(".dest-readonly-facts .dest-label"));
    expect(labels).toEqual(["Tourist rating", "Arrivals this month"]);
    expect(body.firstElementChild.querySelector("input, select, textarea")).toBeNull();
  });

  it("shows the rating with its review count, and the month with the year under it", () => {
    setup();
    const box = openEdit("Beach One").querySelector(".dest-readonly");
    expect(texts(box.querySelectorAll(".dest-readonly-value"))).toEqual(["4.8", "18 visitors"]);
    expect(texts(box.querySelectorAll(".dest-readonly-facts .dest-hint"))).toEqual(["1 review", "240 this year"]);
  });

  it("says No ratings yet, 0 reviews, 0 visitors for a destination with nothing", () => {
    setup();
    const box = openEdit("Cove Two").querySelector(".dest-readonly");
    expect(texts(box.querySelectorAll(".dest-readonly-value"))).toEqual(["No ratings yet", "0 visitors"]);
    expect(texts(box.querySelectorAll(".dest-readonly-facts .dest-hint"))).toEqual(["0 reviews", "0 this year"]);
  });

  it("ends with the one line that says where they come from", () => {
    setup();
    const box = openEdit("Beach One").querySelector(".dest-readonly");
    expect(box.lastElementChild.textContent.replace(/\s+/g, " ")).toBe(
      "Both come from the records. They were fields you could type into, and the server threw the typing away."
    );
  });

  it("the Add form has the Add title and no read-only box: there is nothing to work out yet", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add Destination/ }));
    expect(document.querySelector(".dest-edit-header h2").textContent).toBe("Add destination");
    expect(document.querySelector(".dest-readonly")).toBeNull();
  });

  it("has no box for the rating, the monthly arrivals or the Itinerary IDs", () => {
    setup();
    const form = openEdit("Beach One");
    for (const gone of ["Tourism Rating", "Monthly Arrivals", "Itinerary IDs"]) {
      expect(within(form).queryByText(gone)).toBeNull();
    }
    expect(form.querySelector('input[type="number"][step="0.1"]')).toBeNull();
  });
});

describe("the Edit modal: the six groups", () => {
  it("are these six, in this order, each with its subtitle", () => {
    setup();
    const groups = Array.from(openEdit("Beach One").querySelectorAll(".dest-group"));
    expect(groups.map((g) => [g.querySelector("h3").textContent, g.querySelector(".dest-group-sub").textContent])).toEqual([
      ["Name and category", "What the visitor sees first."],
      ["Status", "Whether the app offers this destination at all."],
      ["How a visitor gets here", "Both of these appear in the app and in the registration form."],
      ["Photos", "These rotate in the app's slideshow."],
      ["Where it is", "Paste a Google Maps link and the pin follows it."],
      ["Description", "The paragraph under the name in the app."],
    ]);
  });

  it("the read-only box comes before the first group, and the Image key after the sixth", () => {
    setup();
    const body = openEdit("Beach One").querySelector(".dest-edit-body");
    const children = Array.from(body.children).map((c) => c.className.split(" ")[0]);
    expect(children).toEqual([
      "dest-readonly",
      "dest-group",
      "dest-group",
      "dest-group",
      "dest-group",
      "dest-group",
      "dest-group",
      "dest-image-key",
    ]);
  });

  it("the Image key has a label and a hint, and no group title", () => {
    setup();
    const key = openEdit("Beach One").querySelector(".dest-image-key");
    expect(key.querySelector("h3")).toBeNull();
    expect(within(key).getByText("Image key")).toBeTruthy();
    expect(within(key).getByText("Finds the built-in photo. Leave it unless you know what it points to.")).toBeTruthy();
  });

  it("Name and category: the name alone, then Category and Location side by side", () => {
    setup();
    const group = openEdit("Beach One").querySelectorAll(".dest-group")[0];
    expect(group.children[2].tagName).toBe("LABEL"); // the name, not in a row
    expect(within(group.children[2]).getByText("Destination name")).toBeTruthy();
    expect(texts(group.querySelectorAll(".dest-row-2 > label > span"))).toEqual(["Category", "Location"]);
  });

  it("Where it is: the paste-a-link row first, then Latitude and Longitude, then the map", () => {
    setup();
    const picker = openEdit("Beach One").querySelectorAll(".dest-group")[4].querySelector(".location-picker");
    expect(picker.dataset.hideHeader).toBe("true");
    expect(Array.from(picker.children).map((c) => c.className.split(" ")[0])).toEqual([
      "location-picker-search",
      "dest-row-2",
      "location-picker-map",
    ]);
    expect(within(picker.querySelector(".location-picker-search")).getByRole("button").textContent).toBe("Apply pin");
    expect(texts(picker.querySelectorAll(".dest-row-2 > label > span"))).toEqual(["Latitude", "Longitude"]);
  });

  it("the footer holds Cancel and Save destination, Save last", () => {
    setup();
    const footer = openEdit("Beach One").querySelector(".dest-edit-footer");
    expect(texts(footer.querySelectorAll("button"))).toEqual(["Cancel", "Save destination"]);
  });

  it("the footer is after the body, so it stays at the foot", () => {
    setup();
    const form = openEdit("Beach One");
    expect(Array.from(form.children).map((c) => c.tagName)).toEqual(["HEADER", "DIV", "FOOTER"]);
  });
});

describe("the Status: Active or Inactive", () => {
  it("the group has the two buttons and the two hints", () => {
    setup();
    const group = openEdit("Beach One").querySelectorAll(".dest-group")[1];
    expect(texts(group.querySelectorAll(".dest-seg-btn"))).toEqual(["Active", "Inactive"]);
    const hints = texts(group.querySelectorAll(".dest-hint")).map((t) => t.replace(/\s+/g, " "));
    expect(hints).toEqual([
      "Inactive takes it out of the app's destination list and out of the registration form. Records that already name it keep it, and it is never deleted.",
      "A badge on the visitor's screen. It does not hide the destination.",
    ]);
    expect(within(group).getByText("Mayor's permit")).toBeTruthy();
  });

  it("an active destination has Active pressed, an inactive one Inactive pressed", () => {
    setup([BEACH, CLOSED]);
    const active = openEdit("Beach One").querySelectorAll(".dest-seg-btn");
    expect([active[0].getAttribute("aria-pressed"), active[1].getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    expect(active[0].classList.contains("selected")).toBe(true);
    fireEvent.click(within(document.querySelector("form.dest-edit")).getByRole("button", { name: "Close" }));

    const closed = openEdit("Closed Cove").querySelectorAll(".dest-seg-btn");
    expect([closed[0].getAttribute("aria-pressed"), closed[1].getAttribute("aria-pressed")]).toEqual(["false", "true"]);
    expect(closed[1].classList.contains("selected")).toBe(true);
  });

  it("saves is_active false after Inactive is pressed, and true after Active", async () => {
    const value = setup();
    let form = openEdit("Beach One");
    fireEvent.click(within(form).getByRole("button", { name: "Inactive" }));
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(value.updateResort.mock.calls[0][1].is_active).toBe(false);

    form = openEdit("Beach One");
    fireEvent.click(within(form).getByRole("button", { name: "Inactive" }));
    fireEvent.click(within(form).getByRole("button", { name: "Active" }));
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(value.updateResort.mock.calls[1][1].is_active).toBe(true);
  });

  it("a new destination starts Active", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add Destination/ }));
    const buttons = document.querySelectorAll(".dest-seg-btn");
    expect([buttons[0].getAttribute("aria-pressed"), buttons[1].getAttribute("aria-pressed")]).toEqual(["true", "false"]);
  });
});

describe("the Length of Stay chips", () => {
  const stayGroup = (form) => within(form).getByRole("group", { name: "Length of stay offered" });

  it("are named buttons, with the picked ones pressed, and the retired one not offered", () => {
    setup();
    const group = stayGroup(openEdit("Beach One"));
    expect(texts(within(group).getAllByRole("button"))).toEqual(["Overnight", "Same Day", "2 Nights"]);
    expect(within(group).getByRole("button", { name: "Overnight" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "Same Day" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(group).getByRole("button", { name: "2 Nights" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("a picked one carries the selected class and an unpicked one does not", () => {
    setup();
    const group = stayGroup(openEdit("Beach One"));
    expect(within(group).getByRole("button", { name: "Overnight" }).className).toBe("dest-chip selected");
    expect(within(group).getByRole("button", { name: "Same Day" }).className).toBe("dest-chip");
  });

  it("the group says what it is for, and what it used to be", () => {
    setup();
    const group = openEdit("Beach One").querySelectorAll(".dest-group")[2];
    expect(within(group).getByText("Length of stay offered", { selector: ".dest-label" })).toBeTruthy();
    expect(within(group).getByText('By name. This used to be a box asking for "Itinerary IDs: 1, 2".')).toBeTruthy();
    expect(within(group).getByLabelText("Access")).toBeTruthy();
  });

  it("a retired option that is already picked stays visible", () => {
    setup([{ ...BEACH, itinerary_ids: [4] }]);
    const group = stayGroup(openEdit("Beach One"));
    expect(within(group).getByRole("button", { name: "Retired Trip" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("saves the picked ids as numbers, and sends neither the rating nor the arrivals", async () => {
    const value = setup();
    const form = openEdit("Beach One");
    const group = stayGroup(form);
    fireEvent.click(within(group).getByRole("button", { name: "Same Day" })); // pick
    fireEvent.click(within(group).getByRole("button", { name: "Overnight" })); // drop

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(value.updateResort).toHaveBeenCalledTimes(1);
    const [id, payload] = value.updateResort.mock.calls[0];
    expect(id).toBe(4);
    expect(payload.itinerary_ids).toEqual([2, 3]);
    expect(payload).not.toHaveProperty("tourism_rating");
    expect(payload).not.toHaveProperty("monthly_arrivals");
    expect(payload).not.toHaveProperty("yearly_arrivals");
    expect(payload).not.toHaveProperty("review_count");
  });
});

describe("Reviews of one destination", () => {
  const entries = [review(1, 4), review(2, 4), review(3, 5, { reviewer: "Other Place Reviewer" })];

  it("the Reviews button of a destination points at that destination's reviews only", () => {
    setup([BEACH, COVE], entries);
    const body = openDetails("Beach One");

    const button = within(body).getByRole("button", { name: /Reviews \(2\)/ });
    const list = body.querySelector("#gmaps-resort-reviews");
    expect(button).toBeTruthy();
    expect(within(list).getByText("Reviewer 1")).toBeTruthy();
    expect(within(list).getByText("Reviewer 2")).toBeTruthy();
    expect(within(list).queryByText("Other Place Reviewer")).toBeNull();
  });

  it("another destination sees only its own", () => {
    setup([BEACH, COVE], entries);
    const body = openDetails("Cove Two");

    const list = body.querySelector("#gmaps-resort-reviews");
    expect(within(body).getByRole("button", { name: /Reviews \(1\)/ })).toBeTruthy();
    expect(within(list).getByText("Other Place Reviewer")).toBeTruthy();
    expect(within(list).queryByText("Reviewer 1")).toBeNull();
  });

  it("a hidden review is not in the destination's list or its count", () => {
    setup([BEACH, COVE], [review(1, 4), review(2, 4, { is_hidden: true })]);
    const body = openDetails("Beach One");

    expect(within(body).getByRole("button", { name: /Reviews \(1\)/ })).toBeTruthy();
    expect(within(body.querySelector("#gmaps-resort-reviews")).queryByText("Reviewer 2")).toBeNull();
  });

  it("View in Feedback Hub opens the feedback list filtered to that destination", () => {
    setup([BEACH, COVE], entries);
    const body = openDetails("Beach One");

    fireEvent.click(within(body).getByRole("button", { name: /View in Feedback Hub/ }));

    expect(screen.getByLabelText("Filter by destination").value).toBe("4");
    expect(screen.getByText("Message 1")).toBeTruthy();
    expect(screen.getByText("Message 2")).toBeTruthy();
    expect(screen.queryByText("Message 3")).toBeNull();
  });
});
