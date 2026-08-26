import React from "react";
import "./PageLoader.css";

/**
 * Premium PageLoader Component
 * @param {Object} props
 * @param {string} [props.message="Loading data..."] - Primary title text
 * @param {string} [props.subtext] - Secondary description
 * @param {"fullscreen" | "content"} [props.variant="content"] - Display style
 * @param {"sanitation" | "tourism" | "neutral"} [props.theme="sanitation"] - Color theme
 */
export default function PageLoader({
  message = "Loading data...",
  subtext,
  variant = "content",
  theme = "sanitation",
}) {
  return (
    <div className={`page-loader page-loader--${variant} page-loader--${theme}`}>
      <div className="page-loader__card">
        {/* Glow halo behind the spinner */}
        <div className="page-loader__glow" />

        {/* Dual-ring gradient spinner */}
        <div className="page-loader__spinner-wrap">
          <div className="page-loader__ring-outer" />
          <div className="page-loader__ring-inner" />
          <div className="page-loader__core-dot" />
        </div>

        {/* Animated text block */}
        <div className="page-loader__text-group">
          <h3 className="page-loader__title">{message}</h3>
          {subtext && <p className="page-loader__subtext">{subtext}</p>}
        </div>

        {/* Shimmer progress bar */}
        <div className="page-loader__progress">
          <div className="page-loader__progress-bar" />
        </div>
      </div>
    </div>
  );
}
