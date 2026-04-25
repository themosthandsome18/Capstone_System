import { NavLink } from "react-router-dom";
import logo from "../../../assets/Tourism_pics/logoMauban.jpg";

const navigation = [
  { to: "/", label: "Dashboard" },
  { to: "/tourist-data", label: "Booking Management" },
  { to: "/arrival-monitoring", label: "Arrival Monitoring" },
  { to: "/destinations", label: "Destination Management" },
  { to: "/feedback", label: "Feedback Monitoring" },
  { to: "/analytics-reports", label: "Reports" },
  { to: "/gis-map", label: "GIS Map" },
  { to: "/settings", label: "Settings" },
];

function Sidebar() {
  return (
    <aside className="tourism-sidebar">
      <div className="sidebar-brand">
        <img src={logo} alt="Mauban Tourism Office" className="sidebar-logo" />
        <span>Mauban Tourism Office</span>
      </div>

      <nav className="sidebar-nav">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `sidebar-nav-link ${isActive ? "active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;