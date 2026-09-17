import React, { useEffect, useState } from "react";
import { FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import maubanLogo from "../tourism/assets/logoMauban.jpg";
import MaubanTourismLoader from "./MaubanTourismLoader";
import "./PageLoader.css";

/**
 * Clean & Minimal Thematic PageLoader Component
 * Displays the smooth animated logo with ambient backdrop glow,
 * a slow-connection wake-up notice if loading exceeds 5s,
 * and an explicit error/retry card if a bootstrap request fails or times out.
 *
 * @param {Object} props
 * @param {"fullscreen" | "content"} [props.variant="content"] - Display style
 * @param {"tourism" | "sanitation" | "neutral"} [props.theme="tourism"] - Color & logo theme
 * @param {string} [props.message] - Primary title
 * @param {string} [props.subtext] - Secondary description
 * @param {string} [props.error] - Error message if connection failed
 * @param {Function} [props.onRetry] - Callback to retry connection
 * @param {string} [props.slowMessage] - Custom notice when loading exceeds 5 seconds
 */
export default function PageLoader({
  variant = "content",
  theme = "tourism",
  message = "",
  subtext = "",
  error = "",
  onRetry = null,
  slowMessage = "Still connecting — the server may be waking up, this can take up to a minute...",
}) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (error) return;
    const timer = setTimeout(() => {
      setIsSlow(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [error]);

  if (error) {
    return (
      <div
        className={`page-loader page-loader--${variant} page-loader--${theme} page-loader--has-error`}
        role="alert"
        aria-live="assertive"
      >
        <div className="page-loader__backdrop-glow" />
        <div className="page-loader__content-wrap page-loader__error-wrap">
          <div className="page-loader__error-icon">
            <FiAlertCircle size={40} />
          </div>
          <div className="page-loader__text-wrap">
            <h3 className="page-loader__title">{message || "Connection Failed"}</h3>
            <p className="page-loader__subtext">{subtext || "Unable to reach the server."}</p>
            {error && <div className="page-loader__error-message">{error}</div>}
          </div>
          {onRetry && (
            <button
              type="button"
              className="page-loader__retry-btn"
              onClick={onRetry}
            >
              <FiRefreshCw size={15} /> Retry Connection
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`page-loader page-loader--${variant} page-loader--${theme}`}
      role="status"
      aria-label={message || "Loading..."}
    >
      <div className="page-loader__backdrop-glow" />

      <div className="page-loader__content-wrap">
        <div className="page-loader__logo-wrap">
          {theme === "tourism" && <MaubanTourismLoader size={200} />}
          {theme === "sanitation" && <SanitationNormalLoader />}
          {theme === "neutral" && <MunicipalLoaderArt />}
        </div>

        {(message || subtext) && (
          <div className="page-loader__text-wrap">
            {message && <h3 className="page-loader__title">{message}</h3>}
            {subtext && <p className="page-loader__subtext">{subtext}</p>}
            <div className="page-loader__progress-bar">
              <div className="page-loader__progress-indicator" />
            </div>
            {isSlow && (
              <div className="page-loader__slow-notice">
                <span className="page-loader__pulse-dot" />
                <span>{slowMessage}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Clean & Minimalist Circular Spinner for Sanitation
 */
function SanitationNormalLoader() {
  return (
    <div className="sanitation-normal-loader">
      <div className="sanitation-spinner" />
    </div>
  );
}

/**
 * Municipal Art: Official Mauban Seal & Intertwined Dual Orbits (Tourism + Sanitation)
 */
function MunicipalLoaderArt() {
  return (
    <div className="municipal-art">
      <div className="municipal-art__glow" />

      {/* Dual Intersecting Orbital Rings */}
      <div className="municipal-art__orbit-tourism">
        <span className="orbit-dot dot-tourism" />
      </div>
      <div className="municipal-art__orbit-sanitation">
        <span className="orbit-dot dot-sanitation" />
      </div>

      {/* Mauban Municipal Seal Center */}
      <div className="municipal-art__seal-wrap">
        <img
          src={maubanLogo}
          alt="Municipality of Mauban"
          className="municipal-art__seal-img"
        />
        <div className="municipal-art__seal-ring" />
      </div>
    </div>
  );
}
