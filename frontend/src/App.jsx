import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./store/AuthContext";
import { useTheme } from "./store/ThemeContext";
import Sidebar from "./components/Layout/Sidebar";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
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
import AuditAnalysisPage from "./pages/AuditAnalysisPage";
import ProjectsListPage      from "./pages/projects/ProjectsListPage";
import ProjectDetailPage     from "./pages/projects/ProjectDetailPage";
import ProductivityDashboard from "./pages/projects/ProductivityDashboard";
import TimeReportPage        from "./pages/projects/TimeReportPage";
import ReportPreparation     from "./pages/ReportPreparation";
import ReportEditor          from "./pages/ReportEditor";

function AppLayout() {
  const { sidebarCollapsed } = useTheme();
  const marginLeft = sidebarCollapsed
    ? "var(--sidebar-collapsed-width)"
    : "var(--sidebar-width)";

  return (
    <>
      {/* Animated background blobs */}
      <div className="blobs" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="blob b4" />
      </div>

      <div className="flex min-h-screen relative z-10">
        <Sidebar />
        <main
          className="flex-1 overflow-y-auto"
          style={{
            marginLeft,
            padding: "28px 36px",
            transition: "margin-left 0.28s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <Outlet />
        </main>
      </div>
    </>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  return <Outlet />;
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index                        element={<HomePage />} />
          <Route path="/home"                element={<HomePage />} />
          <Route path="/dashboard/audits"    element={<DashboardAudits />} />
          <Route path="/dashboard/surveys"   element={<DashboardSurveys />} />
          <Route path="/audits"              element={<AuditsPage />} />
          <Route path="/surveys"             element={<SurveysPage />} />
          <Route path="/schedule"            element={<SchedulePage />} />
          <Route path="/reports"             element={<ReportsPage />} />
          <Route path="/audits/new"          element={<AuditFormPage />} />
          <Route path="/audits/:id/analysis" element={<AuditAnalysisPage />} />
          <Route path="/audits/:id/edit"     element={<AuditFormPage />} />
          <Route path="/audits/:id"          element={<AuditDetailPage />} />
          <Route path="/users"               element={<UsersPage />} />
          <Route path="/projects"                  element={<ProjectsListPage />} />
          <Route path="/projects/productivity"     element={<ProductivityDashboard />} />
          <Route path="/projects/time-report"      element={<TimeReportPage />} />
          <Route path="/projects/:projectId"       element={<ProjectDetailPage />} />
          <Route path="/reports/presentation"      element={<ReportPreparation />} />
        </Route>
        {/* Full-bleed: el editor administra su propio sidebar/control-bar fijos
            y su propio @media print, por lo que vive fuera de AppLayout. */}
        <Route path="/reports/presentation/editor" element={<ReportEditor />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
