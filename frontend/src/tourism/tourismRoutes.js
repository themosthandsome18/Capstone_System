import React from "react";
import { withErrorBoundary } from "../shared/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import BookingManagement from "./pages/BookingManagement";
import ArrivalMonitoring from "./pages/ArrivalMonitoring";
import DestinationManagement from "./pages/DestinationManagement";
import FeedbackMonitoring from "./pages/FeedbackMonitoring";
import AnalyticsAndReport from "./pages/AnalyticsAndReport";
import GISMap from "./pages/GISMap";
import ActivityLogsPage from "../shared/pages/ActivityLogsPage";

/**
 * Modular Tourism Routes
 * Each route is guarded with its own ErrorBoundary for Fault Isolation.
 * If any feature crashes, only that section shows a fallback UI while
 * the rest of the application remains fully functional.
 */
export const tourismRoutes = [
  {
    path: "/",
    element: React.createElement(withErrorBoundary(Dashboard, "Dashboard Overview")),
  },
  {
    path: "/tourist-data",
    element: React.createElement(withErrorBoundary(BookingManagement, "Record Management")),
  },
  {
    path: "/arrival-monitoring",
    element: React.createElement(withErrorBoundary(ArrivalMonitoring, "Arrival Monitoring")),
  },
  {
    path: "/destinations",
    element: React.createElement(withErrorBoundary(DestinationManagement, "Destination Management")),
  },
  {
    path: "/feedback",
    element: React.createElement(withErrorBoundary(FeedbackMonitoring, "Feedback Monitoring")),
  },
  {
    path: "/analytics-reports",
    element: React.createElement(withErrorBoundary(AnalyticsAndReport, "Reports & Analytics")),
  },
  {
    path: "/gis-map",
    element: React.createElement(withErrorBoundary(GISMap, "Tourism GIS Map")),
  },
  {
    path: "/activity-logs",
    element: React.createElement(
      withErrorBoundary(() => <ActivityLogsPage module="tourism" />, "Activity Logs")
    ),
  },
];

export default tourismRoutes;
