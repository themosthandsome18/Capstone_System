import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";
import ModuleSelectionPage from "./auth/ModuleSelectionPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import VerifyPermit from "./sanitation/pages/VerifyPermit";

import AppShell from "./tourism/components/layout/AppShell";
import { TourismDataProvider } from "./tourism/context/TourismDataContext";
import { tourismRoutes } from "./tourism/tourismRoutes";

import SanitationAppShell from "./sanitation/components/layout/SanitationAppShell";
import { SanitationDataProvider } from "./sanitation/context/SanitationDataContext";
import { sanitationRoutes } from "./sanitation/sanitationRoutes";

import ErrorBoundary from "./shared/ErrorBoundary";

/**
 * AppModuleProviders
 * Keeps data contexts alive across module switching for instant transitions
 */
function AppModuleProviders({ children }) {
  const { user, role } = useAuth();

  if (!user) {
    return children;
  }

  if (role === "admin") {
    return (
      <TourismDataProvider>
        <SanitationDataProvider>{children}</SanitationDataProvider>
      </TourismDataProvider>
    );
  }

  if (role === "sanitation") {
    return <SanitationDataProvider>{children}</SanitationDataProvider>;
  }

  return <TourismDataProvider>{children}</TourismDataProvider>;
}

/**
 * Main Application Component
 * Structured with Modular Architecture & Fault Isolation (Error Boundaries)
 */
function App() {
  return (
    <ErrorBoundary featureName="System Root">
      <AuthProvider>
        <BrowserRouter>
          <AppModuleProviders>
            <Routes>
              {/* Public & Authentication Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-permit/:code" element={<VerifyPermit />} />

              {/* Module Selection (Admin Only) */}
              <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                <Route path="/module-selection" element={<ModuleSelectionPage />} />
              </Route>

              {/* Tourism Module Routes */}
              <Route element={<ProtectedRoute allowedRoles={["admin", "tourism"]} />}>
                <Route element={<AppShell />}>
                  {tourismRoutes.map((route) => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={route.element}
                    />
                  ))}
                </Route>
              </Route>

              {/* Sanitation Module Routes */}
              <Route element={<ProtectedRoute allowedRoles={["admin", "sanitation"]} />}>
                <Route path="/sanitation" element={<SanitationAppShell />}>
                  {sanitationRoutes.map((route) => (
                    <Route
                      key={route.path || "sanitation-index"}
                      index={route.index}
                      path={route.path}
                      element={route.element}
                    />
                  ))}
                </Route>
              </Route>

              {/* Catch-all Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppModuleProviders>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
