import { Outlet } from "react-router-dom";
import { useSanitationData } from "../../context/SanitationDataContext";
import LoadingOverlay from "../../../shared/LoadingOverlay";
import PageLoader from "../../../shared/PageLoader";
import ErrorBoundary from "../../../shared/ErrorBoundary";
import SanitationSidebar from "./SanitationSidebar";
import SanitationTopbar from "./SanitationTopbar";

function SanitationAppShell() {
  const { loading, actionLoading } = useSanitationData();

  // Show modern full-page animated loader while bootstrap data is loading
  if (loading) {
    return (
      <PageLoader
        message="Loading Sanitation Monitoring System..."
        subtext="Synchronizing establishments, permits, and inspections"
        variant="fullscreen"
        theme="sanitation"
      />
    );
  }

  return (
    <div className="sanitation-layout">
      <LoadingOverlay visible={actionLoading} message="Please wait..." />
      <SanitationSidebar />

      <div className="sanitation-main">
        <SanitationTopbar />
        <div className="sanitation-content">
          <ErrorBoundary featureName="Sanitation Section">
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default SanitationAppShell;