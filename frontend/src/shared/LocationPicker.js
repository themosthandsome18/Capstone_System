import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "./LocationPicker.css";

const DEFAULT_CENTER = [14.185, 121.731];
const DEFAULT_ZOOM = 13;

const pickerIcon = new L.DivIcon({
  className: "location-picker-marker",
  html: '<div class="location-picker-marker-dot"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidCoordinate(lat, lng) {
  return lat >= 13.9 && lat <= 14.4 && lng >= 121.55 && lng <= 122;
}

function formatCoordinate(value) {
  return Number(value).toFixed(6);
}

function getPosition(latitude, longitude) {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);

  if (lat === null || lng === null || !isValidCoordinate(lat, lng)) {
    return null;
  }

  return [lat, lng];
}

function parseMapsInput(value = "") {
  const text = value.trim();

  if (!text) {
    return null;
  }

  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return [Number(atMatch[1]), Number(atMatch[2])];
  }

  const placeMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (placeMatch) {
    return [Number(placeMatch[1]), Number(placeMatch[2])];
  }

  const queryMatch = text.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (queryMatch) {
    return [Number(queryMatch[1]), Number(queryMatch[2])];
  }

  const plainMatch = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (plainMatch) {
    return [Number(plainMatch[1]), Number(plainMatch[2])];
  }

  return null;
}

function MapClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function RecenterMap({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [map, position]);

  return null;
}

function LocationPicker({ latitude, longitude, onChange, label = "Map Pin" }) {
  const [mapsInput, setMapsInput] = useState("");
  const [error, setError] = useState("");
  const position = useMemo(() => getPosition(latitude, longitude), [latitude, longitude]);
  const center = position || DEFAULT_CENTER;
  const mapsHref = position
    ? `https://www.google.com/maps/search/?api=1&query=${position[0]},${position[1]}`
    : "";

  function updateCoordinates(lat, lng) {
    if (!isValidCoordinate(lat, lng)) {
      setError("Coordinates must be within Mauban, Quezon.");
      return;
    }

    setError("");
    onChange("latitude", formatCoordinate(lat));
    onChange("longitude", formatCoordinate(lng));
  }

  function applyMapsInput() {
    const parsed = parseMapsInput(mapsInput);

    if (!parsed || !isValidCoordinate(parsed[0], parsed[1])) {
      setError("Paste a valid Google Maps URL or lat,lng near Mauban.");
      return;
    }

    updateCoordinates(parsed[0], parsed[1]);
  }

  return (
    <div className="location-picker">
      <div className="location-picker-header">
        <div>
          <span>{label}</span>
          <small>
            {position
              ? `${formatCoordinate(position[0])}, ${formatCoordinate(position[1])}`
              : "No valid coordinates selected"}
          </small>
        </div>

        {mapsHref ? (
          <a
            className="location-picker-link"
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
          >
            Open Google Maps
          </a>
        ) : null}
      </div>

      <div className="location-picker-search">
        <input
          type="text"
          value={mapsInput}
          placeholder="Paste Google Maps URL or 14.185000,121.731000"
          onChange={(event) => setMapsInput(event.target.value)}
        />
        <button type="button" onClick={applyMapsInput}>
          Apply Pin
        </button>
      </div>

      {error ? <p className="location-picker-error">{error}</p> : null}

      <div className="location-picker-map">
        <MapContainer center={center} zoom={position ? 15 : DEFAULT_ZOOM} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onPick={updateCoordinates} />
          <RecenterMap position={position} />

          {position ? (
            <Marker
              draggable
              icon={pickerIcon}
              position={position}
              eventHandlers={{
                dragend(event) {
                  const next = event.target.getLatLng();
                  updateCoordinates(next.lat, next.lng);
                },
              }}
            />
          ) : null}
        </MapContainer>
      </div>
    </div>
  );
}

export default LocationPicker;
