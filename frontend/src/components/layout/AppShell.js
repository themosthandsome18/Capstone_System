import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent px-2 lg:px-4">
      <div className="figma-shell flex">
        <Sidebar
          mobileNavOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />

        <div className="figma-page min-w-0 flex-1">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="px-4 pb-8 pt-1 sm:px-5 lg:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
