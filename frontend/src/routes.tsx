import { App, Result, Spin } from "antd";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { UserDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { AppShell } from "@/components/layout/AppShell";
import { authStore } from "@/stores/auth.store";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { LlmConfigsPage } from "@/pages/LlmConfigsPage";
import { ParticipantTemplatesPageV2 } from "@/pages/ParticipantTemplatesPageV2";
import { SurveysListPage } from "@/pages/SurveysListPage";
import { SurveysImportPage } from "@/pages/SurveysImportPage";
import { SurveyImportStreamPage } from "@/pages/SurveyImportStreamPage";
import { SurveyPreviewPage } from "@/pages/SurveyPreviewPage";
import { MockRunsPage } from "@/pages/MockRunsPage";
import { MockRunDetailPage } from "@/pages/MockRunDetailPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { TranslationPage } from "@/pages/TranslationPage";
import { TranslationProjectPage } from "@/pages/TranslationProjectPage";
import { SystemSettingsPage } from "@/pages/SystemSettingsPage";
import { UserManagementPage } from "@/pages/UserManagementPage";
import { useI18n } from "@/i18n/I18nProvider";

function ProtectedLayout() {
  const token = authStore((state) => state.token);
  const user = authStore((state) => state.user);
  const setSession = authStore((state) => state.setSession);
  const clearSession = authStore((state) => state.clearSession);
  const [loading, setLoading] = useState(Boolean(token && !user));
  const { notification } = App.useApp();
  const location = useLocation();

  useEffect(() => {
    if (!token || user) return;
    setLoading(true);
    apiClient
      .get<UserDto>("/auth/me")
      .then((currentUser) => setSession(token, currentUser))
      .catch((error) => {
        clearSession();
        notification.error({ message: error.message });
      })
      .finally(() => setLoading(false));
  }, [token, user, setSession, clearSession, notification]);

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return <AppShell />;
}

export function AppRoutes() {
  const { t } = useI18n();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="llm-configs" element={<LlmConfigsPage />} />
        <Route path="templates" element={<ParticipantTemplatesPageV2 />} />
        <Route path="content-tasks" element={<SurveysListPage />} />
        <Route path="content-tasks/import" element={<SurveysImportPage />} />
        <Route path="content-tasks/import/stream" element={<SurveyImportStreamPage />} />
        <Route path="content-tasks/:id/preview" element={<SurveyPreviewPage />} />
        <Route path="mock-runs" element={<MockRunsPage />} />
        <Route path="mock-runs/:id" element={<MockRunDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="translation" element={<TranslationPage />} />
        <Route path="translation/projects/:id" element={<TranslationProjectPage />} />
        <Route path="admin/users" element={<UserManagementPage />} />
        <Route path="admin/settings" element={<SystemSettingsPage />} />
      </Route>
      <Route path="*" element={<Result status="404" title="404" subTitle={t("routes.notFound")} />} />
    </Routes>
  );
}
