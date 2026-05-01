import { useMemo, useState } from "react";
import {
  FiMessageSquare,
  FiSearch,
  FiStar,
  FiThumbsDown,
  FiThumbsUp,
} from "react-icons/fi";
import PageHeader from "../components/ui/PageHeader";
import { useTourismData } from "../context/TourismDataContext";

function FeedbackMonitoring() {
  const { feedbackEntries, referenceTables, updateFeedbackEntry } =
    useTourismData();

  const [search, setSearch] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [replyError, setReplyError] = useState("");

  const stats = useMemo(() => {
    return {
      total: feedbackEntries.length,
      positive: feedbackEntries.filter((entry) => entry.status === "positive")
        .length,
      neutral: feedbackEntries.filter((entry) => entry.status === "neutral")
        .length,
      negative: feedbackEntries.filter((entry) => entry.status === "negative")
        .length,
    };
  }, [feedbackEntries]);

const keyword = search.trim().toLowerCase();

  const filteredFeedback = feedbackEntries.filter((entry) => {
    const destinationName = getDestinationName(entry.destinationId);

    const destinationMatch =
      !destinationId || String(entry.destinationId) === String(destinationId);

    const statusMatch = !statusFilter || entry.status === statusFilter;

    const searchText = [
      entry.reviewer,
      entry.title,
      entry.message,
      entry.reply,
      entry.status,
      destinationName,
      entry.date,
    ]
      .join(" ")
      .toLowerCase();

    return destinationMatch && statusMatch && searchText.includes(keyword);
  });

  function getDestinationName(id) {
    return (
      referenceTables.resorts.find(
        (resort) => String(resort.resort_id) === String(id)
      )?.resort_name || "--"
    );
  }

  function openReply(entry) {
    setReplyingId(entry.id);
    setReplyText(entry.reply || "");
    setReplyError("");
  }

  function closeReply() {
    setReplyingId(null);
    setReplyText("");
    setReplyError("");
  }

  function getErrorMessage(error) {
    if (error?.details?.detail) {
      return error.details.detail;
    }

    if (error?.details && typeof error.details === "object") {
      return Object.entries(error.details)
        .map(([field, messages]) => {
          const text = Array.isArray(messages) ? messages.join(" ") : messages;
          return `${field}: ${text}`;
        })
        .join(" ");
    }

    return error?.message || "Unable to save reply. Please try again.";
  }

  async function saveReply(entry) {
    if (!replyText.trim()) {
      setReplyError("Reply message cannot be empty.");
      return;
    }

    setSavingReply(true);
    setReplyError("");

    try {
      await updateFeedbackEntry(entry.id, { reply: replyText.trim() });
      closeReply();
    } catch (error) {
      setReplyError(getErrorMessage(error));
    } finally {
      setSavingReply(false);
    }
  }

  return (
    <div className="feedback-page">
      <PageHeader
        eyebrow="Tourism Monitoring"
        title="Feedback Monitoring"
        description="Review tourist feedback, classify sentiment, and manage office replies."
      />

      <div className="feedback-stats">
        <StatCard title="Total Feedback" value={stats.total} />
        <StatCard title="Positive" value={stats.positive} icon={<FiThumbsUp />} />
        <StatCard title="Neutral" value={stats.neutral} />
        <StatCard title="Negative" value={stats.negative} icon={<FiThumbsDown />} />
      </div>

      <div className="feedback-filters">
        <div className="feedback-search">
          <FiSearch />
          <input
            type="search"
            placeholder="Search reviewer, destination, message, or reply..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          value={destinationId}
          onChange={(event) => setDestinationId(event.target.value)}
        >
          <option value="">All destinations</option>
          {referenceTables.resorts.map((resort) => (
            <option key={resort.resort_id} value={resort.resort_id}>
              {resort.resort_name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
      </div>

      {replyError ? <p className="tourist-record-error">{replyError}</p> : null}

      <div className="feedback-list">
        {filteredFeedback.length ? (
          filteredFeedback.map((entry) => (
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
                      className={index < Number(entry.rating || 0) ? "filled" : "muted"}
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
                        onClick={closeReply}
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
                <span className={`status ${entry.status}`}>
                  {entry.status}
                </span>

                <button
                  type="button"
                  className="reply-btn"
                  onClick={() => openReply(entry)}
                >
                  <FiMessageSquare size={12} />
                  {entry.reply ? "Edit Reply" : "Reply"}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="feedback-empty">
            No feedback found for the selected filters.
          </div>
        )}
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

      {icon ? <div className="icon">{icon}</div> : null}
    </div>
  );
}

export default FeedbackMonitoring;