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
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  satellite: {
    attribution:
      "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
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
  if (type.includes("Island")) {
    return "#53c7be";
  }

  if (type.includes("Beach")) {
    return "#2f9c94";
  }

  if (type.includes("Cave")) {
    return "#5b8df0";
  }

  if (type.includes("Mountain") || type.includes("Eco Adventure")) {
    return "#f59e0b";
  }

  if (type.includes("Eco")) {
    return "#5b8df0";
  }

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
      <div className="absolute left-3 top-3 z-[500] rounded-[6px] bg-white/95 px-3 py-3 shadow-md">
        <p className="mb-2 text-xs font-semibold text-slate-700">Legend</p>

        <div className="space-y-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#2f9c94]" />
            Beach
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#53c7be]" />
            Island
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#5b8df0]" />
            Eco / Cave
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#f59e0b]" />
            Mountain
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ef4444]" />
            Landmark
          </div>
        </div>
      </div>

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
              <Popup>
                <div className="min-w-[180px]">
                  <p className="font-semibold text-slate-900">
                    {destination.resort_name}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {destination.location}
                  </p>

                  <p className="mt-2 text-[11px] text-slate-500">
                    Lat: {destination.mapCoordinates.lat}, Lng:{" "}
                    {destination.mapCoordinates.lng}
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
