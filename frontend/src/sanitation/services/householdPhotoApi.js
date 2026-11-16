import { fetchFrontPhoto } from "./frontPhotoApi";
export function fetchHouseholdFrontPhoto(id, signal) {
  return fetchFrontPhoto("household", id, signal);
}
