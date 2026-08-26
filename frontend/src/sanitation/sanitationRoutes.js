import React from "react";
import { Navigate } from "react-router-dom";
import { withErrorBoundary } from "../shared/ErrorBoundary";
import SanitationDashboard from "./pages/SanitationDashboard";
import TypesAndRequirements from "./pages/TypesAndRequirements";
import EstablishmentRecords from "./pages/EstablishmentRecords";
import InspectionManagement from "./pages/InspectionManagement";
import ComplaintsManagement from "./pages/ComplaintsManagement";
import PermitMonitoring from "./pages/PermitMonitoring";
import PermitRenewal from "./pages/PermitRenewal";
import SubmissionTracking from "./pages/SubmissionTracking";
import SanitaryReportAnalytics from "./pages/SanitaryReportAnalytics";
import HouseholdRecords from "./pages/HouseholdRecords";
import SanitaryGISMap from "./pages/SanitaryGISMap";
import HouseholdReportAnalytics from "./pages/HouseholdReportAnalytics";
import ActivityLogsPage from "../shared/pages/ActivityLogsPage";

/**
 * Modular Sanitation Routes
 * Each route is guarded with its own ErrorBoundary for Fault Isolation.
 * If any feature crashes, only that section shows a fallback UI while
 * the rest of the application remains fully functional.
 */
export const sanitationRoutes = [
  {
    index: true,
    element: React.createElement(
      withErrorBoundary(SanitationDashboard, "Sanitary Dashboard")
    ),
  },
  {
    path: "requirements",
    element: React.createElement(
      withErrorBoundary(TypesAndRequirements, "Types & Requirements")
    ),
  },
  {
    path: "establishments",
    element: React.createElement(
      withErrorBoundary(EstablishmentRecords, "Establishment Records")
    ),
  },
  {
    path: "inspections",
    element: React.createElement(
      withErrorBoundary(InspectionManagement, "Inspection Management")
    ),
  },
  {
    path: "community-report",
    element: React.createElement(
      withErrorBoundary(ComplaintsManagement, "Community Concerns & Schedules")
    ),
  },
  {
    path: "complaints",
    element: <Navigate to="../community-report" replace />,
  },
  {
    path: "permits",
    element: React.createElement(
      withErrorBoundary(PermitMonitoring, "Permit Monitoring")
    ),
  },
  {
    path: "renewals",
    element: React.createElement(
      withErrorBoundary(PermitRenewal, "Permit Renewal")
    ),
  },
  {
    path: "submissions",
    element: React.createElement(
      withErrorBoundary(SubmissionTracking, "Submission Tracking")
    ),
  },
  {
    path: "reports",
    element: React.createElement(
      withErrorBoundary(SanitaryReportAnalytics, "Business Report & Analytics")
    ),
  },
  {
    path: "households",
    element: React.createElement(
      withErrorBoundary(HouseholdRecords, "Household Records")
    ),
  },
  {
    path: "gis-map",
    element: React.createElement(
      withErrorBoundary(SanitaryGISMap, "Sanitation GIS Map")
    ),
  },
  {
    path: "household-reports",
    element: React.createElement(
      withErrorBoundary(HouseholdReportAnalytics, "Household Report & Analytics")
    ),
  },
  {
    path: "activity-logs",
    element: React.createElement(
      withErrorBoundary(
        () => <ActivityLogsPage module="sanitation" />,
        "Activity Logs"
      )
    ),
  },
];

export default sanitationRoutes;
