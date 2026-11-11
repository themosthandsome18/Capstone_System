import { useEffect, useState } from "react";
import { AUTH_TOKEN_KEY } from "../../shared/apiClient";
import { fetchHouseholdFrontPhoto } from "../services/householdPhotoApi";

export default function HouseholdFrontPhoto({ householdId, snapshot }) {
  const [attempt, setAttempt] = useState(0);
  const [photo, setPhoto] = useState({ status: "loading" });
  useEffect(() => {
    let active = true;
    let objectUrl;
    const controller = new AbortController();
    const dispose = () => {
      active = false;
      controller.abort();
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = undefined; }
    };
    const sessionChanged = event => {
      if (event.key === AUTH_TOKEN_KEY || event.key === null) {
        dispose();
        setPhoto({ status: "error", message: "Sign in again to view this photo." });
      }
    };
    window.addEventListener("storage", sessionChanged);
    setPhoto({ status: "loading" });
    fetchHouseholdFrontPhoto(householdId, controller.signal).then(blob => {
      if (!active) return;
      if (!blob) { setPhoto({ status: "empty" }); return; }
      objectUrl = URL.createObjectURL(blob);
      setPhoto({ status: "success", url: objectUrl });
    }).catch(error => {
      if (active) setPhoto({ status: "error", message: error.status ? error.message : "Household photo could not be loaded. Please retry." });
    });
    return () => { dispose(); window.removeEventListener("storage", sessionChanged); };
  }, [householdId, snapshot, attempt]);

  return <section aria-label="Household front photo">
    <h3>Front photo</h3>
    {photo.status === "loading" && <p role="status">Loading household photo…</p>}
    {photo.status === "empty" && <p>No front photo saved.</p>}
    {photo.status === "success" && <img alt="Household frontage" src={photo.url}
      style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }}
      onError={() => setPhoto({ status: "error", message: "Household photo could not be displayed. Please retry." })} />}
    {photo.status === "error" && <p role="alert">{photo.message}</p>}
    {photo.status !== "loading" && <button type="button" onClick={() => setAttempt(value => value + 1)}>
      {photo.status === "error" ? "Retry photo" : "Reload photo"}
    </button>}
  </section>;
}
