import { useState } from "react";
import { FiLock, FiUser } from "react-icons/fi";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import maubanLogo from "../tourism/assets/logoMauban.jpg";
import { getDefaultRouteForRole, useAuth } from "./AuthContext";
import "./LoginPage.css";


function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, login, role } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return <div className="auth-loading">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const authenticatedUser = await login(username, password);
      const authenticatedRole = authenticatedUser.profile?.role;
      const returnPath = location.state?.from?.pathname;
      const nextPath =
        getSafeReturnPath(authenticatedRole, returnPath) ||
        getDefaultRouteForRole(authenticatedRole);
      navigate(nextPath, { replace: true });
    } catch (requestError) {
      setError(requestError.details?.detail || "Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <aside className="login-brand-panel">
          <div className="brand-mark">
            <img src={maubanLogo} alt="Mauban logo" />
          </div>

          <div className="brand-copy">
            <p className="brand-kicker">Mauban Monitoring System</p>
            <h1>Welcome Back!</h1>
            <p>Access your assigned module with your staff account.</p>
          </div>
        </aside>

        <section className="login-form-panel">
          <div className="login-heading">
            <h2>welcome</h2>
            <p>Login into your account to continue</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <FiUser />
              <input
                autoComplete="username"
                placeholder="Username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>

            <label className="login-field">
              <FiLock />
              <input
                autoComplete="current-password"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error ? <p className="login-error">{error}</p> : null}

            <button
              type="submit"
              className="login-submit"
              disabled={submitting}
            >
              {submitting ? "LOGGING IN..." : "LOG IN"}
            </button>

            <p className="login-note">Authorized accounts only</p>
          </form>
        </section>
      </section>
    </main>
  );
}


function getSafeReturnPath(role, returnPath) {
  if (!returnPath || returnPath === "/login") {
    return "";
  }

  if (role === "admin") {
    return returnPath === "/module-selection" ? returnPath : "";
  }

  if (role === "tourism") {
    return returnPath.startsWith("/sanitation") ? "" : returnPath;
  }

  if (role === "sanitation") {
    return returnPath.startsWith("/sanitation") ? returnPath : "";
  }

  return "";
}


export default LoginPage;
