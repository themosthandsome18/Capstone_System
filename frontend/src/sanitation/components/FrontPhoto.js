import { useEffect, useRef, useState } from "react";
import { FiCamera, FiUpload } from "react-icons/fi";
import { AUTH_TOKEN_KEY, getStoredAuthToken } from "../../shared/apiClient";
import { fetchFrontPhoto, uploadFrontPhoto, validatePhotoFile } from "../services/frontPhotoApi";
import "./FrontPhoto.css";

export default function FrontPhoto({ kind, recordId, snapshot }) {
  const title = kind === "household" ? "Household" : "Establishment";
  const [photo, setPhoto] = useState({ status: "loading", url: null });
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reload, setReload] = useState(0);
  const session = useRef(null);
  const active = useRef(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const urls = useRef(new Set());
  const uploadController = useRef(null);
  const input = useRef(null);
  const revoke = url => { if (url) { URL.revokeObjectURL(url); urls.current.delete(url); } };
  const allocate = blob => { const url = URL.createObjectURL(blob); urls.current.add(url); return url; };

  useEffect(() => {
    active.current = true; session.current = getStoredAuthToken();
    const ownedUrls = urls.current;
    const invalidate = event => {
      if (event.type === "storage" && event.key !== AUTH_TOKEN_KEY && event.key !== null) return;
      active.current = false; generation.current += 1;
      uploadController.current?.abort();
      ownedUrls.forEach(url => URL.revokeObjectURL(url)); ownedUrls.clear();
      setPhoto({ status: "error", url: null }); setSelection(null); setLocked(true);
      setBusy(false); setMessage(""); setError("Sign in again to view this photo.");
      if (input.current) input.current.value = "";
    };
    window.addEventListener("storage", invalidate);
    window.addEventListener("capstone-auth-changed", invalidate);
    return () => {
      active.current = false; generation.current += 1; uploadController.current?.abort();
      ownedUrls.forEach(url => URL.revokeObjectURL(url)); ownedUrls.clear();
      window.removeEventListener("storage", invalidate);
      window.removeEventListener("capstone-auth-changed", invalidate);
    };
  }, []);

  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    const current = () => active.current && version === generation.current;
    if (!active.current) return undefined;
    setPhoto(previous => ({ ...previous, status: "loading" })); setError("");
    fetchFrontPhoto(kind, recordId, controller.signal, session.current).then(blob => {
      if (!current()) return;
      const url = blob ? allocate(blob) : null;
      setPhoto(previous => { revoke(previous.url); return { status: blob ? "success" : "empty", url }; });
      setLocked(false);
    }).catch(failure => {
      if (!current()) return;
      const denied = [401, 403].includes(failure.status);
      if (denied) setSelection(previous => { if (previous) revoke(previous.url); return null; });
      setPhoto(previous => {
        if (denied) revoke(previous.url);
        return { status: "error", url: denied ? null : previous.url };
      });
      setLocked(true);
      setError(failure.status ? failure.message : `${title} photo could not be loaded. Please retry.`);
    });
    return () => { generation.current += 1; controller.abort(); };
  }, [kind, recordId, snapshot, reload, title]);

  const pick = event => {
    if (busyRef.current) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    try {
      validatePhotoFile(file);
      const url = allocate(file);
      if (selection) revoke(selection.url);
      setSelection({ file, url }); setError("");
    } catch (failure) {
      if (selection) revoke(selection.url);
      setSelection(null); setError(failure.message); event.target.value = "";
    }
  };
  const save = async () => {
    if (busyRef.current || locked || !selection || !active.current) return;
    busyRef.current = true; setBusy(true); setMessage(""); setError("");
    const version = generation.current;
    uploadController.current = new AbortController();
    try {
      await uploadFrontPhoto(kind, recordId, selection.file, uploadController.current.signal, session.current);
      if (!active.current || version !== generation.current) return;
      revoke(selection.url); setSelection(null); if (input.current) input.current.value = "";
      setMessage("Photo saved. Refreshing the saved image."); setReload(value => value + 1);
    } catch (failure) {
      if (!active.current || version !== generation.current) return;
      setLocked(true);
      if ([401, 403].includes(failure.status)) {
        revoke(selection.url); setSelection(null);
        setPhoto(previous => { revoke(previous.url); return { status: "error", url: null }; });
      }
      setError(failure.status ? failure.message : "Photo save could not be confirmed. Reload the saved photo before trying again.");
    } finally {
      busyRef.current = false;
      if (active.current) setBusy(false);
    }
  };
  // Presentation only: button family follows the host modal; labels follow the existing state.
  // While locked (load error, failed save, signed out) Reload/Retry is the emphasised action.
  const primaryClass = kind === "household" ? "hh-btn-save" : "add-establishment-btn";
  const secondaryClass = kind === "household" ? "hh-btn-cancel" : "sanitation-export-btn";
  const pickDisabled = busy || locked || photo.status === "loading";
  const pickVerb = selection ? "Choose a different" : photo.url ? "Replace" : "Choose";
  return <section className="front-photo-panel" aria-label={`${title} front photo`}>
    <h3 className="front-photo-title">Front photo</h3>
    {photo.status === "loading" && <p className="front-photo-notice is-info" role="status">Loading {kind} photo…</p>}
    {busy && <p className="front-photo-notice is-info" role="status">Uploading photo. Please wait.</p>}
    {message && <p className="front-photo-notice is-success" role="status">{message}</p>}
    {error && <p className="front-photo-notice is-error" role="alert">{error}</p>}
    {photo.status === "empty" && !selection && <div className="front-photo-empty">
      <FiCamera aria-hidden="true" focusable="false" />
      <p>No front photo saved.</p>
    </div>}
    {photo.url && <>
      <div className="front-photo-frame">
        <img alt={`${title} frontage`} src={photo.url}
          onError={() => setError("Photo could not be displayed. Reload the saved photo.")} />
      </div>
      <a className="front-photo-open" href={photo.url} target="_blank" rel="noopener noreferrer">View full size</a>
    </>}
    {selection && <div className="front-photo-selection"><p>Selected photo — not saved yet</p><div className="front-photo-frame"><img alt={`${title} selected preview`} src={selection.url}
      onError={() => { revoke(selection.url); setSelection(null); setError("Choose a complete, valid JPEG or PNG."); }} /></div></div>}
    <p className="front-photo-hint">JPEG or PNG, up to 5 MiB. Selecting a file does not save it.</p>
    {selection && photo.url && <p>Replace the saved photo with this preview?</p>}
    <div className="front-photo-actions">
      {selection && <button type="button" className={locked ? secondaryClass : primaryClass} onClick={save} disabled={busy || locked || photo.status === "loading"}>
        {busy ? "Uploading photo…" : photo.url ? "Replace photo" : "Save photo"}</button>}
      <label className={`front-photo-pick ${secondaryClass}${pickDisabled ? " is-disabled" : ""}`}>
        <FiUpload aria-hidden="true" focusable="false" />
        <span>{pickVerb}<span className="front-photo-visually-hidden"> {kind} front</span> photo</span>
        <input className="front-photo-visually-hidden" ref={input} type="file" accept="image/jpeg,image/png" onChange={pick}
          disabled={busy || locked || photo.status === "loading"} />
      </label>
      <button type="button" className={locked ? primaryClass : secondaryClass} disabled={busy || photo.status === "loading"} onClick={() => setReload(value => value + 1)}>
        {photo.status === "error" ? "Retry photo" : "Reload photo"}</button>
    </div>
  </section>;
}
