import {
  API_BASE_URL,
  apiRequest,
  buildQueryString,
} from "../../shared/apiClient";
import cagbaleteImage from "../assets/Cagbalete.jpg";
import dampalitanImage from "../assets/DampalitanIsland.jpg";
import kwebangLampasImage from "../assets/KwebangLampas.jpg";
import maubanLighthouseImage from "../assets/Maubanlighthouse.jpg";
import mtPinagbanderahanImage from "../assets/Mt.Pinagbanderahan.jpg";
import putingBuhanginImage from "../assets/PutingBuhangin.jpg";

const resortImagesByKey = {
  cagbalete: cagbaleteImage,
  "dampalitan-island": dampalitanImage,
  "kwebang-lampas": kwebangLampasImage,
  "mauban-lighthouse": maubanLighthouseImage,
  "mt-pinagbanderahan": mtPinagbanderahanImage,
  "puting-buhangin": putingBuhanginImage,
};

const emptyReferenceTables = {
  countries: [],
  regions: [],
  provinces: [],
  itineraries: [],
  resorts: [],
  travelModes: [],
  boatTypes: [],
  visitPurposes: [],
};

const emptyDashboardData = {
  filters: { year: "2025" },
  reportingDate: "",
  feePerVisitor: 300,
  metrics: {
    todayArrivals: 0,
    weekArrivals: 0,
    monthArrivals: 0,
    totalRevenueCollected: 0,
    pendingForReportingDate: 0,
    noShowRate: 0,
    topResortThisMonth: "No arrivals yet",
    topOriginThisMonth: "No arrivals yet",
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
};

const emptyReportData = {
  filters: { year: "2025", type: "resort", from: "", to: "", resort_id: "" },
  feePerVisitor: 300,
  rows: [],
  questionAnswers: [],
  totals: { visitors: 0, revenue: 0, avg: 0 },
};

const emptyArrivalMonitoring = {
  filters: { year: "2025", from: "", to: "" },
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
};

const emptyBookingManagement = {
  filters: {
    year: "2025",
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
};

function addResortImage(resort) {
  const imageKey = resort.image_key || getImageKeyFromName(resort.resort_name);

  return {
    ...resort,
    image: resort.image || resortImagesByKey[imageKey] || "",
  };
}

function getImageKeyFromName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/mt\./g, "mt")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeBookingManagement(payload = {}) {
  return {
    ...emptyBookingManagement,
    ...payload,
    filters: {
      ...emptyBookingManagement.filters,
      ...(payload.filters || {}),
    },
    summary: {
      ...emptyBookingManagement.summary,
      ...(payload.summary || {}),
    },
    pagination: {
      ...emptyBookingManagement.pagination,
      ...(payload.pagination || {}),
    },
    rows: payload.rows || [],
  };
}

function normalizeArrivalMonitoring(payload = {}) {
  return {
    ...emptyArrivalMonitoring,
    ...payload,
    filters: {
      ...emptyArrivalMonitoring.filters,
      ...(payload.filters || {}),
    },
    summary: {
      ...emptyArrivalMonitoring.summary,
      ...(payload.summary || {}),
    },
    dailyTotals: {
      ...emptyArrivalMonitoring.dailyTotals,
      ...(payload.dailyTotals || {}),
    },
    rows: payload.rows || [],
  };
}

function normalizeReportData(payload = {}) {
  return {
    ...emptyReportData,
    ...payload,
    filters: {
      ...emptyReportData.filters,
      ...(payload.filters || {}),
    },
    totals: {
      ...emptyReportData.totals,
      ...(payload.totals || {}),
    },
    rows: payload.rows || [],
    questionAnswers: payload.questionAnswers || [],
  };
}

function mergeBootstrapData(remote = {}) {
  const remoteReferenceTables = remote.referenceTables || {};
  const remoteResorts = (remoteReferenceTables.resorts || []).map(addResortImage);
  const referenceTables = {
    ...emptyReferenceTables,
    ...remoteReferenceTables,
    resorts: remoteResorts,
  };

  return {
    referenceTables,
    touristRecords: remote.touristRecords || [],
    bookingManagement: normalizeBookingManagement(remote.bookingManagement),
    feedbackEntries: remote.feedbackEntries || [],
    analytics: remote.analytics || {},
    dashboardAlerts: remote.dashboardAlerts || [],
    dashboardData: {
      ...emptyDashboardData,
      ...(remote.dashboardData || {}),
      filters: {
        ...emptyDashboardData.filters,
        ...(remote.dashboardData?.filters || {}),
      },
    },
    reportData: normalizeReportData(remote.reportData),
    arrivalMonitoring: normalizeArrivalMonitoring(remote.arrivalMonitoring),
    apiBaseUrl: API_BASE_URL,
  };
}

function isBackendValidationError(error) {
  return Boolean(error?.status);
}

export const tourismApi = {
  async getBootstrapData() {
    const remote = await apiRequest("/bootstrap/");
    return mergeBootstrapData(remote);
  },

  async getBookingManagementData(params = {}) {
    const query = buildQueryString({
      search: params.search,
      year: params.year,
      status: params.status,
      resort_id: params.resort_id,
      region_id: params.region_id,
      province_id: params.province_id,
      from: params.from,
      to: params.to,
      page: params.page,
      page_size: params.pageSize || params.page_size,
    });

    const payload = await apiRequest(`/booking-management/${query}`);
    return normalizeBookingManagement(payload);
  },

  async getArrivalMonitoringData(params = {}) {
    const query = buildQueryString({
      year: params.year,
      from: params.from,
      to: params.to,
    });

    return normalizeArrivalMonitoring(
      await apiRequest(`/arrival-monitoring/${query}`)
    );
  },

  async getDashboardData(params = {}) {
    const query = buildQueryString({
      year: params.year,
    });

    return apiRequest(`/dashboard/${query}`);
  },

  async getReportsData(filters = {}) {
    const query = buildQueryString({
      type: filters.type,
      year: filters.year,
      from: filters.from,
      to: filters.to,
      resort_id: filters.resortId || filters.resort_id,
      include_questions: filters.include_questions,
    });

    return normalizeReportData(await apiRequest(`/reports/${query}`));
  },

  async createTouristRecord(payload) {
    return apiRequest("/tourist-records/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateTouristRecord(id, payload) {
    return apiRequest(`/tourist-records/${encodeURIComponent(id)}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteTouristRecord(id) {
    await apiRequest(`/tourist-records/${encodeURIComponent(id)}/`, {
      method: "DELETE",
    });
    return { id };
  },

  async previewOnlineBookingImport(file, options = {}) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", options.action || "preview");
    formData.append("status", options.status || "pending");

    if (options.limit) {
      formData.append("limit", String(options.limit));
    }

    return apiRequest("/online-booking-import/", {
      method: "POST",
      body: formData,
    });
  },

  async getFeedbackEntries() {
    return apiRequest("/feedback/");
  },

  async updateFeedbackEntry(id, payload) {
    return apiRequest(`/feedback/${encodeURIComponent(id)}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async createResort(payload) {
    const created = await apiRequest("/resorts/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return addResortImage(created);
  },

  async updateResort(id, payload) {
    const updated = await apiRequest(`/resorts/${encodeURIComponent(id)}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return addResortImage(updated);
  },

  async deleteResort(id) {
    try {
      await apiRequest(`/resorts/${encodeURIComponent(id)}/`, {
        method: "DELETE",
      });
      return { id };
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      throw error;
    }
  },
};
