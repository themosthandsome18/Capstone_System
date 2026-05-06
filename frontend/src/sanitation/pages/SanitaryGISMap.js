import { useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { FiLayers } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("All Barangays");
  const [selectedItemId, setSelectedItemId] = useState(null);

  const isHouseholdMode = mapMode === "households";

  const mappedItems = useMemo(() => {
    const source = isHouseholdMode ? householdRecords : establishments;

    return source
      .filter((item) => item.latitude && item.longitude)
      .map((item) => ({
        ...item,
        position: [Number(item.latitude), Number(item.longitude)],
      }));
  }, [establishments, householdRecords, isHouseholdMode]);

  const barangays = useMemo(() => {
    const uniqueBarangays = new Set(
      mappedItems.map((item) => item.barangay).filter(Boolean)
    );

    return ["All Barangays", ...Array.from(uniqueBarangays).sort()];
  }, [mappedItems]);

  const filteredItems = useMemo(() => {
    return mappedItems.filter((item) => {
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
  }, [mappedItems, statusFilter, barangayFilter, isHouseholdMode]);

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

        <div className="gis-legend">
          <span>
            <i className="low" /> Good Standing
          </span>

          {!isHouseholdMode ? (
            <span>
              <i className="moderate" /> Upcoming
            </span>
          ) : null}

          <span>
            <i className="completion" /> For Completion
          </span>

          <span>
            <i className="high" /> Violation
          </span>

          {!isHouseholdMode ? (
            <span>
              <i className="no-permit" /> No Permit
            </span>
          ) : null}
        </div>
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
              attribution=""
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitMapToItems items={filteredItems} />

            {filteredItems.map((item) => {
              const statusValue = isHouseholdMode
                ? item.status
                : item.compliance_status;

              return (
                <Marker
                  key={`${mapMode}-${item.id}`}
                  position={item.position}
                  icon={createIcon(getColor(statusValue))}
                  eventHandlers={{
                    click: () => setSelectedItemId(item.id),
                  }}
                >
                  <Popup>
                    {isHouseholdMode ? (
                      <HouseholdPopup item={item} />
                    ) : (
                      <EstablishmentPopup item={item} />
                    )}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          <button type="button" className="gis-layer-btn">
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
                  ? `${selectedItem.household_code} • ${selectedItem.barangay}`
                  : `${selectedItem.business_type_name} • ${selectedItem.barangay}`}
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
                const statusValue = isHouseholdMode
                  ? item.status
                  : item.compliance_status;

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
                      style={{ background: getColor(statusValue) }}
                    />

                    <div>
                      <strong>
                        {isHouseholdMode
                          ? item.household_head
                          : item.business_name}
                      </strong>

                      <small>
                        {isHouseholdMode
                          ? `${item.household_code} • ${item.barangay}`
                          : `${item.business_type_name} • ${item.barangay}`}
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
        </aside>
      </div>
    </div>
  );
}

function EstablishmentPopup({ item }) {
  return (
    <div className="gis-popup">
      <strong>{item.business_name}</strong>
      <br />
      Owner: {item.owner_name}
      <br />
      Type: {item.business_type_name}
      <br />
      Barangay: {item.barangay}
      <br />
      Status: {item.compliance_status_label}
    </div>
  );
}

function HouseholdPopup({ item }) {
  return (
    <div className="gis-popup">
      <strong>{item.household_head}</strong>
      <br />
      Code: {item.household_code}
      <br />
      Barangay: {item.barangay}
      <br />
      Toilet: {item.toilet_type_label}
      <br />
      Water: {item.water_level_label}
      <br />
      Status: {item.status_label}
    </div>
  );
}

function FitMapToItems({ items }) {
  const map = useMap();

  useMemo(() => {
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

function getColor(status) {
  if (status === "good_standing") return "#0f7a45";
  if (status === "upcoming") return "#f5c400";
  if (status === "for_completion") return "#ff8b21";
  if (status === "violation") return "#ef2222";
  if (status === "no_permit") return "#6b7280";

  return "#999";
}

function createIcon(color) {
  return new L.DivIcon({
    className: "custom-marker",
    html: `<div style="
      background:${color};
      width:18px;
      height:18px;
      border-radius:50%;
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default SanitaryGISMap;