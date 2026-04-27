import { createContext, useContext, useEffect, useState } from "react";
import { tourismApi } from "../services/tourismApi";

const TourismDataContext = createContext(null);

const emptyBootstrap = {
  referenceTables: {
    countries: [],
    regions: [],
    provinces: [],
    itineraries: [],
    resorts: [],
    travelModes: [],
    boatTypes: [],
    visitPurposes: [],
  },
  touristRecords: [],
  feedbackEntries: [],
  analytics: {
    monthlyArrivals: [],
    trendSeries: { daily: [], weekly: [], monthly: [], yearly: [] },
    purposeBreakdown: [],
    travelModeBreakdown: [],
    originBreakdown: [],
    executiveSummaryRows: [],
  },
  dashboardAlerts: [],
  apiBaseUrl: "",
};

export function TourismDataProvider({ children }) {
  const [bootstrap, setBootstrap] = useState(emptyBootstrap);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const response = await tourismApi.getBootstrapData();

        if (mounted) {
          setBootstrap(response);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  async function createRecord(payload) {
    await tourismApi.createTouristRecord(payload);
    setBootstrap((current) => ({
      ...current,
      touristRecords: [payload, ...current.touristRecords],
    }));
  }

  async function updateRecord(surveyId, payload) {
    await tourismApi.updateTouristRecord(surveyId, payload);
    setBootstrap((current) => ({
      ...current,
      touristRecords: current.touristRecords.map((record) =>
        record.survey_id === surveyId ? payload : record
      ),
    }));
  }

  async function deleteRecord(surveyId) {
    await tourismApi.deleteTouristRecord(surveyId);
    setBootstrap((current) => ({
      ...current,
      touristRecords: current.touristRecords.filter(
        (record) => record.survey_id !== surveyId
      ),
    }));
  }

  return (
    <TourismDataContext.Provider
      value={{
        ...bootstrap,
        loading,
        createRecord,
        updateRecord,
        deleteRecord,
      }}
    >
      {children}
    </TourismDataContext.Provider>
  );
}

export function useTourismData() {
  const context = useContext(TourismDataContext);

  if (!context) {
    throw new Error("useTourismData must be used within TourismDataProvider");
  }

  return context;
}
