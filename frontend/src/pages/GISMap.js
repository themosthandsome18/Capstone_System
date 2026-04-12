import { useEffect, useState } from "react";
import { FiMapPin, FiStar } from "react-icons/fi";
import MaubanDestinationMap from "../components/maps/MaubanDestinationMap";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

function GISMap() {
  const { referenceTables } = useTourismData();
  const [selectedDestination, setSelectedDestination] = useState(
    referenceTables.resorts[0] || null
  );

  useEffect(() => {
    if (!selectedDestination && referenceTables.resorts.length) {
      setSelectedDestination(referenceTables.resorts[0]);
    }
  }, [referenceTables.resorts, selectedDestination]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="GIS Map"
        description=""
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_290px]">
        <div className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Interactive Map</p>
            <p className="text-[11px] text-slate-500">Mauban, Quezon</p>
          </div>
          <MaubanDestinationMap
            destinations={referenceTables.resorts}
            selectedDestination={selectedDestination}
            onSelectDestination={setSelectedDestination}
          />
        </div>

        <div className="space-y-3">
          <div className="panel p-3">
            <p className="text-xs font-semibold text-slate-700">Location Details</p>
            <p className="mt-2 text-[11px] text-slate-500">
              Click on a marker to view location details.
            </p>
          </div>

          <div className="panel p-3">
            <p className="text-xs font-semibold text-slate-700">All Locations</p>
            <div className="mt-3 space-y-3">
              {referenceTables.resorts.map((destination) => (
                <button
                  key={destination.resort_id}
                  type="button"
                  onClick={() => setSelectedDestination(destination)}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl px-2 py-2 text-left ${
                    selectedDestination?.resort_id === destination.resort_id
                      ? "bg-[#e0f1f4]"
                      : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-slate-800">
                      {destination.resort_name}
                    </p>
                    <p className="text-[10px] text-slate-500">{destination.type}</p>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500">
                    <FiStar size={10} />
                    <span className="text-[10px] text-slate-600">{destination.tourism_rating}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="panel px-4 py-3">
          <p className="text-[11px] text-slate-500">Total Locations</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{referenceTables.resorts.length}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-[11px] text-slate-500">Beach Destinations</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {referenceTables.resorts.filter((item) => item.type.includes("Beach")).length}
          </p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-[11px] text-slate-500">Island Destinations</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {referenceTables.resorts.filter((item) => item.type.includes("Island")).length}
          </p>
        </div>
        <div className="panel px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Average Rating</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">4.5</p>
            </div>
            <FiMapPin className="text-sky-500" size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default GISMap;
