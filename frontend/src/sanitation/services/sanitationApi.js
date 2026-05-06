const API_BASE_URL = "http://127.0.0.1:8000/api";

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let details = null;

    try {
      details = await response.json();
    } catch {
      details = null;
    }

    const error = new Error("Sanitation API request failed.");
    error.status = response.status;
    error.details = details;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function fetchSanitationBootstrap() {
  return request("/sanitation/bootstrap/");
}

export function fetchSanitationDashboard() {
  return request("/sanitation/dashboard/");
}

export function fetchSanitationBusinessTypes() {
  return request("/sanitation/business-types/");
}

export function fetchSanitationEstablishments() {
  return request("/sanitation/establishments/");
}

export function createSanitationEstablishment(payload) {
  return request("/sanitation/establishments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSanitationEstablishment(id, payload) {
  return request(`/sanitation/establishments/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteSanitationEstablishment(id) {
  return request(`/sanitation/establishments/${id}/`, {
    method: "DELETE",
  });
}

export function fetchSanitationInspections() {
  return request("/sanitation/inspections/");
}

export function createSanitationInspection(payload) {
  return request("/sanitation/inspections/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSanitationInspection(id, payload) {
  return request(`/sanitation/inspections/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteSanitationInspection(id) {
  return request(`/sanitation/inspections/${id}/`, {
    method: "DELETE",
  });
}

export function fetchSanitationPermits(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/sanitation/permits/${query ? `?${query}` : ""}`);
}

export function fetchSanitationSubmissions(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/sanitation/submissions/${query ? `?${query}` : ""}`);
}

export function fetchSanitationReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/sanitation/reports/${query ? `?${query}` : ""}`);
}

export function fetchHouseholdBootstrap() {
  return request("/households/bootstrap/");
}

export function fetchHouseholdDashboard() {
  return request("/households/dashboard/");
}

export function fetchHouseholdRecords() {
  return request("/households/records/");
}

export function createHouseholdRecord(payload) {
  return request("/households/records/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHouseholdRecord(id, payload) {
  return request(`/households/records/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteHouseholdRecord(id) {
  return request(`/households/records/${id}/`, {
    method: "DELETE",
  });
}