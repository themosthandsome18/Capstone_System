import { useCallback, useEffect, useMemo, useState } from "react";
import { FiActivity, FiRefreshCw } from "react-icons/fi";

import { apiRequest, buildQueryString } from "../apiClient";
import "./ActivityLogsPage.css";


const actionOptions = [
  { value: "", label: "All Actions" },
  { value: "create", label: "Created" },
  { value: "update", label: "Updated" },
  { value: "delete", label: "Deleted" },
];


function ActivityLogsPage({ module }) {
  const [action, setAction] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const moduleLabel = module === "sanitation" ? "Sanitation" : "Tourism";

  const summary = useMemo(() => {
    return logs.reduce(
      (totals, log) => ({
        create: totals.create + (log.action === "create" ? 1 : 0),
        update: totals.update + (log.action === "update" ? 1 : 0),
        delete: totals.delete + (log.action === "delete" ? 1 : 0),
      }),
      { create: 0, update: 0, delete: 0 }
    );
  }, [logs]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const query = buildQueryString({
        module,
        action,
        limit: 150,
      });
      const response = await apiRequest(`/activity-logs/${query}`);
      setLogs(response);
    } catch (requestError) {
      setError(requestError.message || "Unable to load activity logs.");
    } finally {
      setLoading(false);
    }
  }, [action, module]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="activity-page">
      <header className="activity-header">
        <div>
          <h1>Activity Logs</h1>
          <p>{moduleLabel} module changes and recent staff actions</p>
        </div>

        <button type="button" className="activity-refresh" onClick={loadLogs}>
          <FiRefreshCw />
          Refresh
        </button>
      </header>

      <div className="activity-summary-grid">
        <ActivitySummary label="Created" value={summary.create} tone="create" />
        <ActivitySummary label="Updated" value={summary.update} tone="update" />
        <ActivitySummary label="Deleted" value={summary.delete} tone="delete" />
      </div>

      <section className="activity-table-card">
        <div className="activity-tools">
          <div className="activity-title">
            <FiActivity />
            <span>Recent Activity</span>
          </div>

          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            {actionOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="activity-error">{error}</p> : null}

        <div className="activity-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Record Type</th>
                <th>Record</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="activity-empty">
                    Loading activity logs...
                  </td>
                </tr>
              ) : logs.length ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>
                      <strong>{log.user_display}</strong>
                      <small>{log.username || "deleted-user"}</small>
                    </td>
                    <td>
                      <span className={`activity-action ${log.action}`}>
                        {log.action_label}
                      </span>
                    </td>
                    <td>{log.record_type}</td>
                    <td>
                      <strong>{log.record_label}</strong>
                      {log.record_id ? <small>ID: {log.record_id}</small> : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="activity-empty">
                    No activity logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


function ActivitySummary({ label, value, tone }) {
  return (
    <section className={`activity-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}


function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}


export default ActivityLogsPage;
