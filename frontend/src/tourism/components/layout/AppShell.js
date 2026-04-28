import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { FiBell, FiCalendar, FiSearch } from "react-icons/fi";
import Sidebar from "./Sidebar";


const pageInfo = {
  "/": {
    title: "Dashboard Overview",
    date: "Saturday, April 17, 2026",
    showAdd: true,
  },
  "/tourist-data": {
    title: "Booking Management",
    date: "Saturday, April 18, 2026",
    showAdd: true,
  },
  "/arrival-monitoring": {
    title: "Arrival Monitoring",
    date: "Saturday, April 18, 2026",
    showAdd: true,
  },
  "/destinations": {
    title: "Destination Management",
    date: "Saturday, April 18, 2026",
    showAdd: true,
  },
  "/feedback": {
    title: "Feedback Monitoring",
    date: "Saturday, April 18, 2026",
    showAdd: false,
  },
  "/analytics-reports": {
    title: "Reports",
    date: "Saturday, April 18, 2026",
    showAdd: true,
  },
  "/gis-map": {
    title: "GIS Map",
    date: "Saturday, April 18, 2026",
    showAdd: true,
  },
  "/settings": {
    title: "Settings",
    date: "Saturday, April 18, 2026",
    showAdd: false,
  },
};

function AppShell() {
  const location = useLocation();
  const currentPage = pageInfo[location.pathname] || pageInfo["/"];

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [addEntryRequestId, setAddEntryRequestId] = useState(0);

  return (
    <div className="tourism-layout">
      {sidebarOpen && <Sidebar />}

      <main className="tourism-main">
        <header className="tourism-topbar">
          <div className="topbar-left">
            {/* BURGER BUTTON */}
            <button
              type="button"
              className="topbar-menu-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              <div className="custom-burger">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </button>

            <div className="topbar-divider" />

            <div>
              <h2>{currentPage.title}</h2>
              <p>{currentPage.date}</p>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <FiSearch size={18} />
              <input type="text" placeholder="Search bookings, guests..." />
            </div>

            <button type="button" className="topbar-pill">
              <FiCalendar />
              Today
            </button>

            <button type="button" className="icon-pill">
              <FiBell />
            </button>

            {currentPage.showAdd && (
              <button
                type="button"
                className="add-entry-btn"
                onClick={() => setAddEntryRequestId((value) => value + 1)}
              >
                + Add Entry
              </button>
            )}
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
