import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useState } from "react";

/* Fix marker icon issue */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

/* Custom colored markers */
const createIcon = (color) =>
  new L.DivIcon({
    className: "custom-marker",
    html: `<div style="
      background:${color};
      width:14px;
      height:14px;
      border-radius:50%;
      border:2px solid white;
      box-shadow:0 0 5px rgba(0,0,0,0.3);
    "></div>`,
  });

/* Sample data (replace later with backend) */
const establishments = [
  {
    name: "Delacruz Household",
    position: [13.958, 121.730],
    status: "good",
  },
  {
    name: "Ralph Amarillo",
    position: [13.955, 121.735],
    status: "good",
  },
  {
    name: "John Joseph Israel",
    position: [13.960, 121.740],
    status: "violation",
  },
  {
    name: "Nerjie Mecantina",
    position: [13.954, 121.728],
    status: "upcoming",
  },
  {
    name: "Emman Aviles",
    position: [13.952, 121.742],
    status: "violation",
  },
];

/* Color mapping */
const getColor = (status) => {
  if (status === "good") return "#22c55e"; // green
  if (status === "upcoming") return "#facc15"; // yellow
  if (status === "violation") return "#ef4444"; // red
  return "#999";
};

function SanitaryGISMap() {
  const [filter, setFilter] = useState("all");

  return (
    <div className="sanitary-gis-page">

      {/* HEADER */}
      <div className="sanitary-page-header">
        <h2>Sanitary GIS Map</h2>
        <p>Geographic visualization of sanitation risk and compliance</p>
      </div>

      {/* FILTER BAR */}
      <div className="gis-toolbar">
        <select onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="good">Good Standing</option>
          <option value="upcoming">Upcoming</option>
          <option value="violation">Violation</option>
        </select>

        <select>
          <option>All Barangays</option>
          <option>Poblacion</option>
          <option>San Isidro</option>
          <option>San Roque</option>
        </select>

        <div className="gis-legend">
          <span><i style={{ background: "#22c55e" }} /> Low Risk</span>
          <span><i style={{ background: "#facc15" }} /> Moderate</span>
          <span><i style={{ background: "#ef4444" }} /> High Risk</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="gis-layout">

        {/* MAP */}
        <div className="gis-map">
          <MapContainer
            center={[13.955, 121.735]}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {establishments
              .filter((item) =>
                filter === "all" ? true : item.status === filter
              )
              .map((item, index) => (
                <Marker
                  key={index}
                  position={item.position}
                  icon={createIcon(getColor(item.status))}
                >
                  <Popup>
                    <strong>{item.name}</strong>
                    <br />
                    Status: {item.status}
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>

        {/* SIDE PANEL */}
        <div className="gis-side">
          <h3>Mapped Establishments</h3>

          {establishments.map((item, index) => (
            <div key={index} className="gis-item">
              <span
                className="dot"
                style={{ background: getColor(item.status) }}
              ></span>
              {item.name}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default SanitaryGISMap;