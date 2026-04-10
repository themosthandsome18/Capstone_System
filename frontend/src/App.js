import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import DataManagement from "./pages/DataManagement";
import ArrivalMonitoring from "./pages/ArrivalMonitoring";
import DestinationManagement from "./pages/DestinationManagement";
import FeedbackMonitoring from "./pages/FeedbackMonitoring";
import AnalyticsAndReport from "./pages/AnalyticsAndReport";
import GISMap from './pages/GISMap';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard/>}/>
        <Route path="/data" element={<DataManagement/>}/>
        <Route path="/arrival" element={<ArrivalMonitoring/>}/>
        <Route path="/destination" element={<DestinationManagement />} />
        <Route path="/feedback" element={<FeedbackMonitoring />} />
        <Route path="/analytics" element={<AnalyticsAndReport />} />
        <Route path="/gis" element={<GISMap />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

