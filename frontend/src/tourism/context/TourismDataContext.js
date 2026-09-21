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
    filters: { year: currentReportingYear, date: "", resort_id: "all", from: "", to: "" },
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

// Background refresh tuning. Only the booking list changes while staff are watching
// (mobile QR check-ins), so it is the only data polled frequently. Reference tables are
// loaded once at start; feedback is refreshed on a much longer interval.
const BOOKING_POLL_INTERVAL_MS = 30 * 1000;
const FEEDBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;
// Ignore a visibility refresh if a run finished this recently (rapid tab switching).
const VISIBLE_REFRESH_MIN_GAP_MS = 5 * 1000;

// Runs `task` every `intervalMs`, but:
//  - never overlaps itself: the next run is scheduled only after the previous one finishes
//  - pauses completely while the browser tab is hidden
//  - refreshes once right away when the tab becomes visible again
function useVisibleInterval(task, intervalMs) {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let timer = null;
    let running = false;
    let stopped = false;
    let lastFinishedAt = 0;

    const isHidden = () => document.visibilityState === "hidden";

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (stopped || isHidden()) {
        return;
      }
      timer = setTimeout(run, intervalMs);
    };

    async function run() {
      timer = null;
      // If a run is in flight, its `finally` will schedule the next one.
      if (stopped || isHidden() || running) {
        return;
      }
      running = true;
      try {
        await taskRef.current();
      } catch (err) {
        // Background refresh: stay quiet on connection drops.
      } finally {
        running = false;
        lastFinishedAt = Date.now();
        schedule();
      }
    }

    function handleVisibilityChange() {
      clearTimer();
      if (isHidden()) {
        return;
      }
      if (Date.now() - lastFinishedAt < VISIBLE_REFRESH_MIN_GAP_MS) {
        schedule();
        return;
      }
      run();
    }

    schedule();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);
}

export function TourismDataProvider({ children }) {
  const [bootstrap, setBootstrap] = useState(emptyBootstrap);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // Arrival monitoring, dashboard and reports are the heavy computed views. A record change
  // only marks them stale (bumps dataVersionRef); each is refetched when its page is opened.
  const dataVersionRef = useRef(0);
  const freshVersionRef = useRef({ arrivalMonitoring: 0, dashboardData: 0, reportData: 0 });
  const staleRefreshRef = useRef({});

  const markComputedStale = useCallback(() => {
    dataVersionRef.current += 1;
  }, []);

  const markFresh = useCallback((keys, version) => {
    keys.forEach((key) => {
      freshVersionRef.current[key] = Math.max(freshVersionRef.current[key], version);
    });
  }, []);

  const isComputedDataStale = useCallback(
    (key) => freshVersionRef.current[key] < dataVersionRef.current,
    []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const version = dataVersionRef.current;
    try {
      const response = await tourismApi.getBootstrapData();
      setBootstrap(response);
      markFresh(["arrivalMonitoring", "dashboardData", "reportData"], version);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load tourism data.");
    } finally {
      setLoading(false);
    }
  }, [markFresh]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const bootstrapRef = useRef(bootstrap);
  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  const loadingRef = useRef(true);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Live data: only the booking list (the mobile app can change it while staff watch).
  const pollBookingList = useCallback(async () => {
    // Don't stack a background refresh on top of the initial full load.
    if (loadingRef.current) {
      return;
    }

    const currentBootstrap = bootstrapRef.current;
    const currentFilters = currentBootstrap.bookingManagement?.filters || {};
    const currentPage = currentBootstrap.bookingManagement?.pagination?.page || 1;
    const currentPageSize = currentBootstrap.bookingManagement?.pagination?.pageSize || 10;

    const bookingData = await tourismApi.getBookingManagementData({
      ...currentFilters,
      page: currentPage,
      pageSize: currentPageSize,
    });

    setBootstrap((current) => {
      const activeFilters = current.bookingManagement?.filters || {};
      const activePage = current.bookingManagement?.pagination?.page || 1;

      return {
        ...current,
        bookingManagement: {
          ...bookingData,
          filters: activeFilters,
          pagination: {
            ...bookingData.pagination,
            page: activePage,
          },
        },
      };
    });
  }, []);

  // Slow data: feedback comes from occasional visitor submissions.
  const pollFeedback = useCallback(async () => {
    if (loadingRef.current) {
      return;
    }

    const feedbackEntries = await tourismApi.getFeedbackEntries();
    if (!Array.isArray(feedbackEntries)) {
      return;
    }

    setBootstrap((current) => ({ ...current, feedbackEntries }));
  }, []);

  useVisibleInterval(pollFeedback, FEEDBACK_POLL_INTERVAL_MS);

  const refreshArrivalMonitoring = useCallback(async function refreshArrivalMonitoring(
    params = {}
  ) {
    const version = dataVersionRef.current;
    const arrivalMonitoring = await tourismApi.getArrivalMonitoringData(params);
    setBootstrap((current) => ({
      ...current,
      arrivalMonitoring,
    }));
    markFresh(["arrivalMonitoring"], version);
    return arrivalMonitoring;
  }, [markFresh]);

  const refreshDashboardData = useCallback(async function refreshDashboardData(params = {}) {
    const version = dataVersionRef.current;
    const dashboardData = await tourismApi.getDashboardData(params);
    setBootstrap((current) => ({
      ...current,
      dashboardData,
    }));
    markFresh(["dashboardData"], version);
  }, [markFresh]);

  const refreshReportData = useCallback(async function refreshReportData(filters = {}) {
    const version = dataVersionRef.current;
    const reportData = await tourismApi.getReportsData(filters);
    setBootstrap((current) => ({
      ...current,
      reportData,
    }));
    markFresh(["reportData"], version);
  }, [markFresh]);

  // Called when a page is opened: refetch only if a record changed since it was last loaded.
  const refreshWhenStale = useCallback(
    (key, run) => {
      if (!isComputedDataStale(key)) {
        return Promise.resolve(false);
      }
      if (!staleRefreshRef.current[key]) {
        staleRefreshRef.current[key] = run()
          .then(() => true)
          .finally(() => {
            delete staleRefreshRef.current[key];
          });
      }
      return staleRefreshRef.current[key];
    },
    [isComputedDataStale]
  );

  const refreshArrivalMonitoringIfStale = useCallback(
    () =>
      refreshWhenStale("arrivalMonitoring", () =>
        refreshArrivalMonitoring(bootstrapRef.current.arrivalMonitoring?.filters || {})
      ),
    [refreshWhenStale, refreshArrivalMonitoring]
  );

  const refreshDashboardIfStale = useCallback(
    () =>
      refreshWhenStale("dashboardData", () =>
        refreshDashboardData(bootstrapRef.current.dashboardData?.filters || {})
      ),
    [refreshWhenStale, refreshDashboardData]
  );

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

  async function refreshReferenceTables() {
    try {
      const referenceTables = await tourismApi.getReferenceTables();
      setBootstrap((current) => ({
        ...current,
        referenceTables,
      }));
    } catch (err) {
      console.error("Failed to refresh reference tables", err);
    }
  }

  async function createRecord(payload) {
    setActionLoading(true);
    try {
      const createdRecord = await tourismApi.createTouristRecord(payload);
      setBootstrap((current) => ({
        ...current,
        touristRecords: [createdRecord, ...current.touristRecords],
      }));
      // The record is saved. Heavy pages refetch when next opened, not now.
      markComputedStale();
      return createdRecord;
    } finally {
      setActionLoading(false);
    }
  }

  async function updateRecord(surveyId, payload, options = {}) {
    setActionLoading(true);
    try {
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
        markComputedStale();
      }

      return updatedRecord;
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteRecord(surveyId) {
    setActionLoading(true);
    try {
      await tourismApi.deleteTouristRecord(surveyId);
      setBootstrap((current) => ({
        ...current,
        touristRecords: current.touristRecords.filter(
          (record) => record.survey_id !== surveyId
        ),
      }));
      markComputedStale();
      // Resort figures depend on the records; refresh them in the background.
      refreshReferenceTables();
    } finally {
      setActionLoading(false);
    }
  }

  async function previewOnlineBookingImport(file, options = {}) {
    return tourismApi.previewOnlineBookingImport(file, {
      ...options,
      action: "preview",
    });
  }

  async function importOnlineBookingFile(file, options = {}) {
    setActionLoading(true);
    try {
      const result = await tourismApi.previewOnlineBookingImport(file, {
        ...options,
        action: "import",
      });
      const version = dataVersionRef.current;
      const response = await tourismApi.getBootstrapData();
      setBootstrap(response);
      markFresh(["arrivalMonitoring", "dashboardData", "reportData"], version);
      return result;
    } finally {
      setActionLoading(false);
    }
  }

  async function createResort(payload) {
    setActionLoading(true);
    try {
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
    } finally {
      setActionLoading(false);
    }
  }

  async function updateResort(resortId, payload) {
    setActionLoading(true);
    try {
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
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteResort(resortId) {
    setActionLoading(true);
    try {
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
    } finally {
      setActionLoading(false);
    }
  }

  async function updateFeedbackEntry(feedbackId, payload) {
    setActionLoading(true);
    try {
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
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <TourismDataContext.Provider
      value={{
        ...bootstrap,
        loading,
        actionLoading,
        error,
        reload: loadData,
        createRecord,
        updateRecord,
        deleteRecord,
        previewOnlineBookingImport,
        importOnlineBookingFile,
        refreshArrivalMonitoring,
        refreshArrivalMonitoringIfStale,
        refreshBookingManagement,
        refreshDashboardData,
        refreshDashboardIfStale,
        refreshReportData,
        isComputedDataStale,
        pollBookingList,
        createResort,
        updateResort,
        deleteResort,
        uploadResortImage: tourismApi.uploadResortImage,
        updateFeedbackEntry,
      }}
    >
      {children}
    </TourismDataContext.Provider>
  );
}

// Live booking-list refresh. Only the Booking Management page calls this, so the list is
// polled only while that page is open (and the tab is visible).
export function useBookingListPolling() {
  const { pollBookingList } = useTourismData();
  useVisibleInterval(pollBookingList, BOOKING_POLL_INTERVAL_MS);
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
