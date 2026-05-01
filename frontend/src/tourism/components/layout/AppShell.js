import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FiBell, FiCalendar, FiSearch } from "react-icons/fi";
import Sidebar from "./Sidebar";

const pageInfo = {
  "/": {
    title: "Dashboard Overview",
    searchPlaceholder: "Search tourism records...",
    showAdd: true,
  },
  "/tourist-data": {
    title: "Booking Management",
    searchPlaceholder: "Search bookings, guests...",
    showAdd: true,
  },
  "/arrival-monitoring": {
    title: "Arrival Monitoring",
    searchPlaceholder: "Search arrivals...",
    showAdd: true,
  },
  "/destinations": {
    title: "Destination Management",
    searchPlaceholder: "Search destinations...",
    showAdd: false,
  },
  "/feedback": {
    title: "Feedback Monitoring",
    searchPlaceholder: "Search feedback...",
    showAdd: false,
  },
  "/analytics-reports": {
    title: "Reports",
    searchPlaceholder: "Search reports...",
    showAdd: false,
  },
  "/gis-map": {
    title: "GIS Map",
    searchPlaceholder: "Search locations...",
    showAdd: false,
  },
  "/settings": {
    title: "Settings",
    searchPlaceholder: "Search settings...",
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

  const currentPage = pageInfo[location.pathname] || pageInfo["/"];

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [addEntryRequestId, setAddEntryRequestId] = useState(0);
  const [globalSearch, setGlobalSearch] = useState("");

  function handleAddEntry() {
    if (location.pathname !== "/tourist-data") {
      navigate("/tourist-data");
    }

    setAddEntryRequestId((value) => value + 1);
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
            <div className="search-box">
              <FiSearch size={18} />
              <input
                type="text"
                placeholder={currentPage.searchPlaceholder}
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
              />
            </div>

            <button
              type="button"
              className="topbar-pill"
              title="Current date"
              aria-label="Current date"
            >
              <FiCalendar />
              Today
            </button>

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
          </div>
        </header>

        <section className="tourism-content">
          <Outlet context={{ addEntryRequestId, globalSearch }} />
        </section>
      </main>
    </div>
  );
}

export default AppShell;