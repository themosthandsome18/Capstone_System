import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FiCheck, FiRotateCcw, FiX } from "react-icons/fi";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";
import { canOpenSettings } from "../settingsAccess";
import { CHART_PALETTE_DEFAULTS, useTourismChartPalette } from "../theme/chartPalette";
import {
  CONTRAST_WHITE_FLOOR,
  DEFAULT_PRIMARY_COLOR,
  contrastRatio,
  deriveTourismTheme,
  isHexColor,
} from "../theme/deriveTourismTheme";
import { useTourismThemePreview } from "../theme/themePreview";

// Mirrors backend/api/serializers.py (TOURISM_THEME_*): the server enforces the
// same limits and always restores the original green.
export const MAX_SAVED_COLORS = 12;
const MAX_LABEL_LENGTH = 40;
const ORIGINAL = { hex: DEFAULT_PRIMARY_COLOR, label: "Original (Green)" };

// Contrast of WHITE text on the chosen colour (white is what buttons, the
// selected menu item and other filled parts use). Thresholds:
//   < 2.5:1  very hard to read (the floor recorded in THEME_TOKENS.md section 7)
//   < 3:1    hard to read (below WCAG's 3:1 minimum for large text and controls)
//   < 4.5:1  fine for buttons and headings, short of 4.5:1 for small text (note only)
// Warnings never block saving: the admin decides.
export const CONTRAST_POOR = 3;
export const CONTRAST_GOOD = 4.5;

export function assessWhiteContrast(hex) {
  const ratio = contrastRatio("#FFFFFF", hex);
  const shown = `${ratio.toFixed(1)}:1`;
  if (ratio < CONTRAST_WHITE_FLOOR) {
    return {
      level: "severe",
      ratio,
      message: `White text on this colour is very hard to read (${shown}). Labels on buttons and on the selected menu item may be almost invisible. You can still save it, but a darker colour is strongly recommended.`,
    };
  }
  if (ratio < CONTRAST_POOR) {
    return {
      level: "poor",
      ratio,
      message: `White text on this colour is hard to read (${shown}). Buttons and the selected menu item use white text, so their labels may be hard to see. You can still save this colour.`,
    };
  }
  if (ratio < CONTRAST_GOOD) {
    return {
      level: "fair",
      ratio,
      message: `White text on this colour is readable on buttons and headings (${shown}), though below the 4.5:1 recommended for small text.`,
    };
  }
  return { level: "good", ratio, message: `White text on this colour is easy to read (${shown}).` };
}

function normaliseHex(value) {
  const text = String(value || "").trim();
  const withHash = text.startsWith("#") ? text : `#${text}`;
  return isHexColor(withHash) ? withHash.toUpperCase() : null;
}

function normaliseSaved(list) {
  const seen = new Set([ORIGINAL.hex]);
  const rest = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const hex = normaliseHex(item && item.hex);
    if (!hex || seen.has(hex)) return;
    seen.add(hex);
    rest.push({ hex, label: String(item.label || hex).slice(0, MAX_LABEL_LENGTH) });
  });
  // The original green is always first and always present.
  return [ORIGINAL, ...rest];
}

function draftFromTheme(theme) {
  const source = theme && typeof theme === "object" ? theme : {};
  return {
    primary_color: normaliseHex(source.primary_color) || DEFAULT_PRIMARY_COLOR,
    mobile_follows_web: source.mobile_follows_web !== false,
    mobile_primary_color: normaliseHex(source.mobile_primary_color) || "",
    saved_colors: normaliseSaved(source.saved_colors),
  };
}

function Settings() {
  const { role } = useAuth();
  // The route is guarded too (App.js); this keeps the page safe on its own.
  if (!canOpenSettings(role)) {
    return <Navigate to="/" replace />;
  }
  return <AppearanceSettings />;
}

function AppearanceSettings() {
  const { theme, saveTheme } = useTourismData();
  const { setPreviewColor } = useTourismThemePreview();
  const chartPalette = useTourismChartPalette() || CHART_PALETTE_DEFAULTS;

  const saved = useMemo(() => draftFromTheme(theme), [theme]);
  const [draft, setDraft] = useState(saved);
  const [hexText, setHexText] = useState(saved.primary_color);
  const [mobileHexText, setMobileHexText] = useState(saved.mobile_primary_color);
  const [newLabel, setNewLabel] = useState("");
  const [savedColorsMessage, setSavedColorsMessage] = useState("");
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [saving, setSaving] = useState(false);

  // Live preview: the whole shell takes the colour being tried, before saving.
  useEffect(() => {
    setPreviewColor(draft.primary_color !== saved.primary_color ? draft.primary_color : null);
  }, [draft.primary_color, saved.primary_color, setPreviewColor]);

  // Leaving the page (navigating away, logging out) drops any unsaved preview.
  useEffect(() => () => setPreviewColor(null), [setPreviewColor]);

  const derived = useMemo(() => deriveTourismTheme(draft.primary_color), [draft.primary_color]);
  const contrast = assessWhiteContrast(draft.primary_color);
  const mobileContrast =
    !draft.mobile_follows_web && draft.mobile_primary_color
      ? assessWhiteContrast(draft.mobile_primary_color)
      : null;
  const hexInvalid = !normaliseHex(hexText);
  const mobileHexInvalid = !draft.mobile_follows_web && !normaliseHex(mobileHexText);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const atLimit = draft.saved_colors.length >= MAX_SAVED_COLORS;

  function update(changes) {
    setDraft((current) => ({ ...current, ...changes }));
    setStatus({ kind: "", text: "" });
  }

  function choosePrimary(hex) {
    update({ primary_color: hex });
    setHexText(hex);
  }

  function handleHexText(value) {
    setHexText(value);
    const hex = normaliseHex(value);
    if (hex) update({ primary_color: hex });
  }

  function handleMobileLink(follows) {
    const changes = { mobile_follows_web: follows };
    if (!follows && !draft.mobile_primary_color) {
      changes.mobile_primary_color = draft.primary_color;
      setMobileHexText(draft.primary_color);
    }
    update(changes);
  }

  function chooseMobile(hex) {
    update({ mobile_primary_color: hex });
    setMobileHexText(hex);
  }

  function handleMobileHexText(value) {
    setMobileHexText(value);
    const hex = normaliseHex(value);
    if (hex) update({ mobile_primary_color: hex });
  }

  function addSavedColor() {
    if (atLimit) {
      setSavedColorsMessage(limitMessage);
      return;
    }
    if (draft.saved_colors.some((item) => item.hex === draft.primary_color)) {
      setSavedColorsMessage("This colour is already in your saved colours.");
      return;
    }
    const label = newLabel.trim() || draft.primary_color;
    update({ saved_colors: [...draft.saved_colors, { hex: draft.primary_color, label }] });
    setNewLabel("");
    setSavedColorsMessage("");
  }

  function removeSavedColor(hex) {
    if (hex === ORIGINAL.hex) return; // never removable; the server restores it anyway
    update({ saved_colors: draft.saved_colors.filter((item) => item.hex !== hex) });
    setSavedColorsMessage("");
  }

  function handleCancel() {
    setDraft(saved);
    setHexText(saved.primary_color);
    setMobileHexText(saved.mobile_primary_color);
    setSavedColorsMessage("");
    setStatus({ kind: "", text: "" });
  }

  function handleResetToGreen() {
    choosePrimary(ORIGINAL.hex);
    setStatus({ kind: "info", text: "Original green selected. Press Save to keep it." });
  }

  async function handleSave() {
    if (hexInvalid || mobileHexInvalid) return;
    setSaving(true);
    setStatus({ kind: "", text: "" });
    try {
      const response = await saveTheme({
        primary_color: draft.primary_color,
        mobile_follows_web: draft.mobile_follows_web,
        mobile_primary_color: draft.mobile_primary_color,
        saved_colors: draft.saved_colors,
      });
      const next = draftFromTheme(response);
      setDraft(next);
      setHexText(next.primary_color);
      setMobileHexText(next.mobile_primary_color);
      setStatus({ kind: "success", text: "Saved. The tourism system now uses this colour." });
    } catch (error) {
      setStatus({ kind: "error", text: error.message || "The colour could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const derivedSwatches = [
    { label: "Hover", value: derived["--th-primary-hover"] },
    { label: "Tint", value: derived["--th-primary-tint"] },
    {
      label: "Page background",
      value: `${derived["--th-page-grad-1"]} → ${derived["--th-page-grad-3"]}`,
      background: `linear-gradient(135deg, ${derived["--th-page-grad-1"]}, ${derived["--th-page-grad-2"]}, ${derived["--th-page-grad-3"]})`,
    },
    { label: "Ink", value: derived["--th-primary-ink"] },
  ];

  return (
    <div className="reports-page settings-page">
      <div className="reports-header">
        <div>
          <h1>Settings</h1>
          <p>How the tourism system looks</p>
        </div>

        <div className="reports-actions">
          <button type="button" onClick={handleResetToGreen} disabled={saving}>
            <FiRotateCcw />
            Reset to original green
          </button>
          <button type="button" onClick={handleCancel} disabled={saving || !dirty}>
            <FiX />
            Cancel
          </button>
          <button
            type="button"
            className="green"
            onClick={handleSave}
            disabled={saving || !dirty || hexInvalid || mobileHexInvalid}
          >
            <FiCheck />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {status.text ? (
        <p className={`settings-status ${status.kind}`} role="status">
          {status.text}
        </p>
      ) : null}

      <div className="report-tabs" role="tablist" aria-label="Settings sections">
        <button type="button" role="tab" aria-selected="true" className="active">
          Appearance
        </button>
      </div>

      <div className="settings-grid">
        <section className="settings-card settings-card-main" aria-labelledby="settings-system-colour">
          <div className="report-card-title">
            <h3 id="settings-system-colour">System colour</h3>
            <p>
              The main colour of the tourism system. The whole system shows it as you pick;
              nothing is kept until you press Save.
            </p>
          </div>

          <div className="settings-picker-row">
            <input
              type="color"
              className="settings-color-input"
              aria-label="System colour"
              value={draft.primary_color.toLowerCase()}
              onChange={(event) => choosePrimary(event.target.value.toUpperCase())}
            />
            <label className="settings-field">
              <span>Hex</span>
              <input
                type="text"
                aria-label="System colour hex"
                value={hexText}
                maxLength={7}
                spellCheck={false}
                onChange={(event) => handleHexText(event.target.value)}
              />
            </label>
          </div>
          {hexInvalid ? (
            <p className="settings-field-error">Enter a colour as #RRGGBB, for example #EF7C1F.</p>
          ) : null}

          <p className={`settings-contrast ${contrast.level}`} data-testid="contrast-message">
            {contrast.message}
          </p>

          <div className="settings-subsection">
            <h4>Worked out from this colour</h4>
            <div className="settings-derived">
              {derivedSwatches.map((item) => (
                <div key={item.label} className="settings-derived-item">
                  <span
                    className="settings-swatch-square"
                    style={{ background: item.background || item.value }}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.value}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-subsection">
            <h4>Saved colours</h4>
            <ul className="settings-saved" aria-label="Saved colours">
              {draft.saved_colors.map((item) => {
                const isOriginal = item.hex === ORIGINAL.hex;
                const selected = item.hex === draft.primary_color;
                return (
                  <li key={item.hex} className="settings-saved-item">
                    <button
                      type="button"
                      className={`settings-swatch ${selected ? "selected" : ""}`}
                      style={{ background: item.hex }}
                      aria-label={`Use ${item.label}`}
                      aria-pressed={selected}
                      title={isOriginal ? `${item.label}: always kept` : `${item.label} (${item.hex})`}
                      onClick={() => choosePrimary(item.hex)}
                    />
                    {isOriginal ? null : (
                      <button
                        type="button"
                        className="settings-swatch-remove"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => removeSavedColor(item.hex)}
                      >
                        <FiX />
                      </button>
                    )}
                    <span className="settings-saved-label">{item.label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="settings-hint">
              The Original (Green) is always kept, so you can return to it.{" "}
              {draft.saved_colors.length} of {MAX_SAVED_COLORS} saved.
            </p>

            <div className="settings-add-row">
              <label className="settings-field">
                <span>Name (optional)</span>
                <input
                  type="text"
                  aria-label="Saved colour name"
                  value={newLabel}
                  maxLength={MAX_LABEL_LENGTH}
                  placeholder={draft.primary_color}
                  onChange={(event) => setNewLabel(event.target.value)}
                />
              </label>
              <button type="button" className="settings-secondary-btn" onClick={addSavedColor} disabled={atLimit}>
                Add current colour
              </button>
            </div>
            {atLimit || savedColorsMessage ? (
              <p className="settings-field-error" role="alert">
                {atLimit ? limitMessage : savedColorsMessage}
              </p>
            ) : null}
          </div>
        </section>

        <div className="settings-side">
          <section className="settings-card" aria-labelledby="settings-chart-palette">
            <div className="report-card-title">
              <h3 id="settings-chart-palette">Chart colours</h3>
              <p>Worked out from the system colour. The Dashboard and Reports charts use them in this order.</p>
            </div>
            <div className="settings-chart-row" data-testid="chart-palette">
              {chartPalette.series.map((colour, index) => (
                <span key={index} className="settings-chart-swatch" style={{ background: colour }} title={colour} />
              ))}
            </div>
          </section>

          <section className="settings-card" aria-labelledby="settings-fixed">
            <div className="report-card-title">
              <h3 id="settings-fixed">Colours that never change</h3>
              <p>Status colours keep their meaning whatever the system colour is.</p>
            </div>
            <div className="settings-chip-row">
              <span className="booking-badge arrived">Arrived</span>
              <span className="booking-badge noshow">No-show</span>
              <span className="booking-badge pending">Pending</span>
              <span className="booking-badge cancelled">Cancelled</span>
            </div>
          </section>

          <section className="settings-card" aria-labelledby="settings-mobile">
            <div className="report-card-title">
              <h3 id="settings-mobile">Mobile app</h3>
              <p>The colour of the tourism mobile app.</p>
            </div>
            <div className="settings-radio-group" role="radiogroup" aria-label="Mobile app colour">
              <label>
                <input
                  type="radio"
                  name="mobile-colour"
                  checked={draft.mobile_follows_web}
                  onChange={() => handleMobileLink(true)}
                />
                Follow the web system colour
              </label>
              <label>
                <input
                  type="radio"
                  name="mobile-colour"
                  checked={!draft.mobile_follows_web}
                  onChange={() => handleMobileLink(false)}
                />
                Use a different colour for the app
              </label>
            </div>

            {draft.mobile_follows_web ? null : (
              <>
                <div className="settings-picker-row">
                  <input
                    type="color"
                    className="settings-color-input"
                    aria-label="Mobile app colour"
                    value={(draft.mobile_primary_color || draft.primary_color).toLowerCase()}
                    onChange={(event) => chooseMobile(event.target.value.toUpperCase())}
                  />
                  <label className="settings-field">
                    <span>Hex</span>
                    <input
                      type="text"
                      aria-label="Mobile app colour hex"
                      value={mobileHexText}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(event) => handleMobileHexText(event.target.value)}
                    />
                  </label>
                </div>
                {mobileHexInvalid ? (
                  <p className="settings-field-error">Enter a colour as #RRGGBB, for example #EF7C1F.</p>
                ) : null}
                {mobileContrast ? (
                  <p className={`settings-contrast ${mobileContrast.level}`}>{mobileContrast.message}</p>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const limitMessage = `You can keep up to ${MAX_SAVED_COLORS} saved colours, including the Original (Green). Remove one to add another.`;

export default Settings;
