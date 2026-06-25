import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { tourismApi } from "../services/tourismApi";

const TourismDataContext = createContext(null);
const currentReportingYear = String(new Date().getFullYear());

const bookingSummaryKeysByStatus = {
  pending: "pending",
  arrived: "arrived",
  no_show: "noShow",
};

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
  bookingManagement: {
    filters: {
      year: currentReportingYear,
      search: "",
      status: "",
      resort_id: "",
      region_id: "",
      province_id: "",
      from: "",
      to: "",
    },
    summary: {
      verifiedEntries: 0,
      pending: 0,
      arrived: 0,
      noShow: 0,
    },
    pagination: {
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      hasPrevious: false,
      hasNext: false,
      showingStart: 0,
      showingEnd: 0,
    },
    rows: [],
  },
  feedbackEntries: [],
  dashboardData: {
    filters: { year: currentReportingYear },
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
    filters: {
      year: currentReportingYear,
      type: "resort",
      from: "",
      to: "",
      resort_id: "",
    },
    feePerVisitor: 300,
    rows: [],
    questionAnswers: [],
    totals: { visitors: 0, revenue: 0, avg: 0 },
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
    filters: { year: currentReportingYear, from: "", to: "" },
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
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const response = await tourismApi.getBootstrapData();

        if (mounted) {
          setBootstrap(response);
          setError("");
        }
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message || "Unable to load tourism data.");
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

  const bootstrapRef = useRef(bootstrap);
  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  const pollLatestData = useCallback(async () => {
    try {
      const currentBootstrap = bootstrapRef.current;
      const currentFilters = currentBootstrap.bookingManagement?.filters || {};
      const currentPage = currentBootstrap.bookingManagement?.pagination?.page || 1;
      const currentPageSize = currentBootstrap.bookingManagement?.pagination?.pageSize || 10;
      const bookingParams = {
        ...currentFilters,
        page: currentPage,
        pageSize: currentPageSize,
      };

      const [bootstrapData, bookingData] = await Promise.all([
        tourismApi.getBootstrapData(),
        tourismApi.getBookingManagementData(bookingParams)
      ]);

      setBootstrap((current) => {
        const activeFilters = current.bookingManagement?.filters || {};
        const activePage = current.bookingManagement?.pagination?.page || 1;

        return {
          ...current,
          referenceTables: bootstrapData.referenceTables,
          feedbackEntries: bootstrapData.feedbackEntries,
          bookingManagement: {
            ...bookingData,
            filters: activeFilters,
            pagination: {
              ...bookingData.pagination,
              page: activePage
            }
          }
        };
      });
    } catch (err) {
      // Quietly handle connection drops in background
    }
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      pollLatestData();
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(intervalId);
  }, [pollLatestData]);

  const refreshArrivalMonitoring = useCallback(async function refreshArrivalMonitoring(
    params = {}
  ) {
    const arrivalMonitoring = await tourismApi.getArrivalMonitoringData(params);
    setBootstrap((current) => ({
      ...current,
      arrivalMonitoring,
    }));
    return arrivalMonitoring;
  }, []);

  async function refreshDashboardData(params = {}) {
    const dashboardData = await tourismApi.getDashboardData(params);
    setBootstrap((current) => ({
      ...current,
      dashboardData,
    }));
  }

  async function refreshReportData(filters = {}) {
    const reportData = await tourismApi.getReportsData(filters);
    setBootstrap((current) => ({
      ...current,
      reportData,
    }));
  }

  const refreshBookingManagement = useCallback(async function refreshBookingManagement(
    params = {}
  ) {
    const bookingManagement = await tourismApi.getBookingManagementData(params);
    setBootstrap((current) => ({
      ...current,
      bookingManagement,
    }));
    return bookingManagement;
  }, []);

  async function refreshComputedData() {
    const [arrivalMonitoring, dashboardData, reportData] = await Promise.all([
      tourismApi.getArrivalMonitoringData(bootstrap.arrivalMonitoring.filters),
      tourismApi.getDashboardData(bootstrap.dashboardData.filters),
      tourismApi.getReportsData(bootstrap.reportData.filters),
    ]);

    setBootstrap((current) => ({
      ...current,
      arrivalMonitoring,
      dashboardData,
      reportData,
    }));
  }

  async function refreshReferenceTables() {
    try {
      const response = await tourismApi.getBootstrapData();
      setBootstrap((current) => ({
        ...current,
        referenceTables: response.referenceTables,
      }));
    } catch (err) {
      console.error("Failed to refresh reference tables", err);
    }
  }

  async function createRecord(payload) {
    const createdRecord = await tourismApi.createTouristRecord(payload);
    setBootstrap((current) => ({
      ...current,
      touristRecords: [createdRecord, ...current.touristRecords],
    }));
    await refreshComputedData();
    await refreshReferenceTables();
  }

  async function updateRecord(surveyId, payload, options = {}) {
    const { refreshComputed = true } = options;
    const updatedRecord = await tourismApi.updateTouristRecord(surveyId, payload);
    setBootstrap((current) => ({
      ...current,
      touristRecords: current.touristRecords.map((record) =>
        record.survey_id === surveyId ? { ...record, ...updatedRecord } : record
      ),
      bookingManagement: updateBookingManagementRecord(
        current.bookingManagement,
        surveyId,
        updatedRecord
      ),
    }));

    if (refreshComputed) {
      await refreshComputedData();
    }
    await refreshReferenceTables();

    return updatedRecord;
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
    await refreshReferenceTables();
  }

  async function previewOnlineBookingImport(file, options = {}) {
    return tourismApi.previewOnlineBookingImport(file, {
      ...options,
      action: "preview",
    });
  }

  async function importOnlineBookingFile(file, options = {}) {
    const result = await tourismApi.previewOnlineBookingImport(file, {
      ...options,
      action: "import",
    });
    const response = await tourismApi.getBootstrapData();
    setBootstrap(response);
    return result;
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
    await refreshReferenceTables();
    return updatedFeedback;
  }

  return (
    <TourismDataContext.Provider
      value={{
        ...bootstrap,
        loading,
        error,
        createRecord,
        updateRecord,
        deleteRecord,
        previewOnlineBookingImport,
        importOnlineBookingFile,
        refreshArrivalMonitoring,
        refreshBookingManagement,
        refreshDashboardData,
        refreshReportData,
        createResort,
        updateResort,
        deleteResort,
        updateFeedbackEntry,
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

function updateBookingManagementRecord(bookingManagement, surveyId, updatedRecord) {
  const currentRows = bookingManagement.rows || [];
  const previousRow = currentRows.find(
    (record) => record.survey_id === surveyId
  );

  if (!previousRow) {
    return bookingManagement;
  }

  const nextRow = { ...previousRow, ...updatedRecord };
  const statusFilter = bookingManagement.filters?.status || "";
  const previousStatus = previousRow.status;
  const nextStatus = nextRow.status;
  const rows = currentRows
    .map((record) => (record.survey_id === surveyId ? nextRow : record))
    .filter((record) => !statusFilter || record.status === statusFilter);
  const summary = adjustBookingSummary(
    bookingManagement.summary,
    previousStatus,
    nextStatus
  );
  const rowWasRemoved = rows.length < currentRows.length;

  return {
    ...bookingManagement,
    rows,
    summary,
    pagination: {
      ...bookingManagement.pagination,
      total: rowWasRemoved
        ? Math.max((bookingManagement.pagination.total || 0) - 1, 0)
        : bookingManagement.pagination.total,
    },
  };
}

function adjustBookingSummary(summary, previousStatus, nextStatus) {
  if (!previousStatus || !nextStatus || previousStatus === nextStatus) {
    return summary;
  }

  const previousKey = bookingSummaryKeysByStatus[previousStatus];
  const nextKey = bookingSummaryKeysByStatus[nextStatus];
  const nextSummary = { ...summary };

  if (previousKey) {
    nextSummary[previousKey] = Math.max((nextSummary[previousKey] || 0) - 1, 0);
  }

  if (nextKey) {
    nextSummary[nextKey] = (nextSummary[nextKey] || 0) + 1;
  }

  return nextSummary;
}
