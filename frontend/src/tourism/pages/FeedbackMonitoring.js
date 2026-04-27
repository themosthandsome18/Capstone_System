import { useState } from "react";
import {
  FiMessageSquare,
  FiStar,
  FiThumbsDown,
  FiThumbsUp,
} from "react-icons/fi";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

function FeedbackMonitoring() {
  const { feedbackEntries, referenceTables, updateFeedbackEntry } =
    useTourismData();
  const [destinationId, setDestinationId] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [replyError, setReplyError] = useState("");

  const filteredFeedback = feedbackEntries.filter((entry) => {
    const destinationMatch =
      !destinationId || String(entry.destinationId) === destinationId;

    const ratingMatch = !ratingFilter || entry.status === ratingFilter;

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

  function openReply(entry) {
    setReplyingId(entry.id);
    setReplyText(entry.reply || "");
    setReplyError("");
  }

  async function saveReply(entry) {
    setSavingReply(true);
    setReplyError("");

    try {
      await updateFeedbackEntry(entry.id, { reply: replyText });
      setReplyingId(null);
      setReplyText("");
    } catch (error) {
      setReplyError("Unable to save reply. Please try again.");
    } finally {
      setSavingReply(false);
    }
  }

  return (
    <div className="feedback-page">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Feedback Monitoring"
        description="Manage resorts and tourist feedback in Mauban, Quezon"
      />

      <div className="feedback-stats">
        <StatCard title="Total Feedback" value={stats.total} />
        <StatCard title="Positive" value={stats.positive} icon={<FiThumbsUp />} />
        <StatCard title="Neutral" value={stats.neutral} />
        <StatCard title="Negative" value={stats.negative} icon={<FiThumbsDown />} />
      </div>

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

      {replyError ? <p className="tourist-record-error">{replyError}</p> : null}

      <div className="feedback-list">
        {filteredFeedback.map((entry) => (
          <div key={entry.id} className="feedback-card">
            <div className="feedback-left">
              <h3>{entry.reviewer}</h3>

              <p className="meta">
                {getDestinationName(entry.destinationId)} | {entry.date}
              </p>

              <div className="stars" aria-label={`${entry.rating} of 5 stars`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <FiStar
                    key={index}
                    className={index < entry.rating ? "filled" : "muted"}
                  />
                ))}
              </div>

              <p className="feedback-title">{entry.title}</p>
              <p className="message">{entry.message}</p>

              {entry.reply ? (
                <div className="feedback-reply">
                  <strong>Office reply</strong>
                  <p>{entry.reply}</p>
                </div>
              ) : null}

              {replyingId === entry.id ? (
                <div className="feedback-reply-form">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    rows={3}
                    placeholder="Write an office reply..."
                  />
                  <div>
                    <button
                      type="button"
                      className="tourist-record-cancel"
                      onClick={() => setReplyingId(null)}
                      disabled={savingReply}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="tourist-record-save"
                      onClick={() => saveReply(entry)}
                      disabled={savingReply}
                    >
                      {savingReply ? "Saving..." : "Save Reply"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="feedback-right">
              <span className={`status ${entry.status}`}>{entry.status}</span>

              <button
                type="button"
                className="reply-btn"
                onClick={() => openReply(entry)}
              >
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
