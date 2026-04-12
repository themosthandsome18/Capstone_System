import { NavLink } from "react-router-dom";
import {
  FiBarChart2,
  FiDatabase,
  FiGlobe,
  FiGrid,
  FiHome,
  FiMapPin,
  FiMessageSquare,
  FiNavigation,
  FiX,
} from "react-icons/fi";

const navigation = [
  { to: "/", label: "Dashboard", icon: FiHome },
  { to: "/tourist-data", label: "Data Management", icon: FiDatabase },
  { to: "/arrival-monitoring", label: "Arrival Monitoring", icon: FiBarChart2 },
  { to: "/destinations", label: "Destination Management", icon: FiGrid },
  { to: "/feedback", label: "Feedback Monitoring", icon: FiMessageSquare },
  { to: "/analytics-reports", label: "Analytics and Report", icon: FiGlobe },
  { to: "/gis-map", label: "GIS Map", icon: FiMapPin },
];

function Sidebar({ mobileNavOpen, onClose }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/35 transition lg:hidden ${
          mobileNavOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[165px] border-r border-[#a3d1db] bg-[#dceef2] transition duration-300 lg:sticky lg:top-0 lg:block lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[#b8dbe2] px-3 py-5">
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#217c86]">
                Navigation
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-sky-200 bg-white p-2 text-slate-500"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white shadow-md">
                <FiNavigation size={14} />
              </div>
              <div>
                <p className="text-[11px] font-bold leading-tight text-slate-900">
                  Mauban Tourism Office
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-8">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-[10px] px-3 py-3 text-[11px] font-medium transition ${
                    isActive
                      ? "bg-gradient-to-r from-[#0b8994] to-[#24aeb2] text-white shadow-lg"
                      : "text-[#46717b] hover:bg-white/70 hover:text-slate-800"
                  }`
                }
              >
                <Icon size={13} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
