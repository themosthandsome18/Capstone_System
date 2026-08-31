import React from "react";
import "./MaubanTourismLoader.css";

/**
 * Animated Mauban Tourism Logo Loader
 *
 * Pixel-accurate vector animation based on the official Mauban Tourism Logo:
 * - Vibrant hot magenta / fuchsia woven Banig background
 * - Iconic straw-yellow Mauban Buntal Hat with bright green ribbon and rosette flower
 * - Sailing and bobbing boat with dark pine-green hull, wooden mast, and dual white sails
 * - 3 distinct rolling parallax ocean waves (Electric Cyan, Cerulean, and Deep Navy)
 *
 * @param {Object} props
 * @param {number} [props.size=170] - Width and height in px
 * @param {boolean} [props.showGlow=true] - Whether to show ambient glowing backdrop
 */
export default function MaubanTourismLoader({ size = 170, showGlow = true }) {
  return (
    <div
      className="mauban-tourism-loader"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label="Mauban Tourism Animated Logo"
    >
      {showGlow && <div className="mauban-tourism-loader__glow" />}

      <svg
        viewBox="0 0 500 500"
        className="mauban-tourism-loader__svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Circular Clip for the Logo Emblem */}
          <clipPath id="maubanCircleClip">
            <circle cx="250" cy="250" r="230" />
          </clipPath>

          {/* Woven Banig Pattern matching the exact pink/magenta weave */}
          <pattern
            id="banigWeavePattern"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            {/* Base tile */}
            <rect width="80" height="80" fill="#d81558" />
            {/* Vertical weave block */}
            <rect x="0" y="0" width="40" height="80" fill="#c2134e" />
            {/* Horizontal weave block */}
            <rect x="40" y="0" width="40" height="40" fill="#e91e63" opacity="0.6" />
            <rect x="40" y="40" width="40" height="40" fill="#ad1457" opacity="0.5" />
            <rect x="0" y="40" width="40" height="40" fill="#f06292" opacity="0.25" />
            {/* Weave separation lines */}
            <line x1="40" y1="0" x2="40" y2="80" stroke="#f48fb1" strokeWidth="1" opacity="0.3" />
            <line x1="0" y1="40" x2="80" y2="40" stroke="#f48fb1" strokeWidth="1" opacity="0.3" />
          </pattern>

          {/* Golden Buntal Hat Gradient */}
          <linearGradient id="buntalHatGrad" x1="130" y1="110" x2="430" y2="290" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff2ad" />
            <stop offset="35%" stopColor="#fae38c" />
            <stop offset="80%" stopColor="#f7d86f" />
            <stop offset="100%" stopColor="#eec74b" />
          </linearGradient>

          {/* Clean White Sail Gradient */}
          <linearGradient id="sailGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>

          {/* Dark Pine Hull Gradient */}
          <linearGradient id="hullGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#143d2b" />
            <stop offset="100%" stopColor="#0d291d" />
          </linearGradient>
        </defs>

        {/* Main Emblem Layer clipped inside the Circle */}
        <g clipPath="url(#maubanCircleClip)">
          {/* 1. Hot Magenta Base Background */}
          <rect width="500" height="500" fill="#d81558" />

          {/* 2. Banig Weave Texture Grid */}
          <rect width="500" height="500" fill="url(#banigWeavePattern)" />

          {/* ===================================================
              3. THE MAUBAN BUNTAL HAT
              =================================================== */}
          <g className="mauban-buntal-hat">
            {/* Crown Dome (Back Layer) */}
            <path
              d="M 238 155 C 248 100, 345 100, 362 178 C 324 188, 276 182, 238 155 Z"
              fill="#fae38c"
            />

            {/* Sweeping Crescent Brim (Official Mauban curve) */}
            <path
              d="M 135 120 C 185 130, 275 115, 355 205 C 388 242, 420 278, 432 282 C 398 282, 342 254, 292 216 C 242 178, 192 142, 135 120 Z"
              fill="url(#buntalHatGrad)"
            />

            {/* Crown Main Surface */}
            <path
              d="M 240 148 C 265 112, 345 112, 360 182 C 332 190, 282 186, 240 148 Z"
              fill="url(#buntalHatGrad)"
            />

            {/* Bright Green Hat Ribbon Band */}
            <path
              d="M 250 135 Q 295 175, 328 215"
              stroke="#00a859"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 252 135 Q 295 175, 326 215"
              stroke="#00c853"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              opacity="0.9"
            />

            {/* 5-Petal Green Rosette Flower */}
            <g transform="translate(328, 218)" className="mauban-hat-flower">
              <circle cx="0" cy="-10" r="7.5" fill="#00c853" />
              <circle cx="9.5" cy="-3.5" r="7.5" fill="#00a859" />
              <circle cx="6" cy="8" r="7.5" fill="#009245" />
              <circle cx="-6" cy="8" r="7.5" fill="#009245" />
              <circle cx="-9.5" cy="-3.5" r="7.5" fill="#00a859" />
              <circle cx="0" cy="0" r="5" fill="#006837" />
            </g>
          </g>

          {/* ===================================================
              4. SAILING BOAT LAYER (Rides & bobs along waves)
              =================================================== */}
          <g className="mauban-sailing-boat">
            <g transform="translate(0, 242)">
              {/* Boat Hull */}
              <path
                d="M 10 38 L 180 38 Q 150 62, 95 62 Q 40 62, 10 38 Z"
                fill="url(#hullGrad)"
                stroke="#0d291d"
                strokeWidth="2"
              />

              {/* Wooden Mast */}
              <line
                x1="95"
                y1="-86"
                x2="95"
                y2="40"
                stroke="#6d1a24"
                strokeWidth="4.5"
                strokeLinecap="round"
              />

              {/* Main Sail (Left Crisp White Triangle) */}
              <polygon
                points="90,-80 16,32 90,32"
                fill="url(#sailGrad)"
                stroke="#e2e8f0"
                strokeWidth="1.5"
              />

              {/* Jib Sail (Right Crisp White Triangle) */}
              <polygon
                points="100,-68 164,32 100,32"
                fill="url(#sailGrad)"
                stroke="#e2e8f0"
                strokeWidth="1.5"
              />

              {/* Water Splash / Wake under hull */}
              <ellipse cx="28" cy="42" rx="14" ry="3.5" fill="#ffffff" opacity="0.75" />
              <ellipse cx="160" cy="42" rx="10" ry="3" fill="#ffffff" opacity="0.65" />
            </g>
          </g>

          {/* ===================================================
              5. ROLLING OCEAN WAVES (Exact Colors from Logo)
              =================================================== */}
          {/* Wave 1: Top Bright Electric Cyan (#00d4ff) */}
          <path
            className="mauban-wave wave-cyan"
            d="M -500 286 Q -450 268 -400 286 T -300 286 T -200 286 T -100 286 T 0 286 T 100 286 T 200 286 T 300 286 T 400 286 T 500 286 T 600 286 T 700 286 T 800 286 T 900 286 T 1000 286 L 1000 500 L -500 500 Z"
            fill="#00d4ff"
          />

          {/* Wave 2: Mid Ocean Cerulean Blue (#0099cc) */}
          <path
            className="mauban-wave wave-azure"
            d="M -500 314 Q -450 298 -400 314 T -300 314 T -200 314 T -100 314 T 0 314 T 100 314 T 200 314 T 300 314 T 400 314 T 500 314 T 600 314 T 700 314 T 800 314 T 900 314 T 1000 314 L 1000 500 L -500 500 Z"
            fill="#0099cc"
          />

          {/* Wave 3: Deep Bottom Navy Ocean (#163e4c) */}
          <path
            className="mauban-wave wave-deep"
            d="M -500 342 Q -450 328 -400 342 T -300 342 T -200 342 T -100 342 T 0 342 T 100 342 T 200 342 T 300 342 T 400 342 T 500 342 T 600 342 T 700 342 T 800 342 T 900 342 T 1000 342 L 1000 500 L -500 500 Z"
            fill="#163e4c"
          />
        </g>

        {/* Outer Circular Ring Outline */}
        <circle
          cx="250"
          cy="250"
          r="230"
          stroke="#ffffff"
          strokeWidth="6"
          fill="none"
        />
      </svg>
    </div>
  );
}
