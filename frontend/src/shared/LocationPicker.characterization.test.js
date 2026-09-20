/**
 * CHARACTERIZATION TESTS - Establishment Map Pin (LocationPicker).
 *
 * Records the CURRENT parsing, validation and normalisation behaviour of the
 * map-pin input used by the Register/Edit Establishment form. Not a
 * specification: if parsing rules are intentionally changed later, update
 * these expectations in the same commit as the change.
 *
 * Leaflet and react-leaflet are stubbed because they require a real DOM/canvas
 * that jsdom does not provide; the logic under test (URL/coordinate parsing,
 * the Mauban bounds check, and 6-decimal normalisation) is pure and unaffected.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ setView: jest.fn(), getZoom: () => 13 }),
  useMapEvents: () => null,
}));

jest.mock("leaflet", () => ({
  __esModule: true,
  default: { DivIcon: class {} },
  DivIcon: class {},
}));

import LocationPicker from "./LocationPicker";

const REJECTION_MESSAGE = "Paste a valid Google Maps URL or lat,lng near Mauban.";

function setup(props = {}) {
  const onChange = jest.fn();
  const utils = render(
    <LocationPicker latitude="" longitude="" onChange={onChange} {...props} />
  );
  const input = utils.container.querySelector(".location-picker-search input");
  const applyButton = utils.container.querySelector(".location-picker-search button");
  return { ...utils, onChange, input, applyButton };
}

/** Type a value into the pin input and click Apply Pin. */
function applyPin(input, applyButton, value) {
  fireEvent.change(input, { target: { value } });
  fireEvent.click(applyButton);
}

const errorText = (container) => {
  const el = container.querySelector(".location-picker-error");
  return el ? el.textContent : null;
};

/** The coordinate pair handed back through onChange, or null if none. */
function changedCoords(onChange) {
  if (onChange.mock.calls.length === 0) return null;
  const byField = Object.fromEntries(onChange.mock.calls);
  return [byField.latitude, byField.longitude];
}

describe("FOCUS 6: map pin - ACCEPTED input", () => {
  test("plain lat,lng is accepted and normalised to 6 decimal places", () => {
    const { input, applyButton, onChange, container } = setup();
    applyPin(input, applyButton, "14.185,121.731");

    const coords = changedCoords(onChange);
    console.log("PLAIN COORDS ->", JSON.stringify(coords));
    expect(coords).toEqual(["14.185000", "121.731000"]);
    expect(typeof coords[0]).toBe("string");
    expect(errorText(container)).toBeNull();
  });

  test("extra precision is truncated to exactly 6 decimals", () => {
    const { input, applyButton, onChange } = setup();
    applyPin(input, applyButton, "14.18512345678,121.73187654321");
    const coords = changedCoords(onChange);
    console.log("HIGH-PRECISION ->", JSON.stringify(coords));
    expect(coords).toEqual(["14.185123", "121.731877"]);
  });

  test("surrounding whitespace is tolerated", () => {
    const { input, applyButton, onChange } = setup();
    applyPin(input, applyButton, "   14.185 , 121.731   ");
    expect(changedCoords(onChange)).toEqual(["14.185000", "121.731000"]);
  });

  test("Google Maps @lat,lng URL is accepted", () => {
    const { input, applyButton, onChange } = setup();
    applyPin(input, applyButton, "https://www.google.com/maps/@14.1855,121.7312,15z");
    const coords = changedCoords(onChange);
    console.log("@-FORM URL ->", JSON.stringify(coords));
    expect(coords).toEqual(["14.185500", "121.731200"]);
  });

  test("Google Maps place URL using the !3d/!4d form is accepted", () => {
    const { input, applyButton, onChange } = setup();
    // Deliberately contains no "@" segment, so the !3d/!4d branch is exercised.
    applyPin(
      input,
      applyButton,
      "https://www.google.com/maps/place/Mauban/data=!3m1!4b1!4m5!3d14.186!4d121.732"
    );
    const coords = changedCoords(onChange);
    console.log("!3d/!4d URL ->", JSON.stringify(coords));
    expect(coords).toEqual(["14.186000", "121.732000"]);
  });

  test("query-parameter URL forms (q / query / ll) are accepted", () => {
    [
      ["https://maps.google.com/?q=14.187,121.733", ["14.187000", "121.733000"]],
      ["https://maps.google.com/?query=14.188,121.734", ["14.188000", "121.734000"]],
      ["https://maps.google.com/?x=1&ll=14.189,121.735", ["14.189000", "121.735000"]],
    ].forEach(([url, expected]) => {
      const { input, applyButton, onChange } = setup();
      applyPin(input, applyButton, url);
      expect(changedCoords(onChange)).toEqual(expected);
    });
  });

  test("the @ form takes precedence when a URL contains both @ and !3d", () => {
    const { input, applyButton, onChange } = setup();
    applyPin(
      input,
      applyButton,
      "https://www.google.com/maps/place/X/@14.180,121.720,17z/data=!3m1!4b1!4m5!3d14.190!4d121.740"
    );
    const coords = changedCoords(onChange);
    console.log("BOTH @ AND !3d PRESENT ->", JSON.stringify(coords));
    expect(coords).toEqual(["14.180000", "121.720000"]); // the @ values win
  });
});

describe("FOCUS 6: map pin - REJECTED input leaves coordinates unchanged", () => {
  test.each([
    ["empty input", ""],
    ["whitespace only", "   "],
    ["malformed URL", "https://example.com/not-a-map"],
    ["malformed coordinates", "abc,def"],
    ["single number", "14.185"],
    ["partial pair", "14.185,"],
    ["words", "somewhere near the plaza"],
  ])("%s is rejected with an error and no onChange", (_label, value) => {
    const { input, applyButton, onChange, container } = setup();
    applyPin(input, applyButton, value);

    expect(onChange).not.toHaveBeenCalled();
    expect(errorText(container)).toBe(REJECTION_MESSAGE);
  });

  test.each([
    ["null island", "0,0"],
    ["New York", "40.7128,-74.0060"],
    ["just north of Mauban", "14.5,121.731"],
    ["just west of Mauban", "14.185,121.4"],
    ["out-of-range via @ URL", "https://www.google.com/maps/@40.7128,-74.0060,15z"],
  ])("out-of-range coordinate (%s) is rejected", (_label, value) => {
    const { input, applyButton, onChange, container } = setup();
    applyPin(input, applyButton, value);

    expect(onChange).not.toHaveBeenCalled();
    expect(errorText(container)).toBe(REJECTION_MESSAGE);
  });

  test("rejection does not clear coordinates already held by the form", () => {
    const { input, applyButton, onChange, container } = setup({
      latitude: "14.185000",
      longitude: "121.731000",
    });
    applyPin(input, applyButton, "not a location");

    expect(onChange).not.toHaveBeenCalled();
    expect(errorText(container)).toBe(REJECTION_MESSAGE);
    // header still shows the previously held pin
    expect(container.querySelector(".location-picker-header small").textContent).toBe(
      "14.185000, 121.731000"
    );
  });

  test("the accepted Mauban bounds are lat 13.9-14.4 and lng 121.55-122 inclusive", () => {
    const inBounds = [
      ["13.9,121.55", ["13.900000", "121.550000"]],
      ["14.4,122", ["14.400000", "122.000000"]],
    ];
    inBounds.forEach(([value, expected]) => {
      const { input, applyButton, onChange } = setup();
      applyPin(input, applyButton, value);
      expect(changedCoords(onChange)).toEqual(expected);
    });

    ["13.89,121.55", "14.41,122", "14.0,121.54", "14.0,122.01"].forEach((value) => {
      const { input, applyButton, onChange } = setup();
      applyPin(input, applyButton, value);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

describe("FOCUS 6: map pin - display state", () => {
  test("shows a placeholder message when no valid coordinates are held", () => {
    const { container } = setup();
    expect(container.querySelector(".location-picker-header small").textContent).toBe(
      "No valid coordinates selected"
    );
    expect(container.querySelector(".location-picker-link")).toBeNull();
  });

  test("out-of-range stored coordinates are treated as 'no valid pin' for display", () => {
    // Mirrors a record whose lat/lng were typed straight into the form's number
    // inputs, bypassing this component's bounds check.
    const { container } = setup({ latitude: 99, longitude: -400 });
    expect(container.querySelector(".location-picker-header small").textContent).toBe(
      "No valid coordinates selected"
    );
  });

  test("in-range stored coordinates render a Google Maps link", () => {
    const { container } = setup({ latitude: 14.185, longitude: 121.731 });
    const link = container.querySelector(".location-picker-link");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=14.185,121.731"
    );
  });

  test("the configurable label is rendered", () => {
    const { container } = setup({ label: "Establishment Map Pin" });
    expect(container.querySelector(".location-picker-header span").textContent).toBe(
      "Establishment Map Pin"
    );
  });
});
