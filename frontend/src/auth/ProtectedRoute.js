import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getDefaultRouteForRole, useAuth } from "./AuthContext";


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
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  return <Outlet />;
}


export default ProtectedRoute;
