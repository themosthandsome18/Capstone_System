import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSanitationEstablishments, fetchSanitationInspections, fetchSanitationRenewals } from "../services/sanitationApi";
import { buildEstablishmentReport, recordId, recordedDate, recordedText, recordedTimestamp, validateReportResponses } from "./establishmentReportData";
import "./EstablishmentHistoryReport.css";

const SCOPE_NOTE = "Recorded inspections and current renewal records, not a complete immutable compliance audit. Deleted records and earlier versions are not available here.";
const EMPTY = { establishments: [], inspections: [], renewals: [] };
function failureText(error) {
  return (typeof error?.details?.detail === "string" && error.details.detail) || error?.message || "Request failed.";
}
async function readSource(label, request) {
  try { return await request(); } catch (error) { throw new Error(`${label}: ${failureText(error)}`); }
}
export default function EstablishmentHistoryReport() {
  const [selectedId, setSelectedId] = useState("");
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ status: "loading", data: EMPTY, error: "", retrievedAt: "" });
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const [printError, setPrintError] = useState("");
  useEffect(() => {
    let current = true;
    setState((previous) => ({ ...previous, status: "loading", error: "" }));
    Promise.all([
      readSource("Establishment records", fetchSanitationEstablishments),
      readSource("Inspection records", fetchSanitationInspections),
      readSource("Renewal records", () => fetchSanitationRenewals()),
    ]).then(([establishments, inspections, renewals]) => {
      const data = validateReportResponses(establishments, inspections, renewals);
      if (current) setState({ status: "success", data, error: "", retrievedAt: new Date().toISOString() });
    }).catch((error) => {
      if (current) setState((previous) => ({ ...previous, status: "error", error: failureText(error) }));
    });
    return () => { current = false; };
  }, [reload]);

  const report = useMemo(() => state.status === "success" ? buildEstablishmentReport(state.data, selectedId) : null,
    [state, selectedId]);
  useEffect(() => {
    if (!printSnapshot) return undefined;
    const finish = () => setPrintSnapshot(null);
    window.addEventListener("afterprint", finish);
    try { window.print(); } catch (error) {
      setPrintError("The report could not be printed. Please try again."); finish();
    }
    return () => window.removeEventListener("afterprint", finish);
  }, [printSnapshot]);

  function refresh() { setPrintSnapshot(null); setPrintError(""); setReload((value) => value + 1); }
  function print() {
    if (state.status !== "success" || !report) return;
    setPrintError(""); setPrintSnapshot({ report, retrievedAt: state.retrievedAt });
  }
  return (
    <section className="establishment-history-report" aria-labelledby="establishment-history-heading">
      <div className="ehr-controls">
        <div><h2 id="establishment-history-heading">Individual Establishment Report</h2><p>{SCOPE_NOTE}</p></div>
        <div className="ehr-actions">
          <button type="button" onClick={refresh} disabled={state.status === "loading"}>Reload report data</button>
          <button type="button" onClick={print} disabled={!report}>Print selected establishment</button>
        </div>
      </div>
      <label className="ehr-selector">Select establishment
        <select value={selectedId} onChange={(event) => { setPrintSnapshot(null); setPrintError(""); setSelectedId(event.target.value); }}>
          <option value="">Select an establishment</option>
          {state.data.establishments.map((row) => <option key={recordId(row.id)} value={recordId(row.id)}>
            {recordedText(row.business_name)} — ID {recordId(row.id)} — {recordedText(row.barangay)}
          </option>)}
          {selectedId && !state.data.establishments.some((row) => recordId(row.id) === selectedId) &&
            <option value={selectedId}>Selected establishment ID {selectedId}</option>}
        </select>
      </label>
      {state.status === "loading" && <p role="status">Loading report records. Printing is unavailable until all report requests succeed.</p>}
      {state.status === "error" && <div role="alert"><p>{state.error}</p><p>Report data is unavailable. This does not mean there are no records.</p><button type="button" onClick={refresh}>Retry report data</button></div>}
      {printError && <p role="alert">{printError}</p>}
      {state.status === "success" && (!state.data.establishments.length ? <p role="status">No establishment records were returned.</p> :
        !selectedId ? <p role="status">Select an establishment to view its recorded information.</p> :
        !report ? <p role="status">The selected establishment is not in the loaded records. Select another establishment or reload.</p> :
        <ReportBody report={report} retrievedAt={state.retrievedAt} />)}
      {printSnapshot && createPortal(
        <div className="establishment-history-print" aria-label="Selected establishment print report">
          <h1>Individual Establishment Report</h1>
          <p>{SCOPE_NOTE}</p>
          <ReportBody {...printSnapshot} />
        </div>, document.body)}
    </section>
  );
}
function Field({ label, children }) { return <div><dt>{label}</dt><dd>{children}</dd></div>; }
function ReportBody({ report, retrievedAt }) {
  const { establishment: row, inspections, renewals, drafts, unknownFinalization } = report;
  return <div className="ehr-body">
    <h3>{recordedText(row.business_name)} — Establishment ID {recordId(row.id)}</h3>
    <p className="ehr-metadata">Data retrieved: {retrievedAt}</p>
    <dl className="ehr-fields">
      <Field label="Owner / manager">{recordedText(row.owner_name)}</Field>
      <Field label="Business type">{recordedText(row.business_type_name)}</Field>
      <Field label="Barangay">{recordedText(row.barangay)}</Field>
      <Field label="Address">{recordedText(row.address)}</Field>
      <Field label="Contact number">{recordedText(row.contact_number)}</Field>
      <Field label="Permit on record">{row.has_permit === true ? "Yes (recorded)" : row.has_permit === false ? "No (recorded)" : "Not recorded"}</Field>
      <Field label="Permit number">{recordedText(row.permit_number)}</Field>
      <Field label="Permit class">{recordedText(row.permit_size_label || row.permit_size)}</Field>
      <Field label="Current recorded permit status">{recordedText(row.permit_status_label || row.permit_status)}</Field>
      <Field label="Recorded permit issue date">{recordedDate(row.permit_issued_date)}</Field>
      <Field label="Recorded permit expiry date">{recordedDate(row.permit_expiry_date)}</Field>
    </dl>
    <h3>Finalized inspection records ({inspections.length})</h3>
    <p>Ordered by recorded inspection date, earliest first. Same-date records use ID order; this does not establish their sequence within that day. Undated records appear last.</p>
    <p>Excluded from this chronology: {drafts} draft record(s); {unknownFinalization} record(s) with no recorded finalization state.</p>
    <p>Inspector names below are stored text, not authenticated identities established by this report.</p>
    {!inspections.length && <p>No finalized inspection records were returned for this establishment.</p>}
    {inspections.map((inspection) => <article className="ehr-inspection" key={recordId(inspection.id)} aria-label={`Inspection ${recordId(inspection.id)}`}>
      <h4>Inspection ID {recordId(inspection.id)} — {recordedDate(inspection.inspection_date)}</h4>
      <dl className="ehr-fields">
        <Field label="Recorded result">{recordedText(inspection.status_after_inspection_label || inspection.status_after_inspection)}</Field>
        <Field label="Inspector (recorded name)">{recordedText(inspection.inspector_name)}</Field>
        <Field label="Recorded next due date">{recordedDate(inspection.next_due_date)}</Field>
        <Field label="Findings">{recordedText(inspection.findings)}</Field>
        <Field label="Remarks">{recordedText(inspection.remarks)}</Field>
      </dl>
      <h5>Recorded checklist</h5>
      {!inspection.checklist_items?.length ? <p>No checklist entries were returned; compliance cannot be inferred.</p> :
        <div className="ehr-table-scroll"><table><thead><tr><th>Requirement</th><th>Recorded finding</th><th>Notes</th></tr></thead><tbody>
          {inspection.checklist_items.map((item, index) => <tr key={item.id || index}>
            <td>{recordedText(item.requirement_name)}</td><td>{item.is_complied === true ? "Recorded complied" : item.is_complied === false ? "Recorded not complied" : "Not recorded"}</td><td>{recordedText(item.notes)}</td>
          </tr>)}
        </tbody></table></div>}
    </article>)}
    <h3>Current renewal records ({renewals.length})</h3>
    <p>Ordered by record creation timestamp, earliest first; ties use ID. Missing creation timestamps appear last. Stages are current recorded values, not a history of stage transitions. Dates are displayed as recorded; timestamps retain their supplied time zone.</p>
    {!renewals.length ? <p>No renewal records were returned for this establishment.</p> :
      <div className="ehr-table-scroll"><table className="ehr-renewals"><thead><tr><th>Renewal</th><th>Current recorded stage</th><th>Actual recorded dates</th><th>Recorded remarks</th></tr></thead><tbody>
        {renewals.map((renewal) => <tr key={recordId(renewal.id)}>
          <td>ID {recordId(renewal.id)}<br />{recordedText(renewal.renewal_id)}<br />Permit: {recordedText(renewal.permit_number)}<br />{recordedText(renewal.permit_type)}</td>
          <td>{recordedText(renewal.stage_label || renewal.stage)}</td>
          <td>Record created: {recordedTimestamp(renewal.created_at)}<br />Last updated: {recordedTimestamp(renewal.updated_at)}<br />Expiry: {recordedDate(renewal.expiration_date)}<br />Recorded release date: {recordedDate(renewal.released_at)}</td>
          <td>{recordedText(renewal.remarks)}</td>
        </tr>)}
      </tbody></table></div>}
    <p className="ehr-metadata">All records returned for the selected ID are included. Current permit information does not establish past permit validity. No scores or historical transitions are inferred.</p>
  </div>;
}
