function getDefaultApiBaseUrl() {
  const hostname = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${hostname}:8000/api`;
}

export const API_BASE_URL = (
  process.env.REACT_APP_API_BASE_URL || getDefaultApiBaseUrl()
).replace(/\/$/, "");

export const AUTH_TOKEN_KEY = "capstone_auth_token";


export function getStoredAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}


export function setStoredAuthToken(token) {
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}


export function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}


export async function apiRequest(endpoint, options = {}) {
  const { auth = true, errorMessage, ...fetchOptions } = options;
  const token = auth ? getStoredAuthToken() : "";
  const isFormData = fetchOptions.body instanceof FormData;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Token ${token}` } : {}),
        ...(fetchOptions.headers || {}),
      },
      ...fetchOptions,
    });
  } catch (requestError) {
    const error = new Error(
      `Cannot connect to the backend at ${API_BASE_URL}. Check if Django is running.`
    );
    error.details = { detail: error.message };
    throw error;
  }

  if (!response.ok) {
    const responseText = await response.text();
    const details = parseResponseDetails(responseText);
    const message =
      errorMessage || getErrorMessage(details) || responseText ||
      `Request failed with ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.details = details;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}


function parseResponseDetails(responseText) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}


function getErrorMessage(details) {
  if (!details || typeof details !== "object") {
    return "";
  }

  return details.detail || details.message || "";
}
