import React from "react";
import maubanLogo from "../tourism/assets/logoMauban.jpg";
import MaubanTourismLoader from "./MaubanTourismLoader";
import "./PageLoader.css";

/**
 * Clean & Minimal Thematic PageLoader Component
 * Displays only the smooth animated logo with ambient backdrop glow.
 *
 * @param {Object} props
 * @param {"fullscreen" | "content"} [props.variant="content"] - Display style
 * @param {"tourism" | "sanitation" | "neutral"} [props.theme="tourism"] - Color & logo theme
 */
export default function PageLoader({
  variant = "content",
  theme = "tourism",
  message = "",
  subtext = "",
}) {
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
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Normal Sanitation Loader: Official Mauban Municipal Seal with Emerald Circular Spinner
 */
function SanitationNormalLoader() {
  return (
    <div className="sanitation-normal-loader">
      <div className="sanitation-normal-loader__ring-outer">
        <div className="sanitation-normal-loader__ring-inner" />
        <img
          src={maubanLogo}
          alt="Municipality of Mauban"
          className="sanitation-normal-loader__logo"
        />
      </div>
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
