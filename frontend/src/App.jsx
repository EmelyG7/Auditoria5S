import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./store/AuthContext";
import Sidebar from "./components/Layout/Sidebar";
import Login from "./pages/Login";
import DashboardAudits from "./pages/DashboardAudits";
import DashboardSurveys from "./pages/DashboardSurveys";
import AuditsPage from "./pages/AuditsPage";
import SurveysPage from "./pages/SurveysPage";
import SchedulePage from "./pages/SchedulePage";
import ReportsPage from "./pages/ReportsPage";
import { Loader2 } from "lucide-react";
import AuditFormPage from "./pages/AuditFormPage";
import UsersPage from "./pages/UsersPage";
import AuditDetailPage from "./pages/AuditDetailPage";

// Layout con sidebar para rutas protegidas
function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className="flex-1 relative z-10 overflow-y-auto"
        style={{ marginLeft: "var(--sidebar-width)", padding: "32px 40px" }}
      >
        <Outlet />
      </main>
    </div>
  );
}

// Guard de autenticación
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  return <Outlet />;
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-primary/40" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard/audits" replace />} />
          <Route path="/dashboard/audits"   element={<DashboardAudits />} />
          <Route path="/dashboard/surveys"  element={<DashboardSurveys />} />
          <Route path="/audits"             element={<AuditsPage />} />
          <Route path="/surveys"            element={<SurveysPage />} />
          <Route path="/schedule"           element={<SchedulePage />} />
          <Route path="/reports"            element={<ReportsPage />} />
          <Route path="/audits/new"         element={<AuditFormPage />} />
          <Route path="/audits/:id/edit"    element={<AuditFormPage />} />
          <Route path="/audits/:id"         element={<AuditDetailPage />} />
          <Route path="/users"              element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}