import { FiBell, FiCalendar, FiMenu, FiSearch } from "react-icons/fi";

function formatToday() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function Topbar({
  onMenuClick,
  onAddEntry,
  searchValue = "",
  onSearchChange,
  pageTitle = "Dashboard Overview",
}) {
  return (
    <header className="tourism-topbar">
      <div className="topbar-left">
        <button type="button" className="menu-button" onClick={onMenuClick}>
          <FiMenu size={22} />
        </button>

        <div className="topbar-divider" />

        <div>
          <h2>{pageTitle}</h2>
          <p>{formatToday()}</p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="search-box">
          <FiSearch size={18} />
          <input
            type="text"
            placeholder="Search bookings, guests..."
            value={searchValue}
            onChange={(event) => {
              if (onSearchChange) {
                onSearchChange(event.target.value);
              }
            }}
          />
        </div>

        <button
          type="button"
          className="topbar-pill"
          title="Current date"
          aria-label="Current date"
        >
          <FiCalendar size={17} />
          Today
        </button>

        <button
          type="button"
          className="icon-pill"
          title="Notifications preview"
          aria-label="Notifications preview"
        >
          <FiBell size={18} />
        </button>

        <button
          type="button"
          className="add-entry-btn"
          onClick={onAddEntry}
        >
          + Add Entry
        </button>
      </div>
    </header>
  );
}

export default Topbar;