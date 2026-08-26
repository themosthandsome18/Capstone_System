import React, { Component } from "react";
import { FiAlertTriangle, FiRefreshCw, FiChevronDown, FiChevronUp } from "react-icons/fi";
import "./ErrorBoundary.css";

/**
 * Feature-Level ErrorBoundary
 * Isolates runtime errors so that a failure in one feature/page
 * does not crash the entire application, preserving the sidebar,
 * topbar, authentication, and other modules.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error for diagnostics
    console.error(
      `[ErrorBoundary] Feature "${this.props.featureName || 'Unknown'}" crashed:`,
      error,
      errorInfo
    );
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      const featureTitle = this.props.featureName || "This Feature";

      return (
        <div className="feature-error-boundary">
          <div className="feature-error-card">
            <div className="feature-error-badge">
              <FiAlertTriangle className="feature-error-icon" />
            </div>

            <h2 className="feature-error-title">{featureTitle} Encountered an Issue</h2>
            <p className="feature-error-desc">
              An unexpected error occurred in this module, but <strong>the rest of the system is running safely</strong>.
              You can try reloading this feature, or switch to another section using the sidebar.
            </p>

            <div className="feature-error-actions">
              <button
                type="button"
                className="feature-error-btn primary"
                onClick={this.handleReset}
              >
                <FiRefreshCw className="btn-icon" />
                Reload Feature
              </button>

              <button
                type="button"
                className="feature-error-btn outline"
                onClick={this.toggleDetails}
              >
                {this.state.showDetails ? <FiChevronUp /> : <FiChevronDown />}
                {this.state.showDetails ? "Hide Error Details" : "View Error Details"}
              </button>
            </div>

            {this.state.showDetails && (
              <div className="feature-error-details">
                <p className="error-message">
                  <strong>Error:</strong> {this.state.error?.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="error-stack">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-Order Component to wrap any page/component with an ErrorBoundary
 * Usage: const IsolatedDashboard = withErrorBoundary(Dashboard, "Dashboard");
 */
export function withErrorBoundary(ComponentToWrap, featureName) {
  return function WrappedWithBoundary(props) {
    return (
      <ErrorBoundary featureName={featureName}>
        <ComponentToWrap {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
