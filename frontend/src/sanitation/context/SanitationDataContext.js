import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  createSanitationEstablishment,
  createSanitationInspection,
  createSanitationComplaint,
  createSanitationRenewal,
  deleteSanitationEstablishment,
  deleteSanitationInspection,
  deleteSanitationComplaint,
  deleteSanitationRenewal,
  fetchSanitationBootstrap,
  fetchSanitationDashboard,
  fetchSanitationEstablishments,
  fetchSanitationInspections,
  fetchSanitationComplaints,
  fetchSanitationPermits,
  fetchSanitationRenewals,
  fetchSanitationReports,
  fetchSanitationSubmissions,
  updateSanitationEstablishment,
  updateSanitationInspection,
  updateSanitationComplaint,
  updateSanitationRenewal,
  fetchHouseholdBootstrap,
  fetchHouseholdRecords,
  createHouseholdRecord,
  updateHouseholdRecord,
  deleteHouseholdRecord,
} from "../services/sanitationApi";

const SanitationDataContext = createContext(null);

const initialState = {
  businessTypes: [],
  establishments: [],
  inspections: [],
  dashboardData: null,
  permitData: null,
  renewalData: null,
  complaintData: null,
  submissionData: null,
  reportData: null,
  householdRecords: [],
  barangays: [],
  householdDashboardData: null,
  householdStatus: "idle",
  householdError: "",
  householdHasData: false,
};

export function SanitationDataProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const householdRequest = useRef(0);

  // A complete snapshot owns readiness. Keep the last good snapshot while
  // reloading, but never let consumers treat stale or unavailable data as ready.
  const reloadHouseholds = useCallback(async () => {
    const requestId = ++householdRequest.current;
    setState((current) => requestId === householdRequest.current ? {
      ...current, householdStatus: "loading", householdError: "",
    } : current);

    try {
      const data = await fetchHouseholdBootstrap();
      if (requestId !== householdRequest.current) return null;
      if (!Array.isArray(data?.barangays) || !Array.isArray(data?.householdRecords) ||
          !data?.householdDashboardData || typeof data.householdDashboardData !== "object" ||
          Array.isArray(data.householdDashboardData)) {
        throw new Error("Incomplete household data received. Please retry.");
      }
      setState((current) => requestId === householdRequest.current ? {
        ...current,
        barangays: data.barangays,
        householdRecords: data.householdRecords,
        householdDashboardData: data.householdDashboardData,
        householdStatus: "success",
        householdError: "",
        householdHasData: true,
      } : current);
      return data;
    } catch (requestError) {
      if (requestId !== householdRequest.current) return null;
      const detail = requestError?.details?.detail;
      const message = (typeof detail === "string" && detail) || requestError?.message ||
        "Unable to load household data. Please retry.";
      setState((current) => requestId === householdRequest.current ? {
        ...current, householdStatus: "error", householdError: message,
      } : current);
      return null;
    }
  }, []);

  useEffect(() => () => {
    // Ignore requests belonging to an unmounted or StrictMode-restarted provider.
    householdRequest.current += 1;
  }, []);

  const loadSanitationData = useCallback(async (options = {}) => {
    const { includeHouseholds = true, background = false } = options;
    if (!background) setLoading(true);
    setError("");

    try {
      const sanitationPromise = fetchSanitationBootstrap();
      if (includeHouseholds) reloadHouseholds();

      // Await core sanitation data first to display dashboard/establishments quickly
      const data = await sanitationPromise;

      setState((current) => ({
        ...current,
        businessTypes: data.businessTypes || [],
        establishments: data.establishments || [],
        inspections: data.inspections || [],
        dashboardData: data.dashboardData || null,
        permitData: data.permitData || null,
        renewalData: data.renewalData || null,
        complaintData: data.complaintData || null,
        submissionData: data.submissionData || null,
        reportData: data.reportData || null,
      }));

      // Release loading screen immediately so user can interact with the app right away
      if (!background) setLoading(false);
    } catch (requestError) {
      const message = requestError.message || "Unable to load sanitation data.";
      setError(background
        ? `Establishment saved, but related data could not be refreshed. ${message}`
        : message);
      if (!background) setLoading(false);
    } finally {
      // Preload reportData in background so "Report & Analytics" page loads instantly
      fetchSanitationReports()
        .then((reportData) => {
          setState((current) => ({
            ...current,
            reportData,
          }));
        })
        .catch(() => {});
    }
  }, [reloadHouseholds]);

  useEffect(() => {
    loadSanitationData();
  }, [loadSanitationData]);

  async function loadHouseholdData() {
    setLoading(true);
    setError("");

    try {
      const [, reportData] = await Promise.all([
        reloadHouseholds(),
        fetchSanitationReports(),
      ]);

      setState((current) => ({
        ...current,
        reportData,
      }));
    } catch (requestError) {
      setError(requestError.message || "Unable to load household data.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshDashboardData() {
    const dashboardData = await fetchSanitationDashboard();

    setState((current) => ({
      ...current,
      dashboardData,
    }));

    return dashboardData;
  }

  async function refreshEstablishments() {
    const establishments = await fetchSanitationEstablishments();

    setState((current) => ({
      ...current,
      establishments,
    }));

    return establishments;
  }

  async function refreshInspections() {
    const inspections = await fetchSanitationInspections();

    setState((current) => ({
      ...current,
      inspections,
    }));

    return inspections;
  }

  async function refreshPermitData(params = {}) {
    const permitData = await fetchSanitationPermits(params);

    setState((current) => ({
      ...current,
      permitData,
    }));

    return permitData;
  }

  async function refreshRenewalData(params = {}) {
    const renewalData = await fetchSanitationRenewals(params);

    setState((current) => ({
      ...current,
      renewalData,
    }));

    return renewalData;
  }

  async function refreshComplaintData(params = {}) {
    const complaintData = await fetchSanitationComplaints(params);

    setState((current) => ({
      ...current,
      complaintData,
    }));

    return complaintData;
  }

  async function refreshSubmissionData(params = {}) {
    const submissionData = await fetchSanitationSubmissions(params);

    setState((current) => ({
      ...current,
      submissionData,
    }));

    return submissionData;
  }

  async function refreshReportData(params = {}) {
    const reportData = await fetchSanitationReports(params);

    setState((current) => ({
      ...current,
      reportData,
    }));

    return reportData;
  }

  // Legacy full-data refresh entry points share the same snapshot generation.
  async function refreshHouseholdDashboardData() {
    const data = await reloadHouseholds();
    return data?.householdDashboardData ?? null;
  }

  async function refreshHouseholdBarangays() {
    const data = await reloadHouseholds();
    return data?.barangays ?? null;
  }

  async function refreshHouseholdRecords(params = {}) {
    if (Object.values(params).some((value) => value !== undefined && value !== null && value !== "")) {
      // A filtered result is a query result, not the complete report dataset.
      return fetchHouseholdRecords(params);
    }
    const data = await reloadHouseholds();
    return data?.householdRecords ?? null;
  }

  // Establishment forms own their pending state. A post-save refresh must not
  // unmount the modal or activate the shell's connection/loading screens.
  async function createEstablishment(payload) {
    const created = await createSanitationEstablishment(payload);
    setState((current) => ({
      ...current,
      establishments: [...current.establishments, created],
    }));
    await loadSanitationData({ includeHouseholds: false, background: true });
    return created;
  }

  async function updateEstablishment(id, payload) {
    const updated = await updateSanitationEstablishment(id, payload);
    setState((current) => ({
      ...current,
      establishments: current.establishments.map((item) =>
        item.id === id ? { ...item, ...updated } : item
      ),
    }));
    await loadSanitationData({ includeHouseholds: false, background: true });
    return updated;
  }

  async function deleteEstablishment(id) {
    setActionLoading(true);
    try {
      await deleteSanitationEstablishment(id);
      await loadSanitationData({ includeHouseholds: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function createInspection(payload) {
    setActionLoading(true);
    try {
      const created = await createSanitationInspection(payload);
      await loadSanitationData({ includeHouseholds: false });
      return created;
    } finally {
      setActionLoading(false);
    }
  }

  async function updateInspection(id, payload) {
    setActionLoading(true);
    try {
      const updated = await updateSanitationInspection(id, payload);
      await loadSanitationData({ includeHouseholds: false });
      return updated;
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteInspection(id) {
    setActionLoading(true);
    try {
      await deleteSanitationInspection(id);
      await loadSanitationData({ includeHouseholds: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function createRenewal(payload) {
    setActionLoading(true);
    try {
      const created = await createSanitationRenewal(payload);
      await loadSanitationData({ includeHouseholds: false });
      return created;
    } finally {
      setActionLoading(false);
    }
  }

  async function updateRenewal(id, payload) {
    setActionLoading(true);
    try {
      const updated = await updateSanitationRenewal(id, payload);
      await loadSanitationData({ includeHouseholds: false });
      return updated;
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteRenewal(id) {
    setActionLoading(true);
    try {
      await deleteSanitationRenewal(id);
      await loadSanitationData({ includeHouseholds: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function createComplaint(payload) {
    setActionLoading(true);
    try {
      const created = await createSanitationComplaint(payload);
      await refreshComplaintData();
      await refreshDashboardData();
      return created;
    } finally {
      setActionLoading(false);
    }
  }

  async function updateComplaint(id, payload) {
    setActionLoading(true);
    try {
      const updated = await updateSanitationComplaint(id, payload);
      await refreshComplaintData();
      await refreshDashboardData();
      return updated;
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteComplaint(id) {
    setActionLoading(true);
    try {
      await deleteSanitationComplaint(id);
      await refreshComplaintData();
      await refreshDashboardData();
    } finally {
      setActionLoading(false);
    }
  }

  async function createHousehold(payload) {
    setActionLoading(true);
    try {
      const created = await createHouseholdRecord(payload);
      await loadHouseholdData();
      return created;
    } finally {
      setActionLoading(false);
    }
  }

  async function updateHousehold(id, payload) {
    setActionLoading(true);
    try {
      const updated = await updateHouseholdRecord(id, payload);
      await loadHouseholdData();
      return updated;
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteHousehold(id) {
    setActionLoading(true);
    try {
      await deleteHouseholdRecord(id);
      await loadHouseholdData();
    } finally {
      setActionLoading(false);
    }
  }

  const value = {
    ...state,
    loading,
    actionLoading,
    householdReady: state.householdStatus === "success",
    reloadHouseholds,
    error,
    reload: loadSanitationData,

    refreshDashboardData,
    refreshEstablishments,
    refreshInspections,
    refreshPermitData,
    refreshRenewalData,
    refreshComplaintData,
    refreshSubmissionData,
    refreshReportData,

    refreshHouseholdDashboardData,
    refreshHouseholdBarangays,
    refreshHouseholdRecords,

    createEstablishment,
    updateEstablishment,
    deleteEstablishment,

    createInspection,
    updateInspection,
    deleteInspection,

    createRenewal,
    updateRenewal,
    deleteRenewal,

    createComplaint,
    updateComplaint,
    deleteComplaint,

    createHousehold,
    updateHousehold,
    deleteHousehold,
  };

  return (
    <SanitationDataContext.Provider value={value}>
      {children}
    </SanitationDataContext.Provider>
  );
}

export function useSanitationData() {
  const context = useContext(SanitationDataContext);

  if (!context) {
    throw new Error(
      "useSanitationData must be used within a SanitationDataProvider."
    );
  }

  return context;
}
