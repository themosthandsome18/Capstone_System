import { NavLink } from "react-router-dom";
import logo from "../../assets/logoMauban.jpg";

const businessLinks = [
  { to: "/sanitation", label: "Sanitary Dashboard", end: true },
  { to: "/sanitation/requirements", label: "Types & Requirements" },
  { to: "/sanitation/establishments", label: "Establishment Records" },
  { to: "/sanitation/inspections", label: "Inspection Management" },
  { to: "/sanitation/permits", label: "Permit Monitoring" },
  { to: "/sanitation/submissions", label: "Submission Tracking" },
  { to: "/sanitation/reports", label: "Report and Analytics" },
];

const householdLinks = [
  { to: "/sanitation/households", label: "Households Records" },
  { to: "/sanitation/gis-map", label: "GIS Map" },
  { to: "/sanitation/household-reports", label: "Report and Analytics" },
];

function SanitationSidebar() {
  const renderLinks = (links) =>
    links.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `sanitation-link ${isActive ? "active" : ""}`
        }
      >
        {item.label}
      </NavLink>
    ));

  return (
    <aside className="sanitation-sidebar">
      <div className="sanitation-brand">
        <img src={logo} alt="Mauban logo" className="sanitation-logo" />

        <div className="sanitation-brand-text">
          <h2>Mauban Municipality Health Office</h2>
          <p>Sanitary Section</p>
        </div>
      </div>

      <div className="sanitation-nav-group">
        <span className="nav-group-title">BUSINESS / PERMIT</span>
        {renderLinks(businessLinks)}
      </div>

      <div className="sanitation-nav-group household-group">
        <span className="nav-group-title">HOUSEHOLD</span>
        {renderLinks(householdLinks)}
      </div>
    </aside>
  );
}

export default SanitationSidebar;