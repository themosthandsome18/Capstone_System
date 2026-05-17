import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";
import ModuleSelectionPage from "./auth/ModuleSelectionPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import SanitationAppShell from "./sanitation/components/layout/SanitationAppShell";
import { SanitationDataProvider } from "./sanitation/context/SanitationDataContext";
import EstablishmentRecords from "./sanitation/pages/EstablishmentRecords";
import HouseholdRecords from "./sanitation/pages/HouseholdRecords";
import HouseholdReportAnalytics from "./sanitation/pages/HouseholdReportAnalytics";
import InspectionManagement from "./sanitation/pages/InspectionManagement";
import PermitMonitoring from "./sanitation/pages/PermitMonitoring";
import SanitaryGISMap from "./sanitation/pages/SanitaryGISMap";
import SanitaryReportAnalytics from "./sanitation/pages/SanitaryReportAnalytics";
import SanitationDashboard from "./sanitation/pages/SanitationDashboard";
import SubmissionTracking from "./sanitation/pages/SubmissionTracking";
import TypesAndRequirements from "./sanitation/pages/TypesAndRequirements";
import ActivityLogsPage from "./shared/pages/ActivityLogsPage";
import AppShell from "./tourism/components/layout/AppShell";
import { TourismDataProvider } from "./tourism/context/TourismDataContext";
import AnalyticsAndReport from "./tourism/pages/AnalyticsAndReport";
import ArrivalMonitoring from "./tourism/pages/ArrivalMonitoring";
import BookingManagement from "./tourism/pages/BookingManagement";
import Dashboard from "./tourism/pages/Dashboard";
import DestinationManagement from "./tourism/pages/DestinationManagement";
import FeedbackMonitoring from "./tourism/pages/FeedbackMonitoring";
import GISMap from "./tourism/pages/GISMap";


const tourismRoutes = [
  { path: "/", element: <Dashboard /> },
  { path: "/tourist-data", element: <BookingManagement /> },
  { path: "/arrival-monitoring", element: <ArrivalMonitoring /> },
  { path: "/destinations", element: <DestinationManagement /> },
  { path: "/feedback", element: <FeedbackMonitoring /> },
  { path: "/analytics-reports", element: <AnalyticsAndReport /> },
  { path: "/gis-map", element: <GISMap /> },
  { path: "/activity-logs", element: <ActivityLogsPage module="tourism" /> },
];

const sanitationRoutes = [
  { index: true, element: <SanitationDashboard /> },
  { path: "requirements", element: <TypesAndRequirements /> },
  { path: "establishments", element: <EstablishmentRecords /> },
  { path: "inspections", element: <InspectionManagement /> },
  { path: "permits", element: <PermitMonitoring /> },
  { path: "submissions", element: <SubmissionTracking /> },
  { path: "reports", element: <SanitaryReportAnalytics /> },
  { path: "households", element: <HouseholdRecords /> },
  { path: "gis-map", element: <SanitaryGISMap /> },
  { path: "household-reports", element: <HouseholdReportAnalytics /> },
  { path: "activity-logs", element: <ActivityLogsPage module="sanitation" /> },
];


function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/module-selection" element={<ModuleSelectionPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin", "tourism"]} />}>
            <Route
              element={
                <TourismDataProvider>
                  <AppShell />
                </TourismDataProvider>
              }
            >
              {tourismRoutes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={route.element}
                />
              ))}
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin", "sanitation"]} />}>
            <Route
              path="/sanitation"
              element={
                <SanitationDataProvider>
                  <SanitationAppShell />
                </SanitationDataProvider>
              }
            >
              {sanitationRoutes.map((route) => (
                <Route
                  key={route.path || "sanitation-index"}
                  index={route.index}
                  path={route.path}
                  element={route.element}
                />
              ))}
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}


export default App;
