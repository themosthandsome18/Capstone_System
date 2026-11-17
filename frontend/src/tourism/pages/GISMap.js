import { useEffect, useMemo, useState } from "react";
import { FiLayers, FiMapPin, FiStar } from "react-icons/fi";
import MaubanDestinationMap from "../components/maps/MaubanDestinationMap";
import { useTourismData } from "../context/TourismDataContext";
import { tourismApi } from "../services/tourismApi";

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

// The map asks two things: are the coordinates inside Mauban, and is it not a placeholder (a resort an import made
// up, which carries the middle of the town and is not a place). A photo, a permit or an id number has no part in it.
function isMapDestination(destination) {
  return hasValidMapCoordinates(destination) && !destination.is_placeholder;
}

function GISMap() {
  const { referenceTables } = useTourismData();
  const [mapLayer, setMapLayer] = useState("street");
  const mapDestinations = useMemo(
    () => referenceTables.resorts.filter(isMapDestination),
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

  // The four figures below come from the server as they are; nothing here adds them up.
  const [figures, setFigures] = useState(null);

  useEffect(() => {
    let current = true;
    tourismApi
      .getDestinationFigures()
      .then((payload) => current && setFigures(payload))
      .catch(() => current && setFigures(null));
    return () => {
      current = false;
    };
  }, []);

  const mostVisited = figures?.mostVisited;
  const leastVisited = figures?.leastVisited;
  const sharePercent = figures?.mostVisitedSharePercent;
  const withNone = figures?.placesWithNoArrivals || 0;

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
              Showing every destination that has coordinates inside Mauban.
              Placeholder records made by an import are hidden from the map
              until an admin gives them exact coordinates.
            </p>
          </div>
        </aside>
      </div>

      <div className="gis-bottom-stats">
        <StatBox
          title="Active in the app"
          value={
            figures ? (
              <>
                {figures.activeCount}
                <span className="gis-stat-of"> of {figures.totalCount}</span>
              </>
            ) : (
              "—"
            )
          }
        />
        <StatBox
          title="Arrivals this year"
          value={figures ? figures.arrivalsThisYear : "—"}
          note={
            sharePercent === null || sharePercent === undefined
              ? null
              : `the busiest place has ${sharePercent}% of them`
          }
        />
        <StatBox
          title="Most visited this year"
          value={!figures ? "—" : mostVisited ? mostVisited.name : "None yet"}
          isName={Boolean(figures)}
          note={mostVisited ? `${mostVisited.arrivals} arrivals` : null}
        />
        <StatBox
          title="Least visited this year"
          value={!figures ? "—" : leastVisited ? leastVisited.name : "None yet"}
          isName={Boolean(figures)}
          note={leastVisited ? `${leastVisited.arrivals} arrivals` : null}
          extraNote={
            figures && withNone > 0
              ? `${withNone} ${withNone === 1 ? "place has" : "places have"} none yet`
              : null
          }
        />
      </div>
    </div>
  );
}

function StatBox({ title, value, note, extraNote, isName = false }) {
  return (
    <div className="gis-stat-box">
      <p>{title}</p>
      {isName ? (
        <h2 className="gis-stat-name" title={value}>
          {value}
        </h2>
      ) : (
        <h2>{value}</h2>
      )}
      {note ? <p className="gis-stat-note">{note}</p> : null}
      {extraNote ? <p className="gis-stat-note">{extraNote}</p> : null}
    </div>
  );
}

export default GISMap;
