import React from "react";
import "./LoadingOverlay.css";

/**
 * Thematic Action LoadingOverlay Component
 * Used for blocking full-screen interactions during saves, updates, or API mutations.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Show/hide overlay
 * @param {string} [props.message="Please wait..."] - Action description
 * @param {"tourism" | "sanitation" | "neutral"} [props.theme] - Color styling theme
 */
function LoadingOverlay({ visible, message = "Please wait...", theme }) {
  if (!visible) return null;

  return (
    <div
      className={`loading-overlay ${theme ? `loading-overlay--${theme}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="loading-overlay__box">
        <div className="loading-overlay__art" aria-hidden="true">
          <div className="loading-overlay__pulse-glow" />
          <div className="loading-overlay__ring-outer" />
          <div className="loading-overlay__ring-inner" />
          <div className="loading-overlay__core-dot" />
        </div>
        <p className="loading-overlay__message">{message}</p>
      </div>
    </div>
  );
}

export default LoadingOverlay;
