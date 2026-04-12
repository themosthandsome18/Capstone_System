import { useState } from "react";
import { FiBell, FiMenu, FiUser } from "react-icons/fi";

function Topbar({ onMenuClick }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-transparent">
      <div className="flex items-center justify-between gap-4 px-4 py-5 sm:px-5 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-2xl border border-sky-200 bg-white p-2.5 text-slate-700 shadow-sm lg:hidden"
          >
            <FiMenu size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative inline-flex items-center justify-center rounded-full p-2 text-slate-900"
          >
            <FiBell size={18} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProfileMenu((value) => !value)}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-900"
            >
              <FiUser size={18} />
            </button>

            {showProfileMenu ? (
              <div className="absolute right-0 mt-3 w-48 rounded-3xl border border-slate-200 bg-white p-2 shadow-soft">
                <button
                  type="button"
                  className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Tourism Officer
                </button>
                <button
                  type="button"
                  className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Municipal Tourism Desk
                </button>
                <button
                  type="button"
                  className="w-full rounded-2xl px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
