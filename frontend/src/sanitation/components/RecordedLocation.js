export default function RecordedLocation({ record }) {
  if (!record) return null;
  const source = { device_reported: "Device-reported (not physically verified)", manual: "Manual", unknown: "Unknown" }[record.location_source] || "Unknown";
  const accuracy = record.location_accuracy_m;
  return <aside className="hh-form-group modal-field full" aria-label="Recorded location details">
    <strong>Saved location source: {source}</strong>
    <small>Reported accuracy: {typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? `${accuracy} m` : "Unknown"}</small>
    <small>Reported capture time: {record.location_captured_at || "Unknown"}</small>
    {record.location_reported_mock === true && <small>Device reported a mocked location.</small>}
  </aside>;
}
