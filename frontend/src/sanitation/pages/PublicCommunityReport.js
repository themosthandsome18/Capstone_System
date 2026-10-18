import React, { useEffect, useRef, useState } from "react";
import { createPublicReportId, fetchPublicReportOptions, submitPublicReport } from "../services/publicReportingApi";
import { acknowledgeRecovery, clearRecovery, loadRecovery, persistRecovery, RECOVERY_TTL } from "../services/publicReportRecovery";
import "./PublicCommunityReport.css";

const EMPTY = { complainant_name: "", contact_number: "", category: "", barangay: "", location_address: "", description: "" };
const LABELS = { complainant_name: "Resident name", contact_number: "Philippine mobile number",
  category: "Concern category", barangay: "Barangay", location_address: "Location / address", description: "Description" };

function normalizedFields(fields) {
  let contact = fields.contact_number.replace(/\D/g, "");
  if (contact.startsWith("63") && contact.length === 12) contact = `0${contact.slice(2)}`;
  return { complainant_name: fields.complainant_name.trim(), contact_number: contact,
    category: fields.category, barangay: fields.barangay,
    location_address: fields.location_address.trim().replace(/\s+/g, " "), description: fields.description.trim() };
}

export default function PublicCommunityReport() {
  const [fields, setFields] = useState({ ...EMPTY });
  const [acknowledged, setAcknowledged] = useState(false);
  const [options, setOptions] = useState(null);
  const [optionsVersion, setOptionsVersion] = useState(0);
  const [optionsError, setOptionsError] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState(null);
  const attempt = useRef(null);
  const draftId = useRef(null);
  const pending = useRef(false);
  const feedback = useRef(null);
  const mounted = useRef(true);
  const recoveryLoaded = useRef(false);
  const locked = ["pending", "uncertain", "conflict", "limited", "recovered", "storage", "expired"].includes(phase);

  function restore() {
    try {
      const record = loadRecovery();
      if (record?.expired) {
        setPhase("expired");
        setMessage("Device recovery expired after 24 hours and was cleared. Submission status may still be unknown. A new report could duplicate one already received. Contact the Sanitary Section if unsure.");
      } else if (record?.confirmed) {
        attempt.current = record;
        setReceipt(record.receipt); setPhase("success");
      } else if (record) {
        attempt.current = record; draftId.current = record.id;
        setFields(record.payload); setAcknowledged(true); setPhase("recovered");
        setMessage("Unfinished submission recovered from this device. It may already have been received. Nothing will be sent automatically. Retry this report to send only its original details and reference, or discard it with confirmation before editing.");
      } else { setPhase("idle"); setMessage(""); }
    } catch {
      setPhase("storage");
      setMessage("Device recovery storage is unavailable or damaged. Nothing new will be sent until recovery can be saved safely. An earlier submission may already have been received. Check device storage or explicitly discard the pending submission.");
    }
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    // Strict Mode repeats effects in development; do not erase the expiry warning
    // by rereading the already-cleared record during that second invocation.
    if (!recoveryLoaded.current) { recoveryLoaded.current = true; restore(); }
  }, []);
  useEffect(() => {
    let active = true;
    setOptions(null);
    setOptionsError(false);
    fetchPublicReportOptions().then((data) => { if (active) setOptions(data); })
      .catch(() => { if (active) setOptionsError(true); });
    return () => { active = false; };
  }, [optionsVersion]);
  useEffect(() => { if (message || receipt) feedback.current?.focus(); }, [message, receipt]);
  useEffect(() => {
    const record = attempt.current;
    if (!locked || phase === "pending" || phase === "expired" || !record?.payload) return undefined;
    const timer = window.setTimeout(() => {
      try {
        clearRecovery(record.id); setPhase("expired");
        setMessage("Device recovery expired after 24 hours and was cleared. Submission status may still be unknown. A new report could duplicate one already received.");
      } catch { setPhase("storage"); setMessage("Expired device recovery could not be cleared. Nothing was sent. Check device storage before starting another report."); }
    }, Math.max(0, record.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [locked, phase]);

  async function send(payload, id) {
    if (pending.current) return;
    if (attempt.current.expiresAt <= Date.now()) {
      try { clearRecovery(id); setPhase("expired"); setMessage("Device recovery expired after 24 hours and was cleared. Submission status may still be unknown. A new report could duplicate one already received."); }
      catch { setPhase("storage"); setMessage("Expired device recovery could not be cleared. Nothing was sent. Your current entries have been kept."); }
      return;
    }
    try { persistRecovery(attempt.current); }
    catch {
      setPhase("storage"); setMessage("Device recovery could not be saved safely. Nothing was sent. Your original entries and submission identity have been kept on this open page. Check device storage, then deliberately retry; do not start another report if the earlier outcome is unknown.");
      return;
    }
    pending.current = true;
    setPhase("pending");
    setMessage("");
    try {
      const result = await submitPublicReport({ ...payload, client_submission_id: id });
      let cleanupMessage = "";
      try { acknowledgeRecovery(attempt.current, result); }
      catch { cleanupMessage = "Report received, but device recovery could not be fully cleared. Keep this receipt and clear the device recovery before starting another report."; }
      attempt.current = { id, createdAt: attempt.current.createdAt, expiresAt: attempt.current.expiresAt };
      if (mounted.current) { setReceipt(result); setFields({ ...EMPTY }); setPhase("success"); setMessage(cleanupMessage); }
    } catch (error) {
      if (!mounted.current) return;
      if (error.status === 409) {
        setPhase("conflict");
        setMessage("This submission could not be safely reused. Your entries have been kept. Please contact the Sanitary Section before submitting again.");
      } else if (error.status === 429) {
        setPhase("limited");
        setMessage("Too many reports have been submitted. Please try again later. Your entries have been kept; no retry will happen automatically.");
      } else if (error.status === 400) {
        try { clearRecovery(id); }
        catch { setPhase("storage"); setMessage("The report was rejected, but device recovery could not be cleared. Your original entries are kept. Check device storage before editing or retrying."); return; }
        setPhase("rejected");
        const invalid = {};
        Object.keys(error.details?.errors || {}).forEach((key) => {
          if (key in LABELS) invalid[key] = "Please check this field.";
        });
        setErrors(invalid);
        setMessage("The report was not accepted. Please check the fields and selected options, then submit again.");
      } else {
        setPhase("uncertain");
        setMessage("We could not confirm whether your report was received. Your entries have been kept. Use Retry this report to safely retry the same submission.");
      }
    } finally {
      pending.current = false;
    }
  }

  function submit(event) {
    event.preventDefault();
    if (pending.current || locked || !options) return;
    const payload = normalizedFields(fields);
    const invalid = {};
    Object.keys(LABELS).forEach((key) => { if (!payload[key]) invalid[key] = `${LABELS[key]} is required.`; });
    if (payload.contact_number && !/^09\d{9}$/.test(payload.contact_number)) invalid.contact_number = "Enter a Philippine mobile number, such as 09171234567.";
    if (!options.categories.includes(payload.category)) invalid.category = "Choose a concern category from the list.";
    if (!options.barangays.includes(payload.barangay)) invalid.barangay = "Choose a barangay from the list.";
    if (!acknowledged) invalid.acknowledgement = "Please acknowledge the privacy notice before submitting.";
    setErrors(invalid);
    if (Object.keys(invalid).length) { setMessage("Please check the highlighted fields."); return; }
    try {
      if (!draftId.current || (attempt.current && JSON.stringify(attempt.current.payload) !== JSON.stringify(payload))) {
        // Changed content is allowed only after a definite validation rejection.
        // Uncertain/conflicting submissions remain locked until an explicit reset.
        draftId.current = createPublicReportId();
      }
      const createdAt = Date.now();
      attempt.current = { payload, id: draftId.current, createdAt, expiresAt: createdAt + RECOVERY_TTL };
      send(payload, draftId.current);
    } catch {
      setMessage("Your browser could not prepare this report. Nothing was sent. Please reload and try again.");
    }
  }

  function startNewReport() {
    if (pending.current) return;
    if (locked && !window.confirm(
      "Discard the pending submission and its device recovery? Your previous report may already have been received. Starting a new report could create a duplicate. Discard and start a new report anyway?"
    )) return;
    try { clearRecovery(attempt.current?.id); }
    catch { setMessage("Device recovery could not be cleared safely. Your current report has been kept. Check device storage before starting another report."); return; }
    try { draftId.current = createPublicReportId(); }
    catch { setMessage("Your browser could not prepare a new report. Your current entries have been kept."); return; }
    attempt.current = null;
    setFields({ ...EMPTY }); setAcknowledged(false); setErrors({}); setMessage(""); setReceipt(null); setPhase("idle");
  }

  function input(key, settings = {}) {
    const props = { id: `public-report-${key}`, name: key, value: fields[key], required: true,
      "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `public-error-${key}` : undefined,
      onChange: (event) => { if (!locked && !pending.current) setFields((old) => ({ ...old, [key]: event.target.value })); }, ...settings };
    return <div className="public-report-field" key={key}>
      <label htmlFor={props.id}>{LABELS[key]} <span aria-hidden="true">*</span></label>
      {key === "category" || key === "barangay" ? <select {...props}>
        <option value="">Choose {key === "category" ? "a category" : "a barangay"}</option>
        {(key === "category" ? options?.categories : options?.barangays)?.map((value) => <option key={value} value={value}>{value}</option>)}
      </select> : key === "description" ? <textarea {...props} rows={5} /> : <input {...props} />}
      {errors[key] && <p className="public-report-field-error" id={`public-error-${key}`}>{errors[key]}</p>}
    </div>;
  }

  return <main className="public-community-report">
    <article className="public-report-card" aria-labelledby="public-report-title">
      <header><p className="public-report-eyebrow">Mauban Sanitary Section</p>
        <h1 id="public-report-title">Report a sanitation concern</h1>
        <p>Submit a concern without an account or app installation.</p></header>
      {receipt ? <section ref={feedback} tabIndex={-1} aria-labelledby="public-receipt-title" className="public-report-receipt">
        <h2 id="public-receipt-title">Report received</h2>
        {message && <p role="alert">{message}</p>}
        <p>Keep this reference for follow-up with the Sanitary Section.</p>
        <dl><dt>Reference ID</dt><dd>{receipt.complaint_id}</dd>
          <dt>Submission status</dt><dd>Received — pending review</dd>
          <dt>Received at</dt><dd><time dateTime={receipt.created_at}>{new Date(receipt.created_at).toLocaleString()}</time></dd>
          <dt>Priority</dt><dd>{receipt.priority.charAt(0).toUpperCase() + receipt.priority.slice(1)}</dd></dl>
        <button type="button" onClick={startNewReport}>Start a new report</button>
      </section> : <>
        {!options && !optionsError && <p role="status">Loading reporting options…</p>}
        {optionsError && <div role="alert"><p>Reporting options could not be loaded. Please try again.</p>
          <button type="button" onClick={() => setOptionsVersion((old) => old + 1)}>Reload options</button></div>}
        {message && <div ref={feedback} tabIndex={-1} role="alert" className="public-report-feedback">{message}</div>}
        <form noValidate onSubmit={submit} aria-label="Sanitation concern submission" aria-busy={phase === "pending"}>
          <p>All fields marked * are required.</p>
          <fieldset disabled={locked || !options}>
            <legend className="public-report-legend">Concern details</legend>
            {input("complainant_name", { autoComplete: "name", maxLength: 160 })}
            {input("contact_number", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 60, placeholder: "09171234567" })}
            {input("category")}{input("barangay")}
            {input("location_address", { maxLength: 255 })}{input("description")}
            <section className="public-report-privacy" aria-labelledby="public-privacy-title">
              <h2 id="public-privacy-title">Privacy notice</h2>
              <p>Your name, mobile number and concern details will be sent to the Sanitary Section for verification and follow-up. Avoid including other people’s private information.</p>
              <p>An unfinished submission, including your name, mobile number and report details, is temporarily saved on this device so you can recover it after closing or reloading this page. Recovery is available for 24 hours; Recovery expires after 24 hours. This page attempts to remove expired recovery data when opened; storage errors may prevent removal. Discard it explicitly on a shared device if needed. Device expiry does not prove the server did not receive it.</p>
              <label className="public-report-ack"><input type="checkbox" checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)} required
                aria-invalid={Boolean(errors.acknowledgement)} aria-describedby={errors.acknowledgement ? "public-error-ack" : undefined} />
                <span>I have read the privacy notice and want to submit this report. *</span></label>
              {errors.acknowledgement && <p id="public-error-ack" className="public-report-field-error">{errors.acknowledgement}</p>}
            </section>
          </fieldset>
          {!locked && <button type="submit" disabled={!options}>Submit report</button>}
          {phase === "pending" && <p role="status">Submitting your report…</p>}
        </form>
        {["uncertain", "limited", "recovered", "storage"].includes(phase) && attempt.current?.payload && <button type="button" onClick={() => send(attempt.current.payload, attempt.current.id)}>Retry this report</button>}
        {phase === "storage" && !attempt.current && <button type="button" onClick={restore}>Check device storage</button>}
        {locked && phase !== "pending" && <button className="public-report-secondary" type="button" onClick={startNewReport}>Discard pending submission</button>}
        {locked && phase !== "pending" && <button className="public-report-secondary" type="button" onClick={startNewReport}>Start a new report</button>}
      </>}
    </article>
  </main>;
}
