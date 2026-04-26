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
  dashboardData: {
    reportingDate: "",
    feePerVisitor: 300,
    metrics: {
      todayArrivals: 0,
      weekArrivals: 0,
      monthArrivals: 0,
      totalRevenueCollected: 0,
    },
    trends: { labels: [], arrivals: [] },
    classification: { filipino: 0, maubanin: 0, foreign: 0 },
    gender: { male: 0, female: 0 },
    stayType: { dayTour: 0, overnight: 0 },
    validation: {
      verifiedEntries: 0,
      invalidEntries: 0,
      duplicateEntries: 0,
    },
  },
  reportData: {
    filters: { from: "", to: "", resort_id: "" },
    feePerVisitor: 300,
    rows: [],
    totals: { visitors: 0, revenue: 0, avg: 0 },
  },
  settings: {
    municipality_name: "",
    province: "",
    tourism_office_contact: "",
    tourism_office_email: "",
    api_base_url: "",
  },
  analytics: {
    monthlyArrivals: [],
    trendSeries: { daily: [], weekly: [], monthly: [], yearly: [] },
    purposeBreakdown: [],
    travelModeBreakdown: [],
    originBreakdown: [],
    executiveSummaryRows: [],
  },
  arrivalMonitoring: {
    feePerVisitor: 300,
    reportDate: "",
    summary: {
      totalArrivals: 0,
      totalMale: 0,
      totalFemale: 0,
      overnight: 0,
      sameDay: 0,
      feesCollected: 0,
    },
    rows: [],
    dailyTotals: {
      male: 0,
      female: 0,
      overnight: 0,
      sameDay: 0,
      feesCollected: 0,
    },
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
        const arrivalMonitoring = await tourismApi.getArrivalMonitoringData(
          response.touristRecords,
          response.referenceTables
        );

        if (mounted) {
          setBootstrap({
            ...response,
            arrivalMonitoring,
          });
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

  async function refreshArrivalMonitoring() {
    const arrivalMonitoring = await tourismApi.getArrivalMonitoringData();
    setBootstrap((current) => ({
      ...current,
      arrivalMonitoring,
    }));
  }

  async function refreshDashboardData() {
    const dashboardData = await tourismApi.getDashboardData(
      bootstrap.touristRecords
    );
    setBootstrap((current) => ({
      ...current,
      dashboardData,
    }));
  }

  async function refreshReportData(filters = {}) {
    const reportData = await tourismApi.getReportsData(
      filters,
      bootstrap.touristRecords,
      bootstrap.referenceTables
    );
    setBootstrap((current) => ({
      ...current,
      reportData,
    }));
  }

  async function refreshComputedData() {
    const [arrivalMonitoring, dashboardData, reportData] = await Promise.all([
      tourismApi.getArrivalMonitoringData(),
      tourismApi.getDashboardData(bootstrap.touristRecords),
      tourismApi.getReportsData(
        bootstrap.reportData.filters,
        bootstrap.touristRecords,
        bootstrap.referenceTables
      ),
    ]);

    setBootstrap((current) => ({
      ...current,
      arrivalMonitoring,
      dashboardData,
      reportData,
    }));
  }

  async function createRecord(payload) {
    const createdRecord = await tourismApi.createTouristRecord(payload);
    setBootstrap((current) => ({
      ...current,
      touristRecords: [createdRecord, ...current.touristRecords],
    }));
    await refreshComputedData();
  }

  async function updateRecord(surveyId, payload) {
    const updatedRecord = await tourismApi.updateTouristRecord(surveyId, payload);
    setBootstrap((current) => ({
      ...current,
      touristRecords: current.touristRecords.map((record) =>
        record.survey_id === surveyId ? { ...record, ...updatedRecord } : record
      ),
    }));
    await refreshComputedData();
  }

  async function deleteRecord(surveyId) {
    await tourismApi.deleteTouristRecord(surveyId);
    setBootstrap((current) => ({
      ...current,
      touristRecords: current.touristRecords.filter(
        (record) => record.survey_id !== surveyId
      ),
    }));
    await refreshComputedData();
  }

  async function createResort(payload) {
    const createdResort = await tourismApi.createResort(payload);
    setBootstrap((current) => ({
      ...current,
      referenceTables: {
        ...current.referenceTables,
        resorts: [...current.referenceTables.resorts, createdResort],
      },
    }));
    await refreshReportData(bootstrap.reportData.filters);
    return createdResort;
  }

  async function updateResort(resortId, payload) {
    const updatedResort = await tourismApi.updateResort(resortId, payload);
    setBootstrap((current) => ({
      ...current,
      referenceTables: {
        ...current.referenceTables,
        resorts: current.referenceTables.resorts.map((resort) =>
          resort.resort_id === resortId ? { ...resort, ...updatedResort } : resort
        ),
      },
    }));
    await refreshReportData(bootstrap.reportData.filters);
    return updatedResort;
  }

  async function deleteResort(resortId) {
    await tourismApi.deleteResort(resortId);
    setBootstrap((current) => ({
      ...current,
      referenceTables: {
        ...current.referenceTables,
        resorts: current.referenceTables.resorts.filter(
          (resort) => resort.resort_id !== resortId
        ),
      },
    }));
    await refreshReportData(bootstrap.reportData.filters);
  }

  async function updateFeedbackEntry(feedbackId, payload) {
    const updatedFeedback = await tourismApi.updateFeedbackEntry(
      feedbackId,
      payload
    );
    setBootstrap((current) => ({
      ...current,
      feedbackEntries: current.feedbackEntries.map((entry) =>
        entry.id === feedbackId ? { ...entry, ...updatedFeedback } : entry
      ),
    }));
    return updatedFeedback;
  }

  async function updateSettings(payload) {
    const updatedSettings = await tourismApi.updateSettings(payload);
    setBootstrap((current) => ({
      ...current,
      settings: updatedSettings,
    }));
    return updatedSettings;
  }

  return (
    <TourismDataContext.Provider
      value={{
        ...bootstrap,
        loading,
        createRecord,
        updateRecord,
        deleteRecord,
        refreshArrivalMonitoring,
        refreshDashboardData,
        refreshReportData,
        createResort,
        updateResort,
        deleteResort,
        updateFeedbackEntry,
        updateSettings,
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
