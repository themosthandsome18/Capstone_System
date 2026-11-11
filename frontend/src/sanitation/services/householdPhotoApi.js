import { API_BASE_URL, getStoredAuthToken } from "../../shared/apiClient";

export async function fetchHouseholdFrontPhoto(id, signal) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Household photo is unavailable.");
  const token = getStoredAuthToken();
  const sessionError = () => Object.assign(new Error("Sign in again to view this photo."), { status: 401 });
  if (!token) throw sessionError();
  const response = await fetch(`${API_BASE_URL}/households/records/${id}/front-photo/`, {
    headers: { Authorization: `Token ${token}` }, cache: "no-store", signal,
  });
  if (getStoredAuthToken() !== token) throw sessionError();
  if (response.status === 401) throw sessionError();
  if (response.status === 403) throw Object.assign(new Error("You are not authorized to view this photo."), { status: 403 });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Household photo could not be loaded. Please retry.");
  const mime = (response.headers.get("Content-Type") || "").split(";")[0];
  if (!["image/jpeg", "image/png"].includes(mime)) throw new Error("The photo response is invalid.");
  const blob = await response.blob();
  if (getStoredAuthToken() !== token) throw sessionError();
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error("The photo response is invalid.");
  return blob;
}
