import { Outlet, useLocation } from "react-router-dom";
import { useSanitationData } from "../../context/SanitationDataContext";
import LoadingOverlay from "../../../shared/LoadingOverlay";
import PageLoader from "../../../shared/PageLoader";
import ErrorBoundary from "../../../shared/ErrorBoundary";
import useDocumentBranding from "../../../shared/useDocumentBranding";
import SanitationSidebar from "./SanitationSidebar";
import SanitationTopbar from "./SanitationTopbar";

const sanitationPageInfo = {
  "/sanitation": "Sanitary Dashboard",
  "/sanitation/requirements": "Types & Requirements",
  "/sanitation/establishments": "Establishment Records",
  "/sanitation/inspections": "Inspection Management",
  "/sanitation/community-report": "Community Concerns & Schedules",
  "/sanitation/complaints": "Community Concerns & Schedules",
  "/sanitation/permits": "Permit Monitoring",
  "/sanitation/renewals": "Permit Renewal",
  "/sanitation/submissions": "Submission Tracking",
  "/sanitation/reports": "Report and Analytics",
  "/sanitation/households": "Household Records",
  "/sanitation/gis-map": "Sanitation GIS Map",
  "/sanitation/household-reports": "Household Report & Analytics",
  "/sanitation/activity-logs": "Activity Logs",
  "/sanitation/staff": "Staff / Inspector Accounts",
};

function SanitationAppShell() {
  const location = useLocation();
  const { loading, actionLoading } = useSanitationData();

  const currentPath = location.pathname.replace(/\/$/, "");
  const pageTitle =
    sanitationPageInfo[currentPath] || sanitationPageInfo["/sanitation"];

  useDocumentBranding({
    module: "sanitation",
    pageTitle,
  });

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
      <LoadingOverlay visible={actionLoading} message="Please wait..." theme="sanitation" />
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