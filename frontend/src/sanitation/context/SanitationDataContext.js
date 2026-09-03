import { createContext, useContext, useEffect, useState } from "react";
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
  fetchHouseholdBarangays,
  fetchHouseholdDashboard,
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
};

export function SanitationDataProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSanitationData(options = {}) {
    const { includeHouseholds = true } = options;
    setLoading(true);
    setError("");

    try {
      const sanitationPromise = fetchSanitationBootstrap();
      const householdPromise = includeHouseholds
        ? fetchHouseholdBootstrap().catch((err) => {
            console.warn("Deferred household bootstrap warning:", err);
            return null;
          })
        : Promise.resolve(null);

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
      setLoading(false);

      // When household data finishes in background, merge smoothly into state
      householdPromise.then((householdData) => {
        if (householdData) {
          setState((current) => ({
            ...current,
            barangays: householdData.barangays || [],
            householdRecords: householdData.householdRecords || [],
            householdDashboardData:
              householdData.householdDashboardData || null,
          }));
        }
      });
    } catch (requestError) {
      setError(requestError.message || "Unable to load sanitation data.");
      setLoading(false);
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
  }

  useEffect(() => {
    loadSanitationData();
  }, []);

  async function loadHouseholdData() {
    setLoading(true);
    setError("");

    try {
      const [householdData, reportData] = await Promise.all([
        fetchHouseholdBootstrap(),
        fetchSanitationReports(),
      ]);

      setState((current) => ({
        ...current,
        barangays: householdData.barangays || [],
        householdRecords: householdData.householdRecords || [],
        householdDashboardData: householdData.householdDashboardData || null,
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

  async function refreshHouseholdDashboardData() {
    const householdDashboardData = await fetchHouseholdDashboard();

    setState((current) => ({
      ...current,
      householdDashboardData,
    }));

    return householdDashboardData;
  }

  async function refreshHouseholdBarangays() {
    const barangays = await fetchHouseholdBarangays();

    setState((current) => ({
      ...current,
      barangays,
    }));

    return barangays;
  }

  async function refreshHouseholdRecords(params = {}) {
    const householdRecords = await fetchHouseholdRecords(params);

    setState((current) => ({
      ...current,
      householdRecords,
    }));

    return householdRecords;
  }

  async function createEstablishment(payload) {
    setActionLoading(true);
    try {
      const created = await createSanitationEstablishment(payload);
      await loadSanitationData({ includeHouseholds: false });
      return created;
    } finally {
      setActionLoading(false);
    }
  }

  async function updateEstablishment(id, payload) {
    setActionLoading(true);
    try {
      const updated = await updateSanitationEstablishment(id, payload);
      await loadSanitationData({ includeHouseholds: false });
      return updated;
    } finally {
      setActionLoading(false);
    }
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
