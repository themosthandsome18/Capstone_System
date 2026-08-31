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
}) {
  return (
    <div
      className={`page-loader page-loader--${variant} page-loader--${theme}`}
      role="status"
      aria-label="Loading..."
    >
      <div className="page-loader__backdrop-glow" />

      <div className="page-loader__logo-wrap">
        {theme === "tourism" && <MaubanTourismLoader size={200} />}
        {theme === "sanitation" && <SanitationLoaderArt />}
        {theme === "neutral" && <MunicipalLoaderArt />}
      </div>
    </div>
  );
}

/**
 * Sanitation Art: Health & Inspection Shield, Verification Check, Scanner Beam & Clean Sparkles
 */
function SanitationLoaderArt() {
  return (
    <div className="sanitation-art">
      {/* Ambient hygiene emerald glow */}
      <div className="sanitation-art__glow" />

      {/* Clean wave pulse rings */}
      <div className="sanitation-art__pulse-ring s-ring-1" />
      <div className="sanitation-art__pulse-ring s-ring-2" />

      {/* Shield Graphic */}
      <div className="sanitation-art__shield-wrap">
        <svg className="sanitation-art__shield" viewBox="0 0 100 116" fill="none">
          <path
            d="M50 4L8 22v42c0 30.8 18 50.4 42 58 24-7.6 42-27.2 42-58V22L50 4z"
            fill="url(#shieldGrad)"
            stroke="url(#shieldBorder)"
            strokeWidth="3"
          />
          <path
            d="M50 14L18 28v36c0 24.2 14.2 39.8 32 46 17.8-6.2 32-21.8 32-46V28L50 14z"
            fill="url(#shieldInner)"
            opacity="0.9"
          />
          <defs>
            <linearGradient id="shieldGrad" x1="50" y1="4" x2="50" y2="122" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10b981" />
              <stop offset="0.6" stopColor="#059669" />
              <stop offset="1" stopColor="#064e3b" />
            </linearGradient>
            <linearGradient id="shieldBorder" x1="0" y1="0" x2="100" y2="116" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6ee7b7" />
              <stop offset="0.5" stopColor="#34d399" />
              <stop offset="1" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="shieldInner" x1="50" y1="14" x2="50" y2="110" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="1" stopColor="#064e3b" stopOpacity="0.7" />
            </linearGradient>
          </defs>
        </svg>

        {/* Laser Inspection Scanner Bar */}
        <div className="sanitation-art__scanner" />

        {/* Verified Checkmark in Shield Center */}
        <div className="sanitation-art__check-wrap">
          <svg className="sanitation-art__check" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" fill="#ffffff" fillOpacity="0.95" />
            <path
              d="M12 20.5l5.5 5.5L28 15"
              stroke="#059669"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Floating Clean / Hygiene Sparkles */}
      <div className="sanitation-art__sparkle sp-1">✨</div>
      <div className="sanitation-art__sparkle sp-2">🌱</div>
      <div className="sanitation-art__sparkle sp-3">💧</div>
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
