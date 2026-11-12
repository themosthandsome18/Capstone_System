/**
 * The GIS map's pin: a teardrop whose TIP is on the coordinate, bigger and on top when selected, and nothing else about the map changed.
 *
 * Two kinds of test. The first group renders the real component with a thin stand-in for react-leaflet (it records what the component asks
 * of each marker). The second group uses the REAL Leaflet (in jsdom) to place an icon, because "the tip is on the coordinate" is something
 * Leaflet does with the icon's anchor, and it is proved there and not assumed.
 */
import L from "leaflet";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaubanDestinationMap, {
  PIN_SIZE,
  PIN_TIP,
  PIN_VIEWBOX,
  POPUP_LEAVE_MS,
  SELECTED_PIN_Z_OFFSET,
  normalPinIcon,
  pinAnchor,
  selectedPinIcon,
} from "./MaubanDestinationMap";
import { normalised, expectedNorm, rule, tourismCss } from "../../testing/cssRules";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });

jest.mock("react-leaflet", () => {
  const React = require("react");
  const opened = [];
  const Marker = React.forwardRef(function Marker({ position, icon, zIndexOffset, eventHandlers, children }, ref) {
    React.useImperativeHandle(ref, () => ({ openPopup: () => opened.push(position.join(",")) }));
    return (
      <div
        data-testid="pin"
        data-position={position.join(",")}
        data-z={zIndexOffset}
        data-size={icon.options.iconSize.join("x")}
        data-anchor={icon.options.iconAnchor.join(",")}
        data-class={icon.options.className}
        onClick={eventHandlers.click}
      >
        {children}
      </div>
    );
  });
  return {
    __opened: opened,
    MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
    TileLayer: ({ url }) => <i data-testid="tile" data-url={url} />,
    // like Leaflet, a press inside the popup does not reach the marker
    Popup: ({ children }) => <div data-testid="popup" onClick={(event) => event.stopPropagation()}>{children}</div>,
    Marker,
    useMap: () => ({ setView() {}, fitBounds() {}, getZoom: () => 11 }),
  };
});

const opened = require("react-leaflet").__opened;

const DESTINATIONS = [
  { resort_id: 1, resort_name: "Alpha Beach", type: "Beach Resort", location: "Mauban", latitude: 14.2, longitude: 121.7 },
  { resort_id: 2, resort_name: "Bravo Island", type: "Island", location: "Mauban", latitude: 14.21, longitude: 121.71 },
  { resort_id: 3, resort_name: "Charlie Falls", type: "Falls", location: "Mauban", latitude: 14.3, longitude: 121.8 },
];

function renderMap(props = {}) {
  const onSelectDestination = jest.fn();
  const view = render(
    <MaubanDestinationMap
      destinations={DESTINATIONS}
      selectedDestination={null}
      onSelectDestination={onSelectDestination}
      {...props}
    />
  );
  return { ...view, onSelectDestination };
}

const pins = () => screen.getAllByTestId("pin");

beforeEach(() => {
  opened.length = 0;
});

describe("one pin for each destination on the map", () => {
  it("the number of pins is the number of destinations it is given", () => {
    renderMap();
    expect(pins()).toHaveLength(DESTINATIONS.length);
  });

  it("a destination without a usable coordinate has no pin, as before", () => {
    renderMap({
      destinations: [...DESTINATIONS, { resort_id: 9, resort_name: "Nowhere", latitude: null, longitude: null }, { resort_id: 10, resort_name: "Manila", latitude: 14.6, longitude: 121.0 }],
    });
    expect(pins()).toHaveLength(3);
  });

  it("with none, there is no pin", () => {
    renderMap({ destinations: [] });
    expect(screen.queryAllByTestId("pin")).toHaveLength(0);
  });

  it("each pin is at its own destination's coordinate (position is not moved)", () => {
    renderMap();
    expect(pins().map((pin) => pin.dataset.position)).toEqual(["14.2,121.7", "14.21,121.71", "14.3,121.8"]);
  });
});

describe("the selected pin", () => {
  it("is bigger than the others: 38 x 48 against 28 x 36", () => {
    renderMap({ selectedDestination: DESTINATIONS[1] });

    expect(pins().map((pin) => pin.dataset.size)).toEqual(["28x36", "38x48", "28x36"]);
    expect(PIN_SIZE).toEqual({ normal: [28, 36], selected: [38, 48] });
  });

  it("is above the other pins: only it has a z offset, and that offset is above the rest", () => {
    renderMap({ selectedDestination: DESTINATIONS[1] });

    expect(pins().map((pin) => Number(pin.dataset.z))).toEqual([0, SELECTED_PIN_Z_OFFSET, 0]);
    expect(SELECTED_PIN_Z_OFFSET).toBeGreaterThan(0);
  });

  it("has the ring round its head; the others do not", () => {
    expect(selectedPinIcon.options.html).toContain("mauban-pin-ring");
    expect(normalPinIcon.options.html).not.toContain("mauban-pin-ring");
    renderMap({ selectedDestination: DESTINATIONS[0] });
    expect(pins().map((pin) => pin.dataset.class)).toEqual([
      "mauban-pin-icon mauban-pin-icon-selected",
      "mauban-pin-icon",
      "mauban-pin-icon",
    ]);
  });

  it("when nothing is selected, none is big", () => {
    renderMap();
    expect(pins().map((pin) => pin.dataset.size)).toEqual(["28x36", "28x36", "28x36"]);
  });
});

describe("pressing a pin", () => {
  it("selects that destination, and only that one", () => {
    const { onSelectDestination } = renderMap();

    fireEvent.click(pins()[2]);

    expect(onSelectDestination).toHaveBeenCalledTimes(1);
    expect(onSelectDestination.mock.calls[0][0]).toMatchObject({ resort_id: 3, resort_name: "Charlie Falls" });
  });

  it("each pin selects its own destination", () => {
    const { onSelectDestination } = renderMap();

    pins().forEach((pin) => fireEvent.click(pin));

    expect(onSelectDestination.mock.calls.map(([destination]) => destination.resort_id)).toEqual([1, 2, 3]);
  });

  it("the popup of a pin has that destination's name (its content is not changed)", () => {
    renderMap();

    expect(pins().map((pin) => within(pin).getByTestId("popup").textContent)).toEqual([
      expect.stringContaining("Alpha Beach"),
      expect.stringContaining("Bravo Island"),
      expect.stringContaining("Charlie Falls"),
    ]);
    expect(within(pins()[0]).getByTestId("popup").textContent).toContain("Beach Resort");
    expect(within(pins()[0]).getByTestId("popup").textContent).toContain("📍 Mauban");
  });

  it("opens the popup of the selected destination's marker, and no other", () => {
    renderMap({ selectedDestination: DESTINATIONS[1] });

    expect(opened).toEqual(["14.21,121.71"]);
  });
});

describe("nothing else about the map changed", () => {
  it("the tile is the same Google street tile, and the satellite one on the satellite layer", () => {
    const { unmount } = renderMap();
    expect(screen.getByTestId("tile").dataset.url).toBe("http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}");
    unmount();

    renderMap({ mapLayer: "satellite" });
    expect(screen.getByTestId("tile").dataset.url).toBe("http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}");
  });

  it("no name is written on the map: the pin's drawing has no text, and the popup shows the name only when pressed", () => {
    for (const icon of [normalPinIcon, selectedPinIcon]) {
      expect(icon.options.html).not.toMatch(/<text|Alpha|Beach/);
    }
  });
});

describe("this month's visitors in the popup", () => {
  it("says N visitors this month, from the monthly_arrivals the destination already has", () => {
    renderMap({ destinations: [{ ...DESTINATIONS[0], monthly_arrivals: 1234, yearly_arrivals: 99999 }] });

    const text = within(pins()[0]).getByTestId("popup").textContent;
    expect(text).toContain("1,234 visitors this month");
    expect(text).not.toContain("99,999"); // this month only, not the year
  });

  it("says 0 visitors this month: zero is an answer too", () => {
    renderMap({ destinations: [{ ...DESTINATIONS[0], monthly_arrivals: 0 }] });

    expect(within(pins()[0]).getByTestId("popup").textContent).toContain("0 visitors this month");
  });

  it("says 0 when the destination has no figure at all, and 1 visitor in the singular", () => {
    renderMap({ destinations: [{ ...DESTINATIONS[0] }, { ...DESTINATIONS[1], monthly_arrivals: 1 }] });

    expect(within(pins()[0]).getByTestId("popup").textContent).toContain("0 visitors this month");
    expect(within(pins()[1]).getByTestId("popup").textContent).toContain("1 visitor this month");
  });

  it("sits after the rating and before the location line", () => {
    renderMap({ destinations: [{ ...DESTINATIONS[0], tourism_rating: 4, monthly_arrivals: 7 }] });

    const text = within(pins()[0]).getByTestId("popup").textContent;
    expect(text.indexOf("★")).toBeLessThan(text.indexOf("7 visitors this month"));
    expect(text.indexOf("7 visitors this month")).toBeLessThan(text.indexOf("📍 Mauban"));
  });

  it("asks the server for nothing: the component has no request of its own", () => {
    const source = require("fs").readFileSync(require("path").join(__dirname, "MaubanDestinationMap.js"), "utf8");
    expect(source).not.toMatch(/fetch\(|tourismApi|axios|apiClient/);
  });
});

describe("the card in the popup opens that destination's details", () => {
  const card = (index) => within(pins()[index]).getByRole("button");

  beforeEach(() => {
    mockNavigate.mockClear();
    window.matchMedia = undefined;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.matchMedia;
  });

  it("is one real button, with a cue that it can be pressed", () => {
    renderMap();

    expect(card(0).tagName).toBe("BUTTON");
    expect(card(0).getAttribute("type")).toBe("button");
    expect(card(0).textContent).toContain("View details ›");
    expect(card(0).getAttribute("aria-label")).toBe("View details of Alpha Beach");
    expect(rule(".mauban-popup-card").cursor).toBe("pointer");
    expect(normalised(".mauban-popup-card:hover").transform).toBe("translatey(-2px)");
  });

  it("goes to Destinations with this destination's id, the way Arrival Monitoring does", () => {
    renderMap();

    fireEvent.click(card(2));
    act(() => jest.advanceTimersByTime(POPUP_LEAVE_MS));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/destinations", { state: { openResortId: 3 } });
  });

  it("each card carries its own id", () => {
    renderMap();

    for (const index of [0, 1, 2]) {
      fireEvent.click(card(index));
      act(() => jest.advanceTimersByTime(POPUP_LEAVE_MS));
    }

    expect(mockNavigate.mock.calls.map(([, options]) => options.state.openResortId)).toEqual([1, 2, 3]);
  });

  it("is reached with Tab and opened with Enter", () => {
    renderMap();
    userEvent.tab();

    expect(document.activeElement).toBe(card(0));
    userEvent.keyboard("{enter}");
    act(() => jest.advanceTimersByTime(POPUP_LEAVE_MS));

    expect(mockNavigate).toHaveBeenCalledWith("/destinations", { state: { openResortId: 1 } });
  });

  it("answers first: it sinks and fades for 0.15s, and only then changes the page", () => {
    renderMap();

    fireEvent.click(card(0));

    expect(card(0).className).toContain("is-leaving");
    expect(mockNavigate).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(POPUP_LEAVE_MS - 1));
    expect(mockNavigate).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(POPUP_LEAVE_MS).toBe(150);
    expect(rule(".mauban-popup-card.is-leaving").transition).toBe("transform 0.15s ease, opacity 0.15s ease");
  });

  it("a second press while it is answering does not go twice", () => {
    renderMap();

    fireEvent.click(card(0));
    fireEvent.click(card(0));
    act(() => jest.advanceTimersByTime(POPUP_LEAVE_MS * 2));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion asked for, goes at once and does not animate", () => {
    window.matchMedia = (query) => ({ matches: query === "(prefers-reduced-motion: reduce)" });
    renderMap();

    fireEvent.click(card(1));

    expect(mockNavigate).toHaveBeenCalledWith("/destinations", { state: { openResortId: 2 } });
    expect(card(1).className).not.toContain("is-leaving");
    expect(tourismCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.mauban-popup-card,\s*\.mauban-popup-card\.is-leaving \{\s*transition: none;/);
  });

  it("with no motion setting, it still answers (matchMedia is not there, or says no)", () => {
    window.matchMedia = () => ({ matches: false });
    renderMap();

    fireEvent.click(card(0));

    expect(card(0).className).toContain("is-leaving");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("pressing the PIN is as it was", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("selects the destination and does not change the page", () => {
    const { onSelectDestination } = renderMap();

    fireEvent.click(pins()[1]);

    expect(onSelectDestination).toHaveBeenCalledTimes(1);
    expect(onSelectDestination.mock.calls[0][0]).toMatchObject({ resort_id: 2 });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("opening the popup of the selected pin does not change the page either", () => {
    renderMap({ selectedDestination: DESTINATIONS[1] });

    expect(opened).toEqual(["14.21,121.71"]);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("pressing the card is not also pressing the pin", () => {
    const { onSelectDestination } = renderMap();

    fireEvent.click(within(pins()[0]).getByRole("button"));

    expect(onSelectDestination).not.toHaveBeenCalled();
  });
});

describe("the drawing", () => {
  const draw = (icon) => {
    const host = document.createElement("div");
    host.innerHTML = icon.options.html;
    return host;
  };

  it("is a teardrop in #D7263D with a white edge of 2px that does not grow with the pin, and a small white dot in the head", () => {
    for (const icon of [normalPinIcon, selectedPinIcon]) {
      const svg = draw(icon).querySelector("svg");
      const path = svg.querySelector("path");
      expect(path.getAttribute("fill")).toBe("#D7263D");
      expect(path.getAttribute("stroke")).toBe("#ffffff");
      expect(path.getAttribute("stroke-width")).toBe("2");
      expect(path.getAttribute("vector-effect")).toBe("non-scaling-stroke");
      const dot = svg.querySelector("circle");
      expect(dot.getAttribute("fill")).toBe("#ffffff");
      expect(Number(dot.getAttribute("r"))).toBeLessThan(Number(dot.getAttribute("cx")) / 2);
      expect([dot.getAttribute("cx"), dot.getAttribute("cy")]).toEqual(["14", "14"]); // the middle of the head, not of the box
    }
  });

  it("is drawn at the size of its icon", () => {
    expect(draw(normalPinIcon).querySelector("svg").getAttribute("width")).toBe("28");
    expect(draw(normalPinIcon).querySelector("svg").getAttribute("height")).toBe("36");
    expect(draw(selectedPinIcon).querySelector("svg").getAttribute("width")).toBe("38");
    expect(draw(selectedPinIcon).querySelector("svg").getAttribute("height")).toBe("48");
  });
});

describe("the TIP is on the coordinate (proved with real Leaflet, not assumed)", () => {
  let host;
  let map;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    map = L.map(host).setView([14.225, 121.765], 12);
  });

  afterEach(() => {
    map.remove();
    host.remove();
  });

  // where, inside the icon's box and in pixels, the tip of the drawn teardrop is: the first point of its path, scaled from the drawing to the icon
  function drawnTipInIcon(icon) {
    const holder = document.createElement("div");
    holder.innerHTML = icon.options.html;
    const svg = holder.querySelector("svg");
    const [, x, y] = holder.querySelector("path").getAttribute("d").match(/^M\s*([\d.]+)\s+([\d.]+)/);
    return [(Number(x) * Number(svg.getAttribute("width"))) / PIN_VIEWBOX.width, (Number(y) * Number(svg.getAttribute("height"))) / PIN_VIEWBOX.height];
  }

  function placed(icon, latlng = [14.225, 121.765]) {
    const marker = L.marker(latlng, { icon }).addTo(map);
    return marker._icon;
  }

  it("the path of the drawing begins at its tip, which is at the bottom of the pin: a point, not the middle", () => {
    const holder = document.createElement("div");
    holder.innerHTML = normalPinIcon.options.html;
    const d = holder.querySelector("path").getAttribute("d");
    const [tipX, tipY] = [PIN_TIP.x, PIN_TIP.y];

    expect(d.startsWith(`M${tipX} ${tipY}`)).toBe(true);
    expect(tipY).toBeLessThanOrEqual(PIN_VIEWBOX.height); // inside the drawing's box, at the bottom edge
    expect(tipY).toBeGreaterThan(PIN_VIEWBOX.height / 2);
  });

  it.each([
    ["normal", normalPinIcon, [28, 36]],
    ["selected", selectedPinIcon, [38, 48]],
  ])("%s: the icon's anchor is the drawn tip, so the coordinate falls on the tip", (_name, icon, [width, height]) => {
    const [tipX, tipY] = drawnTipInIcon(icon);
    expect(icon.options.iconAnchor).toEqual([tipX, tipY]);
    expect(icon.options.iconAnchor).toEqual(pinAnchor(icon === selectedPinIcon));

    // and Leaflet really does place the icon so that its anchor point, not its middle, is on the coordinate
    const element = placed(icon);
    expect(parseFloat(element.style.marginLeft)).toBeCloseTo(-tipX, 5);
    expect(parseFloat(element.style.marginTop)).toBeCloseTo(-tipY, 5);
    expect(parseFloat(element.style.width)).toBe(width);
    expect(parseFloat(element.style.height)).toBe(height);
    // not the middle
    expect(Math.abs(parseFloat(element.style.marginTop) + height / 2)).toBeGreaterThan(height / 4);
  });

  it("the point of the icon that Leaflet puts on the coordinate is the tip: its pixel on the map equals the coordinate's own pixel", () => {
    const latlng = [14.2, 121.7];
    const wanted = map.latLngToLayerPoint(latlng);

    for (const icon of [normalPinIcon, selectedPinIcon]) {
      const element = placed(icon, latlng);
      const [tipX, tipY] = drawnTipInIcon(icon);
      const position = L.DomUtil.getPosition(element); // where Leaflet put the icon's top-left corner, before the anchor's margin
      const topLeft = [position.x + parseFloat(element.style.marginLeft), position.y + parseFloat(element.style.marginTop)];

      expect(topLeft[0] + tipX).toBeCloseTo(wanted.x, 3);
      expect(topLeft[1] + tipY).toBeCloseTo(wanted.y, 3);
    }
  });

  it("the selected pin is drawn above a normal pin even when the normal one is further south (lower on the map)", () => {
    const south = L.marker([14.2, 121.7], { icon: normalPinIcon }).addTo(map);
    const northSelected = L.marker([14.21, 121.7], { icon: selectedPinIcon, zIndexOffset: SELECTED_PIN_Z_OFFSET }).addTo(map);
    const northNormal = L.marker([14.21, 121.71], { icon: normalPinIcon }).addTo(map);

    // Leaflet stacks by how low a pin is on the screen, so without the offset the southern pin would cover the northern one
    expect(Number(northNormal._icon.style.zIndex)).toBeLessThan(Number(south._icon.style.zIndex));
    expect(Number(northSelected._icon.style.zIndex)).toBeGreaterThan(Number(south._icon.style.zIndex));
  });
});

describe("the look: shadow, hover", () => {
  it("the pin has a soft shadow under it", () => {
    expect(normalised(".mauban-pin-body").filter).toContain("drop-shadow");
    expect(normalPinIcon.options.html).toContain("mauban-pin-shadow");
    expect(normalised(".mauban-pin-shadow")).toMatchObject({ filter: "blur(2px)" });
  });

  it("when the mouse is over it, it grows a little, smoothly, from its tip so the tip stays on the coordinate", () => {
    expect(normalised(".mauban-pin-icon:hover .mauban-pin-body")).toMatchObject(expectedNorm({ transform: "scale(1.12)" }));
    const body = rule(".mauban-pin-body");
    expect(body.transition).toMatch(/^transform\s+0?\.\d+s/);
    const origin = body["transform-origin"].split(/\s+/);
    expect(origin[0]).toBe("50%");
    expect(parseFloat(origin[1])).toBeGreaterThan(90); // near the bottom: the tip
  });

  it("the ring is soft and white", () => {
    const ring = rule(".mauban-pin-ring");
    expect(ring["border-radius"]).toBe("50%");
    expect(ring.background).toMatch(/rgba\(255,\s*255,\s*255,/);
  });
});
