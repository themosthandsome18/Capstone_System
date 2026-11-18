import { useEffect, useRef, useState } from "react";
import { apiRequest, getStoredAuthToken } from "../../shared/apiClient";

export function applySitioPayload(payload, form) {
  const result = { ...payload };
  for (const key of Object.keys(result)) if (key.startsWith("_sitio")) delete result[key];
  if (form._sitioChanged) {
    if (!form._sitioValid || form._sitioBarangay !== form.barangay) {
      throw new Error("Choose a Sitio belonging to the selected Barangay, or use manual entry.");
    }
    result.sitio_reference = form.sitio_reference ?? null;
    result.sitio = form.sitio ?? "";
  }
  return result;
}

export function useRecordSession(active, invalidate) {
  const callback = useRef(invalidate);
  callback.current = invalidate;
  const session = useRef(null);
  const invalid = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    if (!active) return undefined;
    revision.current += 1;
    session.current = getStoredAuthToken();
    invalid.current = false;
    const check = () => {
      if (getStoredAuthToken() !== session.current) {
        revision.current += 1;
        invalid.current = true;
        callback.current();
      }
    };
    window.addEventListener("storage", check);
    window.addEventListener("capstone-auth-changed", check);
    return () => {
      revision.current += 1;
      invalid.current = true;
      window.removeEventListener("storage", check);
      window.removeEventListener("capstone-auth-changed", check);
    };
  }, [active]);
  const check = () => !invalid.current && getStoredAuthToken() === session.current;
  check.checkpoint = () => {
    const version = revision.current;
    const token = session.current;
    return () => check() && revision.current === version && getStoredAuthToken() === token;
  };
  return check;
}

const EMPTY_BARANGAYS = [];

export default function SitioField({ form, onChange, barangays = EMPTY_BARANGAYS }) {
  const [state, setState] = useState({ rows: [], loading: true, error: "", barangay: "" });
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    const token = getStoredAuthToken();
    let live = true;
    const current = () => live && request === generation.current && token === getStoredAuthToken();
    setState({ rows: [], loading: true, error: "", barangay: form.barangay });
    async function load() {
      try {
        if (!form.barangay) {
          if (current()) setState({ rows: [], loading: false, error: "", barangay: "" });
          return;
        }
        let matches = barangays.filter(item => item?.name === form.barangay && Number.isInteger(item.id) && item.id > 0);
        if (matches.length !== 1) {
          const data = await apiRequest("/households/barangays/");
          matches = Array.isArray(data) ? data.filter(item => item.name === form.barangay && Number.isInteger(item.id) && item.id > 0) : [];
        }
        if (!current()) return;
        if (matches.length !== 1) throw new Error("Refresh the Barangay reference data to retry.");
        const id = matches[0].id;
        const data = await apiRequest(`/sanitation/sitios/?barangay_id=${id}`);
        if (!current()) return;
        if (data?.barangay_id !== id || !Array.isArray(data.rows)) {
          throw new Error("The Sitio choices do not match this Barangay.");
        }
        const ids = new Set();
        for (const row of data.rows) {
          if (!row || !Number.isInteger(row.id) || row.id <= 0 || row.barangay_id !== id ||
              row.is_active !== true || typeof row.name !== "string" || !row.name.trim() || ids.has(row.id)) {
            throw new Error("The Sitio choices do not match this Barangay.");
          }
          ids.add(row.id);
        }
        setState({ rows: data.rows, loading: false, error: "", barangay: form.barangay });
      } catch (error) {
        if (current()) setState({ rows: [], loading: false, error: error.message, barangay: form.barangay });
      }
    }
    load();
    return () => { live = false; };
  }, [form.barangay, barangays, retry]);
  useEffect(() => {
    if (!form._sitioChanged || form.sitio_reference == null) return;
    const valid = !state.loading && !state.error && state.barangay === form.barangay &&
      state.rows.some(row => row.id === form.sitio_reference && row.name === form.sitio);
    if (form._sitioValid !== valid) onChange("sitioSelection", { _sitioValid: valid });
  }, [state, form._sitioChanged, form.sitio_reference, form.sitio, form.barangay, form._sitioValid, onChange]);
  const rows = state.barangay === form.barangay ? state.rows : [];
  const saved = !form._sitioChanged && (form.sitio_reference != null || Boolean(form.sitio));
  const selection = form._sitioMode || (saved ? "saved" : "");
  function choose(value) {
    const row = rows.find(item => String(item.id) === value);
    if (value === "saved") return;
    onChange("sitioSelection", {
      sitio_reference: row?.id ?? null, sitio: row?.name ?? "", _sitioMode: value,
      _sitioChanged: true, _sitioBarangay: form.barangay,
      _sitioValid: value === "" || value === "manual" || Boolean(row),
    });
  }
  return <div className="hh-form-group modal-field full">
    <label htmlFor="record-sitio">Sitio</label>
    <select id="record-sitio" value={selection} onChange={event => choose(event.target.value)}>
      <option value="">No Sitio selected</option>
      {saved && <option value="saved">Saved Sitio: {form.sitio || "Configured selection"}</option>}
      {rows.map(row => <option key={row.id} value={String(row.id)}>{row.name}</option>)}
      <option value="manual">Sitio not listed</option>
    </select>
    {saved && <small>Saved value retained ({form.sitio_source || "unknown"}): {form.sitio}</small>}
    {selection === "manual" && <label>Manual Sitio<input maxLength={120} value={form.sitio || ""}
      onChange={event => onChange("sitioSelection", { sitio: event.target.value, sitio_reference: null,
        _sitioMode: "manual", _sitioChanged: true, _sitioBarangay: form.barangay, _sitioValid: true })} /></label>}
    {state.loading && <small aria-live="polite">Loading Sitios...</small>}
    {state.error && <div role="alert">{state.error}<button type="button" onClick={() => setRetry(value => value + 1)}>Retry Sitios</button></div>}
    {!state.loading && !state.error && form.barangay && rows.length === 0 && <small>No Sitios configured for this Barangay</small>}
  </div>;
}
