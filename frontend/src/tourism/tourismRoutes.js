import React from "react";
import { Navigate } from "react-router-dom";
import { withErrorBoundary } from "../shared/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import BookingManagement from "./pages/BookingManagement";
import ArrivalMonitoring from "./pages/ArrivalMonitoring";
import DestinationManagement from "./pages/DestinationManagement";
import AnalyticsAndReport from "./pages/AnalyticsAndReport";
import GISMap from "./pages/GISMap";
import ActivityLogsPage from "../shared/pages/ActivityLogsPage";
import Settings from "./pages/Settings";
import RegistrationOptions from "./pages/RegistrationOptions";
import { OPTIONS_PATH, OPTIONS_ROLES } from "./optionsAccess";
import MobileAppContent from "./pages/MobileAppContent";
import MobileContentTileEditor from "./pages/MobileContentTileEditor";
import { MOBILE_CONTENT_PATH, MOBILE_CONTENT_ROLES, TILE_PATH, tabPath } from "./mobileContentAccess";
import { HOTLINES_PATH, HOTLINES_ROLES } from "./hotlinesAccess";
import { SETTINGS_PATH, SETTINGS_ROLES } from "./settingsAccess";

// The old address of the Emergency Hotlines page: sent, in place, to its tab of the Mobile App Content page. It is a
// component (not an element made here) so that nothing is built until the route is shown.
function HotlinesMovedToMobileContent() {
  return <Navigate to={tabPath("hotlines")} replace />;
}

/**
 * Modular Tourism Routes
 * Each route is guarded with its own ErrorBoundary for Fault Isolation.
 * If any feature crashes, only that section shows a fallback UI while
 * the rest of the application remains fully functional.
 * A route with allowedRoles is reachable only by those roles (App.js).
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
    element: React.createElement(withErrorBoundary(DestinationManagement, "Destinations & Feedback")),
  },
  {
    path: "/feedback",
    element: React.createElement(
      withErrorBoundary(() => <DestinationManagement initialTab="feedback" />, "Destinations & Feedback")
    ),
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
  {
    path: SETTINGS_PATH,
    allowedRoles: SETTINGS_ROLES,
    element: React.createElement(withErrorBoundary(Settings, "Settings")),
  },
  {
    path: OPTIONS_PATH,
    allowedRoles: OPTIONS_ROLES,
    element: React.createElement(withErrorBoundary(RegistrationOptions, "Registration Options")),
  },
  {
    path: MOBILE_CONTENT_PATH,
    allowedRoles: MOBILE_CONTENT_ROLES,
    element: React.createElement(withErrorBoundary(MobileAppContent, "Mobile App Content")),
  },
  {
    path: TILE_PATH,
    allowedRoles: MOBILE_CONTENT_ROLES,
    element: React.createElement(withErrorBoundary(MobileContentTileEditor, "Edit a tile")),
  },
  {
    path: HOTLINES_PATH,
    allowedRoles: HOTLINES_ROLES,
    element: React.createElement(HotlinesMovedToMobileContent),
  },
];

export default tourismRoutes;
