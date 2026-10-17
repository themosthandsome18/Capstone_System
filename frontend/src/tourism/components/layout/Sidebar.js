import { NavLink } from "react-router-dom";
import logo from "../../assets/Tourismlogo.jpg";
import { useAuth } from "../../../auth/AuthContext";
import { OPTIONS_PATH, canManageOptions } from "../../optionsAccess";
import { HOTLINES_PATH, canManageHotlines } from "../../hotlinesAccess";
import { SETTINGS_PATH, canOpenSettings } from "../../settingsAccess";

const navigation = [
  { to: "/", label: "Dashboard" },
  { to: "/tourist-data", label: "Record Management" },
  { to: "/arrival-monitoring", label: "Arrival Monitoring" },
  { to: "/destinations", label: "Destinations & Feedback" },
  { to: "/analytics-reports", label: "Reports" },
  { to: "/gis-map", label: "GIS Map" },
  { to: "/activity-logs", label: "Activity Logs" },
];

// Shown only to roles that may open them; the routes are guarded too.
const administration = [
  { to: SETTINGS_PATH, label: "Settings", allowed: canOpenSettings },
  { to: OPTIONS_PATH, label: "Registration Options", allowed: canManageOptions },
  { to: HOTLINES_PATH, label: "Emergency Hotlines", allowed: canManageHotlines },
];

function SidebarLink({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        `sidebar-nav-link ${isActive ? "active" : ""}`
      }
    >
      {item.label}
    </NavLink>
  );
}

function Sidebar() {
  const { role } = useAuth();
  const administrationLinks = administration.filter((item) => item.allowed(role));

  return (
    <aside className="tourism-sidebar">
      <div className="sidebar-brand">
        <img src={logo} alt="Mauban Tourism Office" className="sidebar-logo" />
        <span>Mauban Tourism Office</span>
      </div>

      <nav className="sidebar-nav">
        {navigation.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}

        {administrationLinks.length ? (
          <>
            <p className="sidebar-nav-heading">Administration</p>
            {administrationLinks.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}

export default Sidebar;
