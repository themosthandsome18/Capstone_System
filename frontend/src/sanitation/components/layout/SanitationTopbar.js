import { FiBell, FiLogOut } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../../auth/AuthContext";

function SanitationTopbar() {
  const navigate = useNavigate();
  const { logout, role, user } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="sanitation-topbar">
      <h3 className="topbar-title">
        Mauban Health Office - Sanitary Section Monitoring
      </h3>

      <div className="sanitation-top-actions">
        <FiBell className="topbar-icon" />

        {role === "admin" ? (
          <button
            type="button"
            className="sanitation-module-switch"
            onClick={() => navigate("/")}
          >
            Tourism
          </button>
        ) : null}

        <div className="admin">
          <div className="admin-avatar">
            {(user?.display_name || user?.username || "A").charAt(0)}
          </div>

          <div className="admin-text">
            <span>{user?.display_name || user?.username}</span>
            {user?.profile?.role_label && (user?.display_name || user?.username) !== user?.profile?.role_label ? (
              <small>{user?.profile?.role_label}</small>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="sanitation-logout-btn"
          title="Logout"
          aria-label="Logout"
          onClick={handleLogout}
        >
          <FiLogOut />
        </button>
      </div>
    </div>
  );
}

export default SanitationTopbar;
