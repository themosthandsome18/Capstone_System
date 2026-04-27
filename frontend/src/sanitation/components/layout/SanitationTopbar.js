import { FiBell } from "react-icons/fi";

function SanitationTopbar() {
  return (
    <div className="sanitation-topbar">
      
      {/* LEFT TITLE */}
      <h3 className="topbar-title">
        Mauban Health Office - Sanitary Section Monitoring
      </h3>

      {/* RIGHT SIDE */}
      <div className="sanitation-top-actions">
        
        {/* NOTIFICATION */}
        <FiBell className="topbar-icon" />

        {/* ADMIN */}
        <div className="admin">
          <div className="admin-avatar">A</div>

          <div className="admin-text">
            <span>Admin</span>
            <small>Sanitary Inspector</small>
          </div>
        </div>

      </div>
    </div>
  );
}

export default SanitationTopbar;