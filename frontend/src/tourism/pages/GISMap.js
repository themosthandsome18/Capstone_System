import { useEffect, useMemo, useState } from "react";
import { FiLayers, FiMapPin, FiStar } from "react-icons/fi";
import MaubanDestinationMap from "../components/maps/MaubanDestinationMap";
import { useTourismData } from "../context/TourismDataContext";

const OFFICIAL_DESTINATION_LIMIT = 15;

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidMapCoordinates(destination) {
  const lat =
    parseCoordinate(destination.coordinates?.lat) ??
    parseCoordinate(destination.latitude);
  const lng =
    parseCoordinate(destination.coordinates?.lng) ??
    parseCoordinate(destination.longitude);

  return lat !== null && lng !== null && lat >= 13.9 && lat <= 14.4 && lng >= 121.55 && lng <= 122;
}

function isOfficialMapDestination(destination) {
  return (
    hasValidMapCoordinates(destination) &&
    (Boolean(destination.image_key) ||
      Boolean(destination.with_mayors_permit) ||
      Number(destination.resort_id || 0) <= OFFICIAL_DESTINATION_LIMIT)
  );
}

function GISMap() {
  const { referenceTables } = useTourismData();
  const [mapLayer, setMapLayer] = useState("street");
  const mapDestinations = useMemo(
    () => referenceTables.resorts.filter(isOfficialMapDestination),
    [referenceTables.resorts]
  );
  const [selectedDestination, setSelectedDestination] = useState(
    mapDestinations[0] || null
  );
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDestinations = useMemo(() => {
    if (!searchQuery.trim()) return mapDestinations;
    const q = searchQuery.toLowerCase();
    return mapDestinations.filter(
      (d) =>
        d.resort_name?.toLowerCase().includes(q) ||
        d.type?.toLowerCase().includes(q) ||
        d.location?.toLowerCase().includes(q)
    );
  }, [mapDestinations, searchQuery]);

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
          <button
            type="button"
            className={mapLayer === "street" ? "active" : ""}
            onClick={() => setMapLayer("street")}
          >
            <FiLayers size={15} />
            Street
          </button>

          <button
            type="button"
            className={mapLayer === "satellite" ? "active" : ""}
            onClick={() => setMapLayer("satellite")}
          >
            Satellite
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
            mapLayer={mapLayer}
          />
        </section>

        <aside className="gis-side-panel">
          <div className="gis-info-card">
            <h3>Location Details</h3>

            {selectedDestination ? (
              <div className="gis-selected-destination">
                <strong>{selectedDestination.resort_name}</strong>
                <span>{selectedDestination.type}</span>
                <p>{selectedDestination.location}</p>
                <small>
                  <FiMapPin size={11} />
                  {selectedDestination.latitude},{" "}
                  {selectedDestination.longitude}
                </small>
              </div>
            ) : (
              <p>No mapped tourism destination selected.</p>
            )}
          </div>

          <div className="gis-location-list">
            <h3>Mapped Locations</h3>

            <div className="gis-search-box">
              <input
                type="text"
                placeholder="Search locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="gis-search-input"
              />
            </div>

            <div className="gis-location-items">
              {filteredDestinations.length ? (
                filteredDestinations.map((destination) => (
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
                ))
              ) : (
                <p className="gis-empty-note">
                  {searchQuery ? `No results for "${searchQuery}"` : "No tourism destinations with valid coordinates are available."}
                </p>
              )}
            </div>
          </div>

          <div className="gis-heatmap-card">
            <h3>GIS Coverage</h3>
            <p>
              Showing official destinations with verified Mauban coordinates.
              Imported placeholder records are hidden from the map until exact
              coordinates are added.
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
