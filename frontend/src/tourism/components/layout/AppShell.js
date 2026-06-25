import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FiBell, FiLogOut } from "react-icons/fi";
import { useAuth } from "../../../auth/AuthContext";
import Sidebar from "./Sidebar";

const pageInfo = {
  "/": {
    title: "Dashboard Overview",
    showAdd: true,
  },
  "/tourist-data": {
    title: "Booking Management",
    showAdd: true,
  },
  "/arrival-monitoring": {
    title: "Arrival Monitoring",
    showAdd: true,
  },
  "/destinations": {
    title: "Destination Management",
    showAdd: false,
  },
  "/feedback": {
    title: "Feedback Monitoring",
    showAdd: false,
  },
  "/analytics-reports": {
    title: "Reports",
    showAdd: false,
  },
  "/gis-map": {
    title: "GIS Map",
    showAdd: false,
  },
  "/activity-logs": {
    title: "Activity Logs",
    showAdd: false,
  },
};

function formatToday() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, role, user } = useAuth();

  const currentPage = pageInfo[location.pathname] || pageInfo["/"];

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [addEntryRequestId, setAddEntryRequestId] = useState(0);

  function handleAddEntry() {
    if (location.pathname !== "/tourist-data") {
      navigate("/tourist-data");
    }

    setAddEntryRequestId((value) => value + 1);
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="tourism-layout">
      {sidebarOpen && <Sidebar />}

      <main className="tourism-main">
        <header className="tourism-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-menu-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle sidebar"
            >
              <div className="custom-burger">
                <span />
                <span />
                <span />
              </div>
            </button>

            <div className="topbar-divider" />

            <div>
              <h2>{currentPage.title}</h2>
              <p>{formatToday()}</p>
            </div>
          </div>

          <div className="topbar-actions">

            <button
              type="button"
              className="icon-pill"
              title="Notifications preview"
              aria-label="Notifications preview"
            >
              <FiBell />
            </button>

            {currentPage.showAdd ? (
              <button
                type="button"
                className="add-entry-btn"
                onClick={handleAddEntry}
              >
                + Add Entry
              </button>
            ) : null}

            {role === "admin" ? (
              <button
                type="button"
                className="module-switch-btn"
                onClick={() => navigate("/sanitation")}
              >
                Sanitation
              </button>
            ) : null}

            <div className="topbar-user">
              <span>{user?.display_name || user?.username}</span>
              <small>{user?.profile?.role_label || (role ? role.charAt(0).toUpperCase() + role.slice(1) : "User")}</small>
            </div>

            <button
              type="button"
              className="icon-pill"
              title="Logout"
              aria-label="Logout"
              onClick={handleLogout}
            >
              <FiLogOut />
            </button>
          </div>
        </header>

        <section className="tourism-content">
          <Outlet context={{ addEntryRequestId }} />
        </section>
      </main>
    </div>
  );
}

export default AppShell;
