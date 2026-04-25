import { FiBell, FiCalendar, FiMenu, FiSearch } from "react-icons/fi";

function Topbar({ onMenuClick }) {
  return (
    <header className="tourism-topbar">
      <div className="topbar-left">
        <button type="button" className="menu-button" onClick={onMenuClick}>
          <FiMenu size={22} />
        </button>

        <div className="topbar-divider" />

        <div>
          <h2>Dashboard Overview</h2>
          <p>Saturday, April 17, 2026</p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="search-box">
          <FiSearch size={18} />
          <input type="text" placeholder="Search bookings, guests..." />
        </div>

        <button type="button" className="topbar-pill">
          <FiCalendar size={17} />
          Today
        </button>

        <button type="button" className="icon-pill">
          <FiBell size={18} />
        </button>

        <button type="button" className="add-entry-btn">
          + Add Entry
        </button>
      </div>
    </header>
  );
}

export default Topbar;