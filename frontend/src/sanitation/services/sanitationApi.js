import { apiRequest, buildQueryString } from "../../shared/apiClient";


const SANITATION_API_ERROR = "Sanitation API request failed.";

const sanitationPath = (path) => `/sanitation${path}`;
const householdPath = (path) => `/households${path}`;


function request(endpoint, options = {}) {
  return apiRequest(endpoint, {
    errorMessage: SANITATION_API_ERROR,
    ...options,
  });
}


function save(endpoint, method, payload) {
  return request(endpoint, {
    method,
    body: JSON.stringify(payload),
  });
}


function remove(endpoint) {
  return request(endpoint, {
    method: "DELETE",
  });
}


function withQuery(endpoint, params = {}) {
  return `${endpoint}${buildQueryString(params)}`;
}


export function fetchSanitationBootstrap() {
  return request(sanitationPath("/bootstrap/"));
}


export function fetchSanitationDashboard() {
  return request(sanitationPath("/dashboard/"));
}


export function fetchSanitationBusinessTypes() {
  return request(sanitationPath("/business-types/"));
}


export function fetchSanitationEstablishments() {
  return request(sanitationPath("/establishments/"));
}


export function createSanitationEstablishment(payload) {
  return save(sanitationPath("/establishments/"), "POST", payload);
}


export function updateSanitationEstablishment(id, payload) {
  return save(
    sanitationPath(`/establishments/${encodeURIComponent(id)}/`),
    "PATCH",
    payload
  );
}


export function deleteSanitationEstablishment(id) {
  return remove(sanitationPath(`/establishments/${encodeURIComponent(id)}/`));
}


export function fetchSanitationInspections() {
  return request(sanitationPath("/inspections/"));
}


export function createSanitationInspection(payload) {
  return save(sanitationPath("/inspections/"), "POST", payload);
}


export function updateSanitationInspection(id, payload) {
  return save(
    sanitationPath(`/inspections/${encodeURIComponent(id)}/`),
    "PATCH",
    payload
  );
}


export function deleteSanitationInspection(id) {
  return remove(sanitationPath(`/inspections/${encodeURIComponent(id)}/`));
}


export function fetchSanitationPermits(params = {}) {
  return request(withQuery(sanitationPath("/permits/"), params));
}


export function fetchSanitationSubmissions(params = {}) {
  return request(withQuery(sanitationPath("/submissions/"), params));
}


export function fetchSanitationReports(params = {}) {
  return request(withQuery(sanitationPath("/reports/"), params));
}


export function fetchHouseholdBootstrap() {
  return request(householdPath("/bootstrap/"));
}


export function fetchHouseholdDashboard() {
  return request(householdPath("/dashboard/"));
}


export function fetchHouseholdRecords() {
  return request(householdPath("/records/"));
}


export function createHouseholdRecord(payload) {
  return save(householdPath("/records/"), "POST", payload);
}


export function updateHouseholdRecord(id, payload) {
  return save(
    householdPath(`/records/${encodeURIComponent(id)}/`),
    "PATCH",
    payload
  );
}


export function deleteHouseholdRecord(id) {
  return remove(householdPath(`/records/${encodeURIComponent(id)}/`));
}
