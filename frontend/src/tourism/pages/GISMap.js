import { useEffect, useMemo, useState } from "react";
import { FiLayers, FiStar } from "react-icons/fi";
import MaubanDestinationMap from "../components/maps/MaubanDestinationMap";
import { useTourismData } from "../context/TourismDataContext";

const OFFICIAL_DESTINATION_LIMIT = 6;

function isOfficialMapDestination(destination) {
  return (
    Boolean(destination.image_key) ||
    Boolean(destination.with_mayors_permit) ||
    Number(destination.resort_id || 0) <= OFFICIAL_DESTINATION_LIMIT
  );
}

function GISMap() {
  const { referenceTables } = useTourismData();
  const mapDestinations = useMemo(
    () => referenceTables.resorts.filter(isOfficialMapDestination),
    [referenceTables.resorts]
  );
  const [selectedDestination, setSelectedDestination] = useState(
    mapDestinations[0] || null
  );

  useEffect(() => {
    const selectedStillVisible = mapDestinations.some(
      (destination) => destination.resort_id === selectedDestination?.resort_id
    );

    if ((!selectedDestination || !selectedStillVisible) && mapDestinations.length) {
      setSelectedDestination(mapDestinations[0]);
    }
  }, [mapDestinations, selectedDestination]);

  const totalLocations = mapDestinations.length;
  const beachCount = mapDestinations.filter((item) =>
    item.type.includes("Beach")
  ).length;
  const islandCount = mapDestinations.filter((item) =>
    item.type.includes("Island")
  ).length;
  const averageRating = totalLocations
    ? (
        mapDestinations.reduce(
          (sum, item) => sum + Number(item.tourism_rating || 0),
          0
        ) / totalLocations
      ).toFixed(1)
    : "0.0";

  return (
    <div className="gis-page">
      <div className="gis-header">
        <div>
          <h1>GIS Map</h1>
          <p>Tourist destinations across Mauban, Quezon</p>
        </div>

        <div className="gis-actions">
          <button type="button">
            <FiLayers size={15} />
            Layers
          </button>

          <button type="button" className="active">
            Heatmap
          </button>
        </div>
      </div>

      <div className="gis-main-grid">
        <section className="gis-map-card">
          <div className="gis-map-title">
            <h3>Interactive Map</h3>
            <p>Mauban, Quezon</p>
          </div>

          <MaubanDestinationMap
            destinations={mapDestinations}
            selectedDestination={selectedDestination}
            onSelectDestination={setSelectedDestination}
          />
        </section>

        <aside className="gis-side-panel">
          <div className="gis-info-card">
            <h3>Location Details</h3>
            <p>Click on a marker to view location details.</p>
          </div>

          <div className="gis-location-list">
            <h3>All Locations</h3>

            <div className="gis-location-items">
              {mapDestinations.map((destination) => (
                <button
                  key={destination.resort_id}
                  type="button"
                  onClick={() => setSelectedDestination(destination)}
                  className={`gis-location-item ${
                    selectedDestination?.resort_id === destination.resort_id
                      ? "selected"
                      : ""
                  }`}
                >
                  <div>
                    <p>{destination.resort_name}</p>
                    <span>{destination.type}</span>
                  </div>

                  <div className="gis-rating">
                    <FiStar size={11} />
                    <span>{destination.tourism_rating}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="gis-heatmap-card">
            <h3>Heatmap Active</h3>
            <p>
              Showing tourist density across Mauban barangays based on the last
              30 days of arrivals.
            </p>
          </div>
        </aside>
      </div>

      <div className="gis-bottom-stats">
        <StatBox title="Total Locations" value={totalLocations} />
        <StatBox title="Beach Destinations" value={beachCount} />
        <StatBox title="Island Destinations" value={islandCount} />
        <StatBox title="Average Rating" value={averageRating} />
      </div>
    </div>
  );
}

function StatBox({ title, value }) {
  return (
    <div className="gis-stat-box">
      <p>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

export default GISMap;
