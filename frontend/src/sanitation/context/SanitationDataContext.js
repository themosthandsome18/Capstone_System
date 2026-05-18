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
  householdDashboardData: null,
};

export function SanitationDataProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSanitationData() {
    setLoading(true);
    setError("");

    try {
      const data = await fetchSanitationBootstrap();
      const householdData = await fetchHouseholdBootstrap();

      setState({
        businessTypes: data.businessTypes || [],
        establishments: data.establishments || [],
        inspections: data.inspections || [],
        dashboardData: data.dashboardData || null,
        permitData: data.permitData || null,
        renewalData: data.renewalData || null,
        complaintData: data.complaintData || null,
        submissionData: data.submissionData || null,
        reportData: data.reportData || null,
        householdRecords: householdData.householdRecords || [],
        householdDashboardData: householdData.householdDashboardData || null,
      });
    } catch (requestError) {
      setError(requestError.message || "Unable to load sanitation data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSanitationData();
  }, []);

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

  async function refreshHouseholdRecords() {
    const householdRecords = await fetchHouseholdRecords();

    setState((current) => ({
      ...current,
      householdRecords,
    }));

    return householdRecords;
  }

  async function createEstablishment(payload) {
    const created = await createSanitationEstablishment(payload);
    await loadSanitationData();
    return created;
  }

  async function updateEstablishment(id, payload) {
    const updated = await updateSanitationEstablishment(id, payload);
    await loadSanitationData();
    return updated;
  }

  async function deleteEstablishment(id) {
    await deleteSanitationEstablishment(id);
    await loadSanitationData();
  }

  async function createInspection(payload) {
    const created = await createSanitationInspection(payload);
    await loadSanitationData();
    return created;
  }

  async function updateInspection(id, payload) {
    const updated = await updateSanitationInspection(id, payload);
    await loadSanitationData();
    return updated;
  }

  async function deleteInspection(id) {
    await deleteSanitationInspection(id);
    await loadSanitationData();
  }

  async function createRenewal(payload) {
    const created = await createSanitationRenewal(payload);
    await loadSanitationData();
    return created;
  }

  async function updateRenewal(id, payload) {
    const updated = await updateSanitationRenewal(id, payload);
    await loadSanitationData();
    return updated;
  }

  async function deleteRenewal(id) {
    await deleteSanitationRenewal(id);
    await loadSanitationData();
  }

  async function createComplaint(payload) {
    const created = await createSanitationComplaint(payload);
    await loadSanitationData();
    return created;
  }

  async function updateComplaint(id, payload) {
    const updated = await updateSanitationComplaint(id, payload);
    await loadSanitationData();
    return updated;
  }

  async function deleteComplaint(id) {
    await deleteSanitationComplaint(id);
    await loadSanitationData();
  }

  async function createHousehold(payload) {
    const created = await createHouseholdRecord(payload);
    await loadSanitationData();
    return created;
  }

  async function updateHousehold(id, payload) {
    const updated = await updateHouseholdRecord(id, payload);
    await loadSanitationData();
    return updated;
  }

  async function deleteHousehold(id) {
    await deleteHouseholdRecord(id);
    await loadSanitationData();
  }

  const value = {
    ...state,
    loading,
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
