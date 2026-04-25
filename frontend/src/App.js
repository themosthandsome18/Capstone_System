import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

/* ================= LAYOUT ================= */
import AppShell from "./components/layout/Tourism_layout/AppShell";

/* ================= CONTEXT ================= */
import { TourismDataProvider } from "./context/TourismDataContext";
// import { SanitaryDataProvider } from "./context/SanitaryDataContext";

/* ================= TOURISM PAGES ================= */
import Dashboard from "./pages/Tourism_Page/Dashboard";
import BookingManagement from "./pages/Tourism_Page/BookingManagement";
import ArrivalMonitoring from "./pages/Tourism_Page/ArrivalMonitoring";
import DestinationManagement from "./pages/Tourism_Page/DestinationManagement";
import FeedbackMonitoring from "./pages/Tourism_Page/FeedbackMonitoring";
import AnalyticsAndReport from "./pages/Tourism_Page/AnalyticsAndReport";
import GISMap from "./pages/Tourism_Page/GISMap";
import Settings from "./pages/Tourism_Page/Settings";

/* ================= SANITARY PAGES ================= */
// import SanitaryDashboard from "./pages/Sanitary_Page/SanitaryDashboard";
// import InspectionManagement from "./pages/Sanitary_Page/InspectionManagement";
// import PermitMonitoring from "./pages/Sanitary_Page/PermitMonitoring";

function App() {
  return (
    <TourismDataProvider>
      {/* 👉 later wrap also with SanitaryDataProvider if needed */}
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>

            {/* ================= TOURISM SYSTEM ================= */}

            <Route path="/" element={<Dashboard />} />
            <Route path="/tourist-data" element={<BookingManagement />} />
            <Route path="/arrival-monitoring" element={<ArrivalMonitoring />} />
            <Route path="/destinations" element={<DestinationManagement />} />
            <Route path="/feedback" element={<FeedbackMonitoring />} />
            <Route path="/analytics-reports" element={<AnalyticsAndReport />} />
            <Route path="/gis-map" element={<GISMap />} />
            <Route path="/settings" element={<Settings />} />

            {/* ================= SANITARY SYSTEM (ADD HERE) ================= */}

            {/*
              Example structure:
              /sanitary/dashboard
              /sanitary/inspection
              /sanitary/permits
            */}

            {/* 
            <Route path="/sanitary/dashboard" element={<SanitaryDashboard />} />
            <Route path="/sanitary/inspection" element={<InspectionManagement />} />
            <Route path="/sanitary/permits" element={<PermitMonitoring />} />
            */}

            {/* ================= FALLBACK ================= */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Route>
        </Routes>
      </BrowserRouter>
    </TourismDataProvider>
  );
}

export default App;