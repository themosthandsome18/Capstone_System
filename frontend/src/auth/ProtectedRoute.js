import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getDefaultRouteForRole, useAuth } from "./AuthContext";


function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, loading, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="auth-loading">Loading...</div>;
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
