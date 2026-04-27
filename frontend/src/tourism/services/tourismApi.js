import {
  boatTypes,
  countries,
  dashboardAlerts,
  executiveSummaryRows,
  feedbackEntries,
  itineraries,
  monthlyArrivals,
  originBreakdown,
  provinces,
  purposeBreakdown,
  regions,
  resorts,
  touristRecords,
  travelModeBreakdown,
  travelModes,
  trendSeries,
  visitPurposes,
} from "../data/mockTourismData";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000/api";

const delay = (payload) =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(payload), 150);
  });

export const tourismApi = {
  async getBootstrapData() {
    // Replace this with Django REST requests when backend endpoints are ready.
    return delay({
      referenceTables: {
        countries,
        regions,
        provinces,
        itineraries,
        resorts,
        travelModes,
        boatTypes,
        visitPurposes,
      },
      touristRecords,
      feedbackEntries,
      analytics: {
        monthlyArrivals,
        trendSeries,
        purposeBreakdown,
        travelModeBreakdown,
        originBreakdown,
        executiveSummaryRows,
      },
      dashboardAlerts,
      apiBaseUrl: API_BASE_URL,
    });
  },

  async createTouristRecord(payload) {
    return delay(payload);
  },

  async updateTouristRecord(id, payload) {
    return delay(payload);
  },

  async deleteTouristRecord(id) {
    return delay({ id });
  },
};
