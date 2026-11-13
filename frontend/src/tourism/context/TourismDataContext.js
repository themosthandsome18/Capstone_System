import {
  applyArchive,
  applyStatus,
  settleArchive,
  updateBookingManagementRecord,
} from "../utils/bookingTableOptimistic";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { tourismApi } from "../services/tourismApi";
import { useVisibleInterval } from "../utils/useVisibleInterval";

const TourismDataContext = createContext(null);
const currentReportingYear = String(new Date().getFullYear());

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
    currentYearOnly: false,
    currentYear: "",
    feePerVisitor: 80,
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
  },
  reportData: {
    filters: {
      year: currentReportingYear,
      type: "resort",
      from: "",
      to: "",
      resort_id: "",
    },
    feePerVisitor: 80,
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
    feePerVisitor: 80,
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
  theme: null,
  apiBaseUrl: "",
};

// Background refresh tuning. Only the booking list changes while staff are watching
// (mobile QR check-ins), so it is the only data polled frequently. Reference tables are
// loaded once at start; feedback is refreshed on a much longer interval.
const BOOKING_POLL_INTERVAL_MS = 30 * 1000;
const FEEDBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;
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

  // A call made while a bootstrap is already in flight reuses that request.
  // React.StrictMode runs the mount effect twice in development, which would
  // otherwise fire two full concurrent bootstraps.
  const loadPromiseRef = useRef(null);

  const loadData = useCallback(() => {
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

    const promise = (async () => {
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
    })().finally(() => {
      loadPromiseRef.current = null;
    });

    loadPromiseRef.current = promise;
    return promise;
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
    // A report-only request (include_questions false) keeps the question
    // answers already loaded: they depend on the filters, not the report type.
    const reportOnly = String(filters.include_questions) === "false";
    setBootstrap((current) => ({
      ...current,
      reportData: reportOnly
        ? { ...reportData, questionAnswers: current.reportData?.questionAnswers || [] }
        : reportData,
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

  // A record is never deleted. Archiving takes it off the Record Management table and nothing else: no count changes, so nothing is marked
  // stale and the touristRecords list keeps it.
  //
  // The table changes AT ONCE, before the server answers (no "Please wait" screen, no list read again): the row goes or is marked, and the
  // "N archived" follows. When the server answers it settles the row and the "N archived" on its word. When it refuses, the table is put back
  // as it was and the error is thrown for the page to show.
  async function changeArchive(surveyId, archived) {
    const year = bootstrapRef.current.bookingManagement?.filters?.year;
    const { undo } = applyArchive(bootstrapRef.current.bookingManagement || {}, surveyId, archived);
    setBootstrap((current) => ({
      ...current,
      bookingManagement: applyArchive(current.bookingManagement || {}, surveyId, archived).next,
    }));

    try {
      const answer = archived
        ? await tourismApi.archiveTouristRecord(surveyId, { year })
        : await tourismApi.unarchiveTouristRecord(surveyId, { year });
      setBootstrap((current) => ({ ...current, bookingManagement: settleArchive(current.bookingManagement || {}, answer) }));
      return answer;
    } catch (error) {
      setBootstrap((current) => ({ ...current, bookingManagement: undo(current.bookingManagement || {}) }));
      throw error;
    }
  }

  const archiveRecord = (surveyId) => changeArchive(surveyId, true);
  const unarchiveRecord = (surveyId) => changeArchive(surveyId, false);

  // Mark as arrived / mark as cancelled: the row and the three cards change at once; the server's record settles it; a refusal puts it back.
  async function setRecordStatus(surveyId, nextStatus) {
    const { undo } = applyStatus(bootstrapRef.current.bookingManagement || {}, surveyId, nextStatus);
    setBootstrap((current) => ({
      ...current,
      bookingManagement: applyStatus(current.bookingManagement || {}, surveyId, nextStatus).next,
    }));

    try {
      const updatedRecord = await tourismApi.updateTouristRecord(surveyId, { status: nextStatus });
      setBootstrap((current) => ({
        ...current,
        touristRecords: current.touristRecords.map((record) =>
          record.survey_id === surveyId ? { ...record, ...updatedRecord } : record
        ),
        bookingManagement: updateBookingManagementRecord(current.bookingManagement, surveyId, updatedRecord),
      }));
      markComputedStale();
      return updatedRecord;
    } catch (error) {
      setBootstrap((current) => ({ ...current, bookingManagement: undo(current.bookingManagement || {}) }));
      throw error;
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

  // Hide / show a review. The server answers with the whole review; it goes
  // into the state, and the destinations are reloaded because hiding changes
  // the destination's rating (a hidden review does not count).
  async function setFeedbackHidden(feedbackId, hidden) {
    setActionLoading(true);
    try {
      const updatedFeedback = hidden
        ? await tourismApi.hideFeedbackEntry(feedbackId)
        : await tourismApi.unhideFeedbackEntry(feedbackId);
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

  const hideFeedbackEntry = (feedbackId) => setFeedbackHidden(feedbackId, true);
  const unhideFeedbackEntry = (feedbackId) =>
    setFeedbackHidden(feedbackId, false);

  // Saves the theme and puts the server's answer straight into the app: the
  // shell and the charts follow it with no reload.
  const saveTheme = useCallback(async (payload) => {
    const theme = await tourismApi.updateTheme(payload);
    setBootstrap((current) => ({ ...current, theme }));
    return theme;
  }, []);

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
        archiveRecord,
        unarchiveRecord,
        setRecordStatus,
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
        uploadResortImage: tourismApi.uploadResortImage,
        updateFeedbackEntry,
        refreshFeedbackEntries: pollFeedback,
        refreshReferenceTables,
        hideFeedbackEntry,
        unhideFeedbackEntry,
        saveTheme,
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
