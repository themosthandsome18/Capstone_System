import { FiArrowRight, FiBriefcase, FiLogOut, FiShield } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import maubanLogo from "../tourism/assets/logoMauban.jpg";
import { useAuth } from "./AuthContext";
import "./ModuleSelectionPage.css";


const modules = [
  {
    title: "Tourism Office",
    description: "Arrivals, destinations, bookings, feedback, and reports",
    path: "/",
    icon: FiBriefcase,
  },
  {
    title: "Sanitary Section",
    description: "Establishments, inspections, permits, households, and reports",
    path: "/sanitation",
    icon: FiShield,
  },
];


function ModuleSelectionPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="module-page">
      <section className="module-shell">
        <header className="module-header">
          <div className="module-brand">
            <img src={maubanLogo} alt="Mauban logo" />
            <div>
              <span>Mauban Monitoring System</span>
              <strong>{user?.display_name || user?.username}</strong>
            </div>
          </div>

          <button
            type="button"
            className="module-logout"
            onClick={handleLogout}
          >
            <FiLogOut />
            Logout
          </button>
        </header>

        <div className="module-intro">
          <p>System Admin</p>
          <h1>Select Module</h1>
        </div>

        <div className="module-grid">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <button
                type="button"
                className="module-card"
                key={module.path}
                onClick={() => navigate(module.path)}
              >
                <span className="module-card-icon">
                  <Icon />
                </span>

                <span className="module-card-copy">
                  <strong>{module.title}</strong>
                  <small>{module.description}</small>
                </span>

                <span className="module-card-action">
                  <FiArrowRight />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}


export default ModuleSelectionPage;
