/**
 * The three optional props of LocationPicker (hideHeader, beforeMap, applyLabel), which the destination form uses to put the paste-a-link row
 * first, its own Latitude / Longitude fields before the map, and "Apply pin" on the button. Left alone, the picker is as it was.
 */
import React from "react";
import { render } from "@testing-library/react";

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

const draw = (props = {}) =>
  render(<LocationPicker latitude="14.2" longitude="121.7" onChange={jest.fn()} {...props} />).container;

describe("LocationPicker without the new props", () => {
  it("has its header, the button called Apply Pin, and the map right after the search row", () => {
    const container = draw();
    expect(container.querySelector(".location-picker-header")).not.toBeNull();
    expect(container.querySelector(".location-picker-search button").textContent).toBe("Apply Pin");
    expect(container.querySelector(".location-picker-search + .location-picker-map")).not.toBeNull();
  });
});

describe("LocationPicker with them", () => {
  it("hideHeader drops the header, so the paste row is the first thing", () => {
    const container = draw({ hideHeader: true });
    expect(container.querySelector(".location-picker-header")).toBeNull();
    expect(container.querySelector(".location-picker").firstElementChild.className).toBe("location-picker-search");
  });

  it("applyLabel is the button's words", () => {
    expect(draw({ applyLabel: "Apply pin" }).querySelector(".location-picker-search button").textContent).toBe("Apply pin");
  });

  it("beforeMap sits after the paste row and before the map", () => {
    const container = draw({ hideHeader: true, beforeMap: <div className="fields">Latitude Longitude</div> });
    const order = Array.from(container.querySelector(".location-picker").children).map((child) => child.className);
    expect(order).toEqual(["location-picker-search", "fields", "location-picker-map"]);
  });
});
