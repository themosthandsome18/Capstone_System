import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getDefaultRouteForRole, useAuth } from "./AuthContext";
import { setStoredAuthToken } from "../shared/apiClient";
import { MOBILE_ONLY_MESSAGE, canReachAnyPage } from "./roleAccess";


// Shown instead of a redirect when there is nowhere to send the person: never a blank page, and never a redirect to the place they are already at.
function Refused() {
  // Forget the token on this browser only. The server is not asked to sign out: the token is the same one the person's phone uses.
  function leave() {
    setStoredAuthToken("");
    window.location.assign("/login");
  }

  return (
    <div className="auth-loading auth-session-error" role="alert">
      <p>{MOBILE_ONLY_MESSAGE}</p>
      <button type="button" className="login-submit" onClick={leave}>
        Back to login
      </button>
    </div>
  );
}


function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, loading, role, sessionError, retrySession } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="auth-loading">Loading...</div>;
  }

  // The session check failed for a server or network reason and the token was
  // kept: offer a retry instead of sending the user back to the login screen.
  if (!isAuthenticated && sessionError) {
    return (
      <div className="auth-loading auth-session-error" role="alert">
        <p>{sessionError}</p>
        <button type="button" className="login-submit" onClick={retrySession}>
          Try again
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // A role that reaches no page at all, or whose own first page is the one it was just refused: say so, do not redirect (that would go round for ever).
    const target = getDefaultRouteForRole(role);
    if (!canReachAnyPage(role) || target === location.pathname) {
      return <Refused />;
    }
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}


export default ProtectedRoute;
