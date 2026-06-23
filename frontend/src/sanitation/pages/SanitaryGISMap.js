import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";
import { FiLayers } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";
import HeatmapLayer from "../components/HeatmapLayer";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const maubanCenter = [14.185, 121.731];

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

const establishmentStatusFilters = [
  { value: "all", label: "All Establishments" },
  { value: "good_standing", label: "Good Standing" },
  { value: "upcoming", label: "Upcoming" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
  { value: "no_permit", label: "No Permit" },
];

const householdStatusFilters = [
  { value: "all", label: "All Households" },
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
];

function SanitaryGISMap() {
  const { establishments, householdRecords, loading, error } =
    useSanitationData();

  const [mapMode, setMapMode] = useState("establishments");
  const [mapLayer, setMapLayer] = useState("street");
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("All Barangays");
  const [selectedItemId, setSelectedItemId] = useState(null);

  const isHouseholdMode = mapMode === "households";

  const sourceItems = useMemo(() => {
    const source = isHouseholdMode ? householdRecords : establishments;

    return source.map((item) => ({
      ...item,
      position: getMapPosition(item),
    }));
  }, [establishments, householdRecords, isHouseholdMode]);

  const barangays = useMemo(() => {
    const uniqueBarangays = new Set(
      sourceItems.map((item) => item.barangay).filter(Boolean)
    );

    return ["All Barangays", ...Array.from(uniqueBarangays).sort()];
  }, [sourceItems]);

  const filteredSourceItems = useMemo(() => {
    return sourceItems.filter((item) => {
      const statusValue = isHouseholdMode
        ? item.status
        : item.compliance_status;

      const matchesStatus =
        statusFilter === "all" || statusValue === statusFilter;

      const matchesBarangay =
        barangayFilter === "All Barangays" ||
        item.barangay === barangayFilter;

      return matchesStatus && matchesBarangay;
    });
  }, [sourceItems, statusFilter, barangayFilter, isHouseholdMode]);

  const filteredItems = useMemo(
    () => filteredSourceItems.filter((item) => item.position),
    [filteredSourceItems]
  );
  const unmappedItems = useMemo(
    () => filteredSourceItems.filter((item) => !item.position),
    [filteredSourceItems]
  );
  const mappedTotal = sourceItems.filter((item) => item.position).length;
  const unmappedTotal = sourceItems.length - mappedTotal;
  const tileLayer = tileLayers[mapLayer] || tileLayers.street;

  const selectedItem =
    filteredItems.find((item) => item.id === selectedItemId) ||
    filteredItems[0];

  function handleModeChange(nextMode) {
    setMapMode(nextMode);
    setStatusFilter("all");
    setBarangayFilter("All Barangays");
    setSelectedItemId(null);
  }

  if (loading) {
    return <div className="sanitary-gis-page">Loading GIS map...</div>;
  }

  return (
    <div className="sanitary-gis-page">
      <div className="sanitary-page-header">
        <h2>Sanitary GIS Map</h2>
        <p>
          Geographic visualization of establishment and household sanitation
          status
        </p>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="gis-mode-toggle">
        <button
          type="button"
          className={mapMode === "establishments" ? "active" : ""}
          onClick={() => handleModeChange("establishments")}
        >
          Establishments
        </button>

        <button
          type="button"
          className={mapMode === "households" ? "active" : ""}
          onClick={() => handleModeChange("households")}
        >
          Households
        </button>
      </div>

      <div className="gis-toolbar">
        <div className="gis-left-controls">
          <label>Status:</label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {(isHouseholdMode
              ? householdStatusFilters
              : establishmentStatusFilters
            ).map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <label>Barangay:</label>

          <select
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
          >
            {barangays.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>

        <div className="gis-layer-toggle">
          <button
            type="button"
            className={mapLayer === "street" ? "active" : ""}
            onClick={() => setMapLayer("street")}
          >
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

        <div className="gis-legend">
          <span>
            <i className="low" /> Low Risk
          </span>

          <span>
            <i className="moderate" /> Medium Risk
          </span>

          <span>
            <i className="high" /> High Risk
          </span>
        </div>
      </div>

      <div className="gis-map-summary-row">
        <MapSummaryCard label="Mapped" value={mappedTotal} />
        <MapSummaryCard label="Unmapped" value={unmappedTotal} />
        <MapSummaryCard label="Filtered Pins" value={filteredItems.length} />
        <MapSummaryCard label="Filtered Unmapped" value={unmappedItems.length} />
      </div>

      <div className="gis-layout">
        <div className="gis-map">
          <MapContainer
            center={maubanCenter}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer
              attribution={tileLayer.attribution}
              url={tileLayer.url}
            />

            <FitMapToItems items={filteredItems} />

            <HeatmapLayer items={filteredItems} />
          </MapContainer>

          {!filteredItems.length ? (
            <div className="gis-map-empty-overlay">
              No mapped coordinates match the current filters.
            </div>
          ) : null}

          <button
            type="button"
            className="gis-layer-btn"
            aria-label="Toggle map layer"
            title="Toggle map layer"
            onClick={() =>
              setMapLayer((current) =>
                current === "street" ? "satellite" : "street"
              )
            }
          >
            <FiLayers />
          </button>
        </div>

        <aside className="gis-side">
          <h3>
            {isHouseholdMode ? "Mapped Households" : "Mapped Establishments"}
          </h3>

          {selectedItem ? (
            <div className="gis-selected-card">
              <strong>
                {isHouseholdMode
                  ? selectedItem.household_head
                  : selectedItem.business_name}
              </strong>

              <p>
                {isHouseholdMode
                  ? `${selectedItem.household_code} | ${selectedItem.barangay}`
                  : `${selectedItem.business_type_name} | ${selectedItem.barangay}`}
              </p>

              <span
                className={`status-pill ${statusClass(
                  isHouseholdMode
                    ? selectedItem.status_label
                    : selectedItem.compliance_status_label
                )}`}
              >
                {isHouseholdMode
                  ? selectedItem.status_label
                  : selectedItem.compliance_status_label}
              </span>
            </div>
          ) : null}

          <div className="gis-list">
            {filteredItems.length ? (
              filteredItems.map((item) => {
                const markerColor = getRiskColor(item);

                return (
                  <button
                    key={`${mapMode}-list-${item.id}`}
                    type="button"
                    className={`gis-item ${
                      selectedItem?.id === item.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <span
                      className="dot"
                      style={{ background: markerColor }}
                    />

                    <div>
                      <strong>
                        {isHouseholdMode
                          ? item.household_head
                          : item.business_name}
                      </strong>

                      <small>
                        {isHouseholdMode
                          ? `${item.household_code} | ${item.barangay}`
                          : `${item.business_type_name} | ${item.barangay}`}
                      </small>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="gis-empty">
                No mapped {isHouseholdMode ? "households" : "establishments"}{" "}
                found.
              </p>
            )}
          </div>

          {unmappedItems.length ? (
            <div className="gis-unmapped-panel">
              <h4>Unmapped Records</h4>
              <p>
                These records match the filters but need latitude and longitude.
              </p>

              {unmappedItems.slice(0, 8).map((item) => (
                <div key={`${mapMode}-unmapped-${item.id}`}>
                  <strong>
                    {isHouseholdMode
                      ? item.household_head
                      : item.business_name}
                  </strong>
                  <small>{item.barangay || "No barangay"}</small>
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MapSummaryCard({ label, value }) {
  return (
    <div className="gis-map-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}



function FitMapToItems({ items }) {
  const map = useMap();

  useEffect(() => {
    if (!items.length) {
      map.setView(maubanCenter, 14);
      return;
    }

    if (items.length === 1) {
      map.setView(items[0].position, 15);
      return;
    }

    const bounds = items.map((item) => item.position);
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [items, map]);

  return null;
}

function getRiskColor(item) {
  const score = Number(item.risk_score || 0);

  if (score >= 70) return "#ef2222";
  if (score >= 35) return "#f5c400";
  return "#0f7a45";
}



function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMapPosition(item) {
  const lat =
    parseCoordinate(item.latitude) ?? parseCoordinate(item.coordinates?.lat);
  const lng =
    parseCoordinate(item.longitude) ?? parseCoordinate(item.coordinates?.lng);

  if (lat === null || lng === null) {
    return null;
  }

  if (Math.abs(lat) < 0.001 || Math.abs(lng) < 0.001) {
    return null;
  }

  if (lat < 13.9 || lat > 14.4 || lng < 121.55 || lng > 122) {
    return null;
  }

  return [lat, lng];
}

export default SanitaryGISMap;
