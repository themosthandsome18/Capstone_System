import { useState } from "react";
import { FiMessageSquare, FiThumbsDown, FiThumbsUp } from "react-icons/fi";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

function FeedbackMonitoring() {
  const { feedbackEntries, referenceTables } = useTourismData();
  const [destinationId, setDestinationId] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");

  const filteredFeedback = feedbackEntries.filter((entry) => {
    const destinationMatch = !destinationId || String(entry.destinationId) === destinationId;
    const ratingMatch =
      !ratingFilter ||
      (ratingFilter === "positive" && entry.status === "positive") ||
      (ratingFilter === "neutral" && entry.status === "neutral") ||
      (ratingFilter === "negative" && entry.status === "negative");

    return destinationMatch && ratingMatch;
  });

  const stats = {
    total: feedbackEntries.length,
    positive: feedbackEntries.filter((entry) => entry.status === "positive").length,
    neutral: feedbackEntries.filter((entry) => entry.status === "neutral").length,
    negative: feedbackEntries.filter((entry) => entry.status === "negative").length,
  };

  function getDestinationName(id) {
    return referenceTables.resorts.find((item) => item.resort_id === id)?.resort_name || "--";
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Feedback Monitoring"
        description=""
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="figma-stat-card">
          <p className="text-[11px] text-slate-500">Total Feedback</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Positive</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stats.positive}</p>
            </div>
            <FiThumbsUp className="text-emerald-500" size={18} />
          </div>
        </div>
        <div className="figma-stat-card">
          <p className="text-[11px] text-slate-500">Neutral</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.neutral}</p>
        </div>
        <div className="figma-stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500">Negative</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stats.negative}</p>
            </div>
            <FiThumbsDown className="text-rose-500" size={18} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <select
          value={destinationId}
          onChange={(event) => setDestinationId(event.target.value)}
          className="input-base max-w-[280px] rounded-full"
        >
          <option value="">all destination</option>
          {referenceTables.resorts.map((item) => (
            <option key={item.resort_id} value={item.resort_id}>
              {item.resort_name}
            </option>
          ))}
        </select>
        <select
          value={ratingFilter}
          onChange={(event) => setRatingFilter(event.target.value)}
          className="input-base max-w-[280px] rounded-full"
        >
          <option value="">all ratings</option>
          <option value="positive">positive</option>
          <option value="neutral">neutral</option>
          <option value="negative">negative</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredFeedback.map((entry) => (
          <div key={entry.id} className="panel px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{entry.reviewer}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {getDestinationName(entry.destinationId)} • {entry.date}
                </p>
                <p className="mt-2 text-amber-500">
                  {"★".repeat(entry.rating)}
                  <span className="text-slate-300">{"★".repeat(5 - entry.rating)}</span>
                </p>
                <p className="mt-2 text-sm text-slate-700">{entry.message}</p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                    entry.status === "positive"
                      ? "bg-emerald-100 text-emerald-700"
                      : entry.status === "neutral"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {entry.status}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700"
                >
                  <FiMessageSquare className="mr-1 inline" size={11} />
                  Reply
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FeedbackMonitoring;
