import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import { TourismDataProvider } from "./context/TourismDataContext";
import AnalyticsAndReport from "./pages/AnalyticsAndReport";
import ArrivalMonitoring from "./pages/ArrivalMonitoring";
import Dashboard from "./pages/Dashboard";
import DataManagement from "./pages/DataManagement";
import DestinationManagement from "./pages/DestinationManagement";
import FeedbackMonitoring from "./pages/FeedbackMonitoring";
import GISMap from "./pages/GISMap";

function App() {
  return (
    <TourismDataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tourist-data" element={<DataManagement />} />
            <Route path="/arrival-monitoring" element={<ArrivalMonitoring />} />
            <Route path="/destinations" element={<DestinationManagement />} />
            <Route path="/feedback" element={<FeedbackMonitoring />} />
            <Route path="/gis-map" element={<GISMap />} />
            <Route path="/analytics-reports" element={<AnalyticsAndReport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TourismDataProvider>
  );
}

export default App;
