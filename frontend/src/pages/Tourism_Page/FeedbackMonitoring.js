import { useState } from "react";
import {
  FiMessageSquare,
  FiThumbsDown,
  FiThumbsUp,
} from "react-icons/fi";
import PageHeader from "../../components/ui/PageHeader";
import { useTourismData } from "../../context/TourismDataContext";

function FeedbackMonitoring() {
  const { feedbackEntries, referenceTables } = useTourismData();
  const [destinationId, setDestinationId] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");

  const filteredFeedback = feedbackEntries.filter((entry) => {
    const destinationMatch =
      !destinationId || String(entry.destinationId) === destinationId;

    const ratingMatch =
      !ratingFilter ||
      entry.status === ratingFilter;

    return destinationMatch && ratingMatch;
  });

  const stats = {
    total: feedbackEntries.length,
    positive: feedbackEntries.filter((e) => e.status === "positive").length,
    neutral: feedbackEntries.filter((e) => e.status === "neutral").length,
    negative: feedbackEntries.filter((e) => e.status === "negative").length,
  };

  function getDestinationName(id) {
    return (
      referenceTables.resorts.find((r) => r.resort_id === id)?.resort_name ||
      "--"
    );
  }

  return (
    <div className="feedback-page">

      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Feedback Monitoring"
        description="Manage resorts and tourist feedback in Mauban, Quezon"
      />

      {/* STATS */}
      <div className="feedback-stats">
        <StatCard title="Total Feedback" value={stats.total} />
        <StatCard title="Positive" value={stats.positive} icon={<FiThumbsUp />} />
        <StatCard title="Neutral" value={stats.neutral} />
        <StatCard title="Negative" value={stats.negative} icon={<FiThumbsDown />} />
      </div>

      {/* FILTERS */}
      <div className="feedback-filters">
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
        >
          <option value="">all destination</option>
          {referenceTables.resorts.map((r) => (
            <option key={r.resort_id} value={r.resort_id}>
              {r.resort_name}
            </option>
          ))}
        </select>

        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
        >
          <option value="">all ratings</option>
          <option value="positive">positive</option>
          <option value="neutral">neutral</option>
          <option value="negative">negative</option>
        </select>
      </div>

      {/* FEEDBACK LIST */}
      <div className="feedback-list">
        {filteredFeedback.map((entry) => (
          <div key={entry.id} className="feedback-card">

            <div className="feedback-left">
              <h3>{entry.reviewer}</h3>

              <p className="meta">
                {getDestinationName(entry.destinationId)} • {entry.date}
              </p>

              <div className="stars">
                {"★".repeat(entry.rating)}
                <span>{"★".repeat(5 - entry.rating)}</span>
              </div>

              <p className="message">{entry.message}</p>
            </div>

            <div className="feedback-right">
              <span className={`status ${entry.status}`}>
                {entry.status}
              </span>

              <button className="reply-btn">
                <FiMessageSquare size={12} />
                Reply
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="feedback-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      {icon && <div className="icon">{icon}</div>}
    </div>
  );
}

export default FeedbackMonitoring;