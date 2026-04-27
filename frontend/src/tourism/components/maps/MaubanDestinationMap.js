import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

const maubanCenter = [13.9665, 121.746];

function FitMapToDestinations({ destinations }) {
  const map = useMap();

  useEffect(() => {
    if (!destinations.length) {
      map.setView(maubanCenter, 12);
      return;
    }

    if (destinations.length === 1) {
      const [destination] = destinations;
      map.setView([destination.coordinates.lat, destination.coordinates.lng], 14);
      return;
    }

    const bounds = destinations.map((destination) => [
      destination.coordinates.lat,
      destination.coordinates.lng,
    ]);

    map.fitBounds(bounds, { padding: [36, 36] });
  }, [destinations, map]);

  return null;
}

function MaubanDestinationMap({ destinations, selectedDestination, onSelectDestination }) {
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
            Cave
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

      <MapContainer center={maubanCenter} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapToDestinations destinations={destinations} />

        {destinations.map((destination) => {
          const active = destination.resort_id === selectedDestination?.resort_id;
          const markerColor = destination.type.includes("Island")
            ? "#53c7be"
            : destination.type.includes("Beach")
            ? "#2f9c94"
            : destination.type.includes("Eco")
            ? "#5b8df0"
            : destination.type.includes("Mountain")
            ? "#f59e0b"
            : "#ef4444";

          return (
            <CircleMarker
              key={destination.resort_id}
              center={[destination.coordinates.lat, destination.coordinates.lng]}
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
                  <p className="font-semibold text-slate-900">{destination.resort_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{destination.location}</p>
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
