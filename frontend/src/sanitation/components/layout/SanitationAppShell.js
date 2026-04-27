import { Outlet } from "react-router-dom";
import SanitationSidebar from "./SanitationSidebar";
import SanitationTopbar from "./SanitationTopbar";

function SanitationAppShell() {
  return (
    <div className="sanitation-layout">
      <SanitationSidebar />

      <div className="sanitation-main">
        <SanitationTopbar />
        <div className="sanitation-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default SanitationAppShell;