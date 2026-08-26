import "./LoadingOverlay.css";

/**
 * LoadingOverlay
 *
 * A full-screen semi-transparent overlay with a spinner.
 * When visible, it blocks all user interactions (clicks, keyboard, etc.)
 * to prevent double-submissions during API calls.
 *
 * Props:
 *   visible  {boolean}  — show/hide the overlay
 *   message  {string}   — optional label under the spinner
 */
function LoadingOverlay({ visible, message = "Loading..." }) {
  if (!visible) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-label={message}>
      <div className="loading-overlay__box">
        <div className="loading-overlay__spinner" aria-hidden="true">
          <div className="loading-overlay__ring" />
        </div>
        <p className="loading-overlay__message">{message}</p>
      </div>
    </div>
  );
}

export default LoadingOverlay;
