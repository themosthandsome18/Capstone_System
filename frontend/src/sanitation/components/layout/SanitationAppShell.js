import { Outlet } from "react-router-dom";
import { useSanitationData } from "../../context/SanitationDataContext";
import LoadingOverlay from "../../../shared/LoadingOverlay";
import SanitationSidebar from "./SanitationSidebar";
import SanitationTopbar from "./SanitationTopbar";

function SanitationAppShell() {
  const { loading, actionLoading } = useSanitationData();

  // Show full-page spinner while bootstrap data is loading
  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading__ring" />
        <p className="page-loading__text">Loading Sanitation Data...</p>
      </div>
    );
  }

  return (
    <div className="sanitation-layout">
      <LoadingOverlay visible={actionLoading} message="Please wait..." />
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