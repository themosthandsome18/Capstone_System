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
  (process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000/api").replace(
    /\/$/,
    ""
  );

const delay = (payload) =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(payload), 150);
  });

const mockBootstrapData = () => ({
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
  dashboardData: buildDashboardData(touristRecords),
  reportData: buildReportData(touristRecords, { resorts }),
  settings: {
    municipality_name: "Municipality of Mauban",
    province: "Quezon",
    tourism_office_contact: "+63 42 XXX XXXX",
    tourism_office_email: "tourism@mauban.gov.ph",
    api_base_url: "https://api.mauban-tourism.gov.ph/v1",
  },
  apiBaseUrl: API_BASE_URL,
});

function buildArrivalMonitoringData(records = touristRecords, referenceTables = {}) {
  const feePerVisitor = 300;
  const resortsById = (referenceTables.resorts || resorts).reduce(
    (lookup, resort) => {
      lookup[resort.resort_id] = resort.resort_name;
      return lookup;
    },
    {}
  );
  const arrivedRecords = records.filter(
    (record) => !record.status || record.status === "arrived"
  );
  const rows = arrivedRecords
    .map((record) => {
      const sameDay = record.total_visitors >= 5 ? record.total_visitors : 0;
      const overnight = sameDay ? 0 : record.total_visitors;
      const feePaid = record.total_visitors * feePerVisitor;

      return {
        survey_id: record.survey_id,
        date: record.arrival_date,
        group: record.full_name,
        male: record.total_male,
        female: record.total_female,
        overnight,
        sameDay,
        resort: resortsById[record.resort_id] || "--",
        feePaid,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const summary = rows.reduce(
    (totals, row) => ({
      totalArrivals: totals.totalArrivals + row.male + row.female,
      totalMale: totals.totalMale + row.male,
      totalFemale: totals.totalFemale + row.female,
      overnight: totals.overnight + row.overnight,
      sameDay: totals.sameDay + row.sameDay,
      feesCollected: totals.feesCollected + row.feePaid,
    }),
    {
      totalArrivals: 0,
      totalMale: 0,
      totalFemale: 0,
      overnight: 0,
      sameDay: 0,
      feesCollected: 0,
    }
  );

  return {
    feePerVisitor,
    reportDate: rows[0]?.date || "",
    summary,
    rows,
    dailyTotals: {
      male: summary.totalMale,
      female: summary.totalFemale,
      overnight: summary.overnight,
      sameDay: summary.sameDay,
      feesCollected: summary.feesCollected,
    },
  };
}

const localResortImagesById = resorts.reduce((images, resort) => {
  images[resort.resort_id] = resort.image;
  return images;
}, {});

function addResortImage(resort) {
  return {
    ...resort,
    image:
      resort.image ||
      localResortImagesById[resort.resort_id] ||
      resorts[0]?.image ||
      "",
  };
}

function getIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseRecordDate(value) {
  return new Date(`${value}T00:00:00`);
}

function sumField(records, field) {
  return records.reduce((total, record) => total + Number(record[field] || 0), 0);
}

function arrivedRecords(records = []) {
  return records.filter((record) => !record.status || record.status === "arrived");
}

function buildDashboardData(records = touristRecords) {
  const arrived = arrivedRecords(records);
  const sortedRecords = [...records].sort((a, b) =>
    String(b.arrival_date).localeCompare(String(a.arrival_date))
  );
  const reportingDate = sortedRecords[0]?.arrival_date || getIsoDate(new Date());
  const reportingDateObj = parseRecordDate(reportingDate);
  const weekStart = addDays(reportingDateObj, -6);
  const monthStart = new Date(
    reportingDateObj.getFullYear(),
    reportingDateObj.getMonth(),
    1
  );

  const recordsOnDate = arrived.filter(
    (record) => record.arrival_date === reportingDate
  );
  const recordsThisWeek = arrived.filter((record) => {
    const date = parseRecordDate(record.arrival_date);
    return date >= weekStart && date <= reportingDateObj;
  });
  const recordsThisMonth = arrived.filter((record) => {
    const date = parseRecordDate(record.arrival_date);
    return date >= monthStart && date <= reportingDateObj;
  });

  const labels = [];
  const arrivals = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(reportingDateObj, -offset);
    const iso = getIsoDate(date);
    labels.push(
      date.toLocaleDateString("en-PH", { month: "short", day: "2-digit" })
    );
    arrivals.push(
      sumField(
        arrived.filter((record) => record.arrival_date === iso),
        "total_visitors"
      )
    );
  }

  const dayTour = arrived.reduce(
    (total, record) =>
      total + (Number(record.total_visitors || 0) >= 5 ? record.total_visitors : 0),
    0
  );
  const overnight = arrived.reduce(
    (total, record) =>
      total + (Number(record.total_visitors || 0) < 5 ? record.total_visitors : 0),
    0
  );
  const contacts = records
    .map((record) => record.contact_number)
    .filter(Boolean)
    .reduce((lookup, contact) => {
      lookup[contact] = (lookup[contact] || 0) + 1;
      return lookup;
    }, {});

  return {
    reportingDate,
    feePerVisitor: 300,
    metrics: {
      todayArrivals: sumField(recordsOnDate, "total_visitors"),
      weekArrivals: sumField(recordsThisWeek, "total_visitors"),
      monthArrivals: sumField(recordsThisMonth, "total_visitors"),
      totalRevenueCollected: sumField(arrived, "total_visitors") * 300,
    },
    trends: { labels, arrivals },
    classification: {
      filipino: sumField(arrived, "filipino_count"),
      maubanin: sumField(arrived, "maubanin_count"),
      foreign: sumField(arrived, "foreigner_count"),
    },
    gender: {
      male: sumField(arrived, "total_male"),
      female: sumField(arrived, "total_female"),
    },
    stayType: {
      dayTour,
      overnight,
    },
    validation: {
      verifiedEntries: records.length,
      invalidEntries: 0,
      duplicateEntries: Object.values(contacts).filter((count) => count > 1).length,
    },
  };
}

function buildReportData(records = touristRecords, referenceTables = {}, filters = {}) {
  const resortList = referenceTables.resorts || resorts;
  const dateFrom = filters.from || "";
  const dateTo = filters.to || "";
  const resortId = filters.resort_id || filters.resortId || "";

  const filteredRecords = arrivedRecords(records).filter((record) => {
    if (dateFrom && record.arrival_date < dateFrom) {
      return false;
    }
    if (dateTo && record.arrival_date > dateTo) {
      return false;
    }
    if (resortId && String(record.resort_id) !== String(resortId)) {
      return false;
    }
    return true;
  });

  const rows = resortList
    .filter((resort) => !resortId || String(resort.resort_id) === String(resortId))
    .map((resort) => {
      const resortRecords = filteredRecords.filter(
        (record) => String(record.resort_id) === String(resort.resort_id)
      );
      const visitors = sumField(resortRecords, "total_visitors");
      const revenue = visitors * 300;

      return {
        resort_id: resort.resort_id,
        name: resort.resort_name,
        visitors,
        revenue,
        avg: visitors ? Math.round(revenue / visitors) : 0,
      };
    });

  const totals = rows.reduce(
    (summary, row) => ({
      visitors: summary.visitors + row.visitors,
      revenue: summary.revenue + row.revenue,
    }),
    { visitors: 0, revenue: 0 }
  );

  return {
    filters: { from: dateFrom, to: dateTo, resort_id: resortId },
    feePerVisitor: 300,
    rows,
    totals: {
      ...totals,
      avg: totals.visitors ? Math.round(totals.revenue / totals.visitors) : 0,
    },
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let details = null;
    const message = await response.text();

    try {
      details = message ? JSON.parse(message) : null;
    } catch (error) {
      details = message;
    }

    const error = new Error(message || `Request failed with ${response.status}`);
    error.status = response.status;
    error.details = details;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function mergeBootstrapData(remote = {}) {
  const mock = mockBootstrapData();
  const remoteReferenceTables = remote.referenceTables || {};
  const remoteResorts = remoteReferenceTables.resorts?.map(addResortImage);
  const referenceTables = {
    ...mock.referenceTables,
    ...remoteReferenceTables,
    ...(remoteResorts ? { resorts: remoteResorts } : {}),
  };
  const records = remote.touristRecords || mock.touristRecords;

  return {
    ...mock,
    ...remote,
    referenceTables,
    analytics: {
      ...mock.analytics,
      ...(remote.analytics || {}),
      trendSeries: {
        ...mock.analytics.trendSeries,
        ...(remote.analytics?.trendSeries || {}),
      },
    },
    touristRecords: records,
    feedbackEntries: remote.feedbackEntries || mock.feedbackEntries,
    dashboardAlerts: remote.dashboardAlerts || mock.dashboardAlerts,
    dashboardData: remote.dashboardData || buildDashboardData(records),
    reportData: remote.reportData || buildReportData(records, referenceTables),
    settings: remote.settings || mock.settings,
    arrivalMonitoring:
      remote.arrivalMonitoring ||
      buildArrivalMonitoringData(
        records,
        referenceTables
      ),
    apiBaseUrl: API_BASE_URL,
  };
}

function warnBackendFailure(action, error) {
  console.warn(`Django API unavailable while trying to ${action}.`, error);
}

function isBackendValidationError(error) {
  return Boolean(error?.status);
}

export const tourismApi = {
  async getBootstrapData() {
    try {
      const remote = await request("/bootstrap/");
      return mergeBootstrapData(remote);
    } catch (error) {
      warnBackendFailure("load bootstrap data", error);
      return delay(mockBootstrapData());
    }
  },

  async getArrivalMonitoringData(records, referenceTables) {
    try {
      return await request("/arrival-monitoring/");
    } catch (error) {
      warnBackendFailure("load arrival monitoring data", error);
      return delay(buildArrivalMonitoringData(records, referenceTables));
    }
  },

  async getDashboardData(records) {
    try {
      return await request("/dashboard/");
    } catch (error) {
      warnBackendFailure("load dashboard data", error);
      return delay(buildDashboardData(records));
    }
  },

  async getReportsData(filters = {}, records, referenceTables) {
    const params = new URLSearchParams();
    if (filters.from) {
      params.set("from", filters.from);
    }
    if (filters.to) {
      params.set("to", filters.to);
    }
    if (filters.resortId || filters.resort_id) {
      params.set("resort_id", filters.resortId || filters.resort_id);
    }

    try {
      const query = params.toString();
      return await request(`/reports/${query ? `?${query}` : ""}`);
    } catch (error) {
      warnBackendFailure("load report data", error);
      return delay(buildReportData(records, referenceTables, filters));
    }
  },

  async createTouristRecord(payload) {
    try {
      return await request("/tourist-records/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("create a tourist record", error);
      return delay(payload);
    }
  },

  async updateTouristRecord(id, payload) {
    try {
      return await request(`/tourist-records/${encodeURIComponent(id)}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("update a tourist record", error);
      return delay(payload);
    }
  },

  async deleteTouristRecord(id) {
    try {
      await request(`/tourist-records/${encodeURIComponent(id)}/`, {
        method: "DELETE",
      });
      return { id };
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("delete a tourist record", error);
      return delay({ id });
    }
  },

  async getFeedbackEntries() {
    try {
      return await request("/feedback/");
    } catch (error) {
      warnBackendFailure("load feedback entries", error);
      return delay(feedbackEntries);
    }
  },

  async updateFeedbackEntry(id, payload) {
    try {
      return await request(`/feedback/${encodeURIComponent(id)}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("update feedback", error);
      return delay({ id, ...payload });
    }
  },

  async getSettings() {
    try {
      return await request("/settings/");
    } catch (error) {
      warnBackendFailure("load settings", error);
      return delay(mockBootstrapData().settings);
    }
  },

  async updateSettings(payload) {
    try {
      return await request("/settings/", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("update settings", error);
      return delay(payload);
    }
  },

  async createResort(payload) {
    try {
      const created = await request("/resorts/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return addResortImage(created);
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("create resort", error);
      const resort_id =
        payload.resort_id ||
        Math.max(...resorts.map((resort) => resort.resort_id), 0) + 1;
      return delay(addResortImage({ ...payload, resort_id }));
    }
  },

  async updateResort(id, payload) {
    try {
      const updated = await request(`/resorts/${encodeURIComponent(id)}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return addResortImage(updated);
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("update resort", error);
      return delay(addResortImage({ resort_id: id, ...payload }));
    }
  },

  async deleteResort(id) {
    try {
      await request(`/resorts/${encodeURIComponent(id)}/`, {
        method: "DELETE",
      });
      return { id };
    } catch (error) {
      if (isBackendValidationError(error)) {
        throw error;
      }

      warnBackendFailure("delete resort", error);
      return delay({ id });
    }
  },
};
