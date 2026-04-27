import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

/* ================= TOURISM LAYOUT ================= */
import AppShell from "./tourism/components/layout/AppShell";

/* ================= SANITATION LAYOUT ================= */
import SanitationAppShell from "./sanitation/components/layout/SanitationAppShell";

/* ================= CONTEXT ================= */
import { TourismDataProvider } from "./tourism/context/TourismDataContext";
// import { SanitaryDataProvider } from "./sanitation/context/SanitaryDataContext";

/* ================= TOURISM PAGES ================= */
import Dashboard from "./tourism/pages/Dashboard";
import BookingManagement from "./tourism/pages/BookingManagement";
import ArrivalMonitoring from "./tourism/pages/ArrivalMonitoring";
import DestinationManagement from "./tourism/pages/DestinationManagement";
import FeedbackMonitoring from "./tourism/pages/FeedbackMonitoring";
import AnalyticsAndReport from "./tourism/pages/AnalyticsAndReport";
import GISMap from "./tourism/pages/GISMap";
import Settings from "./tourism/pages/Settings";

/* ================= SANITATION PAGES ================= */
import SanitationDashboard from "./sanitation/pages/SanitationDashboard";
import TypesAndRequirements from "./sanitation/pages/TypesAndRequirements";
import EstablishmentRecords from "./sanitation/pages/EstablishmentRecords";
import InspectionManagement from "./sanitation/pages/InspectionManagement";
import PermitMonitoring from "./sanitation/pages/PermitMonitoring";
import SubmissionTracking from "./sanitation/pages/SubmissionTracking";
import SanitaryReportAnalytics from "./sanitation/pages/SanitaryReportAnalytics";
import HouseholdRecords from "./sanitation/pages/HouseholdRecords";
import SanitaryGISMap from "./sanitation/pages/SanitaryGISMap";
import HouseholdReportAnalytics from "./sanitation/pages/HouseholdReportAnalytics";


function App() {
  return (
    <TourismDataProvider>
      {/* later you can wrap with SanitaryDataProvider */}
      <BrowserRouter>
        <Routes>

          {/* ================= TOURISM SYSTEM ================= */}
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tourist-data" element={<BookingManagement />} />
            <Route path="/arrival-monitoring" element={<ArrivalMonitoring />} />
            <Route path="/destinations" element={<DestinationManagement />} />
            <Route path="/feedback" element={<FeedbackMonitoring />} />
            <Route path="/analytics-reports" element={<AnalyticsAndReport />} />
            <Route path="/gis-map" element={<GISMap />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* ================= SANITATION SYSTEM ================= */}
          <Route path="/sanitation" element={<SanitationAppShell />}>
            <Route index element={<SanitationDashboard />} />
            <Route path="requirements" element={<TypesAndRequirements />} />
            <Route path="establishments" element={<EstablishmentRecords />} />
            <Route path="inspections" element={<InspectionManagement />} />
            <Route path="permits" element={<PermitMonitoring />} />
            <Route path="submissions" element={<SubmissionTracking />} />
            <Route path="reports" element={<SanitaryReportAnalytics />} />
            <Route path="households" element={<HouseholdRecords />} />
            <Route path="gis-map" element={<SanitaryGISMap />} />
            <Route path="household-reports" element={<HouseholdReportAnalytics />} />
          </Route>

          {/* ================= FALLBACK ================= */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </BrowserRouter>
    </TourismDataProvider>
  );
}

export default App;