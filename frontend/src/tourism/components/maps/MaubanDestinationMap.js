import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

const MAUBAN_TOURISM_CENTER = [14.225, 121.765];
const DEFAULT_ZOOM = 11;

const tileLayers = {
  street: {
    attribution:
      '&copy; <a href="https://maps.google.com">Google Maps</a>',
    url: "http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
  },
  satellite: {
    attribution:
      '&copy; <a href="https://maps.google.com">Google Maps Satellite</a>',
    url: "http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
  },
};

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLikelyMaubanCoordinate(lat, lng) {
  return lat >= 13.9 && lat <= 14.4 && lng >= 121.55 && lng <= 122;
}

function getDestinationCoordinates(destination) {
  const coordinateLat = parseCoordinate(destination.coordinates?.lat);
  const coordinateLng = parseCoordinate(destination.coordinates?.lng);
  const lat = coordinateLat ?? parseCoordinate(destination.latitude);
  const lng = coordinateLng ?? parseCoordinate(destination.longitude);

  if (lat === null || lng === null || !isLikelyMaubanCoordinate(lat, lng)) {
    return null;
  }

  return { lat, lng };
}

function getMarkerColor(type = "") {
  return "#ef4444";
}

function FitMapToDestinations({ destinations }) {
  const map = useMap();

  useEffect(() => {
    if (!destinations.length) {
      map.setView(MAUBAN_TOURISM_CENTER, DEFAULT_ZOOM);
      return;
    }

    if (destinations.length === 1) {
      const coordinates = destinations[0].mapCoordinates;
      map.setView([coordinates.lat, coordinates.lng], 14);
      return;
    }

    const bounds = destinations.map((destination) => [
      destination.mapCoordinates.lat,
      destination.mapCoordinates.lng,
    ]);

    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 12,
    });
  }, [destinations, map]);

  return null;
}

function FocusSelectedDestination({ selectedDestination }) {
  const map = useMap();
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const coordinates = selectedDestination
      ? getDestinationCoordinates(selectedDestination)
      : null;

    if (coordinates) {
      map.setView([coordinates.lat, coordinates.lng], Math.max(map.getZoom(), 14), {
        animate: true,
      });
    }
  }, [map, selectedDestination]);

  return null;
}

function MaubanDestinationMap({
  destinations,
  selectedDestination,
  onSelectDestination,
  mapLayer = "street",
}) {
  const markerRefs = useRef({});

  useEffect(() => {
    if (selectedDestination?.resort_id && markerRefs.current[selectedDestination.resort_id]) {
      markerRefs.current[selectedDestination.resort_id].openPopup();
    }
  }, [selectedDestination]);
  const mappedDestinations = useMemo(() => {
    return destinations
      .map((destination) => ({
        ...destination,
        mapCoordinates: getDestinationCoordinates(destination),
      }))
      .filter((destination) => destination.mapCoordinates);
  }, [destinations]);
  const tileLayer = tileLayers[mapLayer] || tileLayers.street;

  return (
    <div className="mauban-map-frame">


      <MapContainer
        center={MAUBAN_TOURISM_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution={tileLayer.attribution}
          url={tileLayer.url}
        />

        <FitMapToDestinations destinations={mappedDestinations} />
        <FocusSelectedDestination selectedDestination={selectedDestination} />

        {mappedDestinations.map((destination) => {
          const active =
            destination.resort_id === selectedDestination?.resort_id;

          const markerColor = getMarkerColor(destination.type);

          return (
            <CircleMarker
              key={destination.resort_id}
              ref={(ref) => {
                if (ref) {
                  markerRefs.current[destination.resort_id] = ref;
                }
              }}
              center={[
                destination.mapCoordinates.lat,
                destination.mapCoordinates.lng,
              ]}
              radius={active ? 10 : 7}
              pathOptions={{
                color: active ? "#ffffff" : markerColor,
                fillColor: markerColor,
                fillOpacity: 0.9,
                weight: active ? 4 : 2,
              }}
              eventHandlers={{
                click: () => onSelectDestination(destination),
              }}
            >
              <Popup minWidth={220} maxWidth={260}>
                <div style={{ padding: "2px 0" }}>
                  {destination.image && (
                    <img
                      src={destination.image}
                      alt={destination.resort_name}
                      style={{
                        width: "100%",
                        height: "110px",
                        objectFit: "cover",
                        borderRadius: "6px",
                        marginBottom: "8px",
                        display: "block",
                      }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  <p style={{ fontWeight: 700, fontSize: "13px", color: "#111827", margin: "0 0 4px" }}>
                    {destination.resort_name}
                  </p>
                  <span style={{
                    display: "inline-block",
                    background: "#dcfce7",
                    color: "#16a34a",
                    fontSize: "10px",
                    fontWeight: 600,
                    borderRadius: "999px",
                    padding: "1px 8px",
                    marginBottom: "6px",
                  }}>
                    {destination.type}
                  </span>
                  {destination.tourism_rating && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "4px" }}>
                      {[1,2,3,4,5].map((s) => (
                        <span key={s} style={{ color: Number(destination.tourism_rating) >= s ? "#f59e0b" : "#d1d5db", fontSize: "12px" }}>★</span>
                      ))}
                      <span style={{ fontSize: "11px", color: "#6b7280", marginLeft: "2px" }}>{destination.tourism_rating}</span>
                    </div>
                  )}
                  <p style={{ fontSize: "11px", color: "#6b7280", margin: "0" }}>
                    📍 {destination.location}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default MaubanDestinationMap;
