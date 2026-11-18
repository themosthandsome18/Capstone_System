import { API_BASE_URL, getStoredAuthToken } from "../../shared/apiClient";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export function validatePhotoFile(file) {
  if (!file || !["image/jpeg", "image/png"].includes(file.type) || !file.size || file.size > MAX_PHOTO_BYTES) {
    throw new Error("Choose a JPEG or PNG up to 5 MiB.");
  }
}
const sessionError = () => Object.assign(new Error("Sign in again to view this photo."), { status: 401 });
function checkSession(token) {
  if (!token || getStoredAuthToken() !== token) throw sessionError();
}
function endpoint(kind, id) {
  if (!["household", "establishment"].includes(kind) || !Number.isSafeInteger(id) || id <= 0) throw new Error("Photo is unavailable.");
  return `${API_BASE_URL}/${kind === "household" ? "households/records" : "sanitation/establishments"}/${id}/front-photo/`;
}
function checkResponse(response) {
  if (response.status === 401) throw sessionError();
  if (response.status === 403) throw Object.assign(new Error("You are not authorized to access this photo."), { status: 403 });
}
export async function fetchFrontPhoto(kind, id, signal, token = getStoredAuthToken()) {
  checkSession(token);
  const response = await fetch(endpoint(kind, id), { headers: { Authorization: `Token ${token}` }, cache: "no-store", signal });
  checkSession(token); checkResponse(response);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Photo could not be loaded. Please retry.");
  const mime = (response.headers.get("Content-Type") || "").split(";")[0];
  if (!["image/jpeg", "image/png"].includes(mime)) throw new Error("The photo response is invalid.");
  const blob = await response.blob(); checkSession(token);
  if (!blob.size || blob.size > MAX_PHOTO_BYTES) throw new Error("The photo response is invalid.");
  return blob;
}
export async function uploadFrontPhoto(kind, id, file, signal, token) {
  validatePhotoFile(file); checkSession(token);
  const body = new FormData(); body.append("photo", file);
  const response = await fetch(endpoint(kind, id), { method: "PUT", headers: { Authorization: `Token ${token}` }, body, signal });
  checkSession(token); checkResponse(response);
  if (!response.ok) throw new Error("Photo save could not be confirmed. Reload the saved photo before trying again.");
  const result = await response.json(); checkSession(token);
  if (result?.has_front_photo !== true) throw new Error("Photo save could not be confirmed. Reload the saved photo before trying again.");
  return result.cleanup_pending === true;
}
