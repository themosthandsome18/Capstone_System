import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { FiLayers } from "react-icons/fi";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const establishments = [
  { name: "Dela Cruz, Coedy", position: [14.1852, 121.7285], status: "good", barangay: "Poblacion" },
  { name: "Ralph Richmond Amarillo", position: [14.1884, 121.7318], status: "good", barangay: "Poblacion" },
  { name: "John Joseph Israel", position: [14.1816, 121.7359], status: "violation", barangay: "San Isidro" },
  { name: "Nerjie Mecantina", position: [14.1921, 121.7247], status: "upcoming", barangay: "San Roque" },
  { name: "Emman Aviles", position: [14.1779, 121.7298], status: "violation", barangay: "Malabanan" },
  { name: "Quert Lalisan", position: [14.1897, 121.7384], status: "good", barangay: "San Isidro" },
  { name: "Carabido Carl Kien", position: [14.1745, 121.7336], status: "upcoming", barangay: "Bagong Pook" },
  { name: "Mark Ernest Garay", position: [14.1838, 121.7421], status: "upcoming", barangay: "Poblacion" },
  { name: "John Paul Naynes", position: [14.1794, 121.7229], status: "violation", barangay: "San Roque" },
  { name: "Jeremy Brian", position: [14.1946, 121.7365], status: "violation", barangay: "Malabanan" },
  { name: "Jessie Monpero", position: [14.1768, 121.7408], status: "upcoming", barangay: "Bagong Pook" },
];

function getColor(status) {
  if (status === "good") return "#0f7a45";
  if (status === "upcoming") return "#f5c400";
  if (status === "violation") return "#ef2222";
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
      border:2px solid transparent;
      box-shadow:0 2px 6px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function SanitaryGISMap() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [barangayFilter, setBarangayFilter] = useState("All Barangays");

  const filteredEstablishments = useMemo(() => {
    return establishments.filter((item) => {
      const matchesStatus =
        statusFilter === "all" ? true : item.status === statusFilter;

      const matchesBarangay =
        barangayFilter === "All Barangays"
          ? true
          : item.barangay === barangayFilter;

      return matchesStatus && matchesBarangay;
    });
  }, [statusFilter, barangayFilter]);

  return (
    <div className="sanitary-gis-page">
      <div className="sanitary-page-header">
        <h2>Sanitary GIS Map</h2>
        <p>Geographic visualization of inspection locations and sanitation risk areas</p>
      </div>

      <div className="gis-toolbar">
        <div className="gis-left-controls">
          <label>Legend:</label>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Establishments only</option>
            <option value="good">Low Risk</option>
            <option value="upcoming">Moderate</option>
            <option value="violation">High Risk</option>
          </select>

          <label>Barangay:</label>

          <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
            <option>All Barangays</option>
            <option>Poblacion</option>
            <option>San Isidro</option>
            <option>San Roque</option>
            <option>Malabanan</option>
            <option>Bagong Pook</option>
          </select>
        </div>

        <div className="gis-legend">
          <span><i className="low" /> Low Risk</span>
          <span><i className="moderate" /> Moderate</span>
          <span><i className="high" /> High Risk</span>
        </div>
      </div>

      <div className="gis-layout">
        <div className="gis-map">
        <MapContainer
          center={[14.185, 121.731]}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          zoomControl
        >
            <TileLayer
              attribution=""
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredEstablishments.map((item) => (
              <Marker
                key={item.name}
                position={item.position}
                icon={createIcon(getColor(item.status))}
              >
                <Popup>
                  <strong>{item.name}</strong>
                  <br />
                  Barangay: {item.barangay}
                  <br />
                  Status: {item.status}
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <button type="button" className="gis-layer-btn">
            <FiLayers />
          </button>
        </div>

        <aside className="gis-side">
          <h3>Mapped Establishments</h3>

          <div className="gis-list">
            {filteredEstablishments.map((item) => (
              <div key={item.name} className="gis-item">
                <span
                  className="dot"
                  style={{ background: getColor(item.status) }}
                />
                <strong>{item.name}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default SanitaryGISMap;