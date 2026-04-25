import { useEffect, useState } from "react";
import { FiLayers, FiMapPin, FiStar } from "react-icons/fi";
import MaubanDestinationMap from "../../components/maps/MaubanDestinationMap";
import { useTourismData } from "../../context/TourismDataContext";

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

  const totalLocations = referenceTables.resorts.length;
  const beachCount = referenceTables.resorts.filter((item) =>
    item.type.includes("Beach")
  ).length;
  const islandCount = referenceTables.resorts.filter((item) =>
    item.type.includes("Island")
  ).length;

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
            destinations={referenceTables.resorts}
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
              {referenceTables.resorts.map((destination) => (
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
        <StatBox title="Average Rating" value="4.5" />
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