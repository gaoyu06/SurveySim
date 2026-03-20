import { App, Result, Spin } from "antd";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { UserDto } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { AppShell } from "@/components/layout/AppShell";
import { authStore } from "@/stores/auth.store";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { LlmConfigsPage } from "@/pages/LlmConfigsPage";
import { ParticipantTemplatesPage } from "@/pages/ParticipantTemplatesPage";
import { SurveysPage } from "@/pages/SurveysPage";
import { MockRunsPage } from "@/pages/MockRunsPage";
import { MockRunDetailPage } from "@/pages/MockRunDetailPage";
import { ReportsPage } from "@/pages/ReportsPage";

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
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="llm-configs" element={<LlmConfigsPage />} />
        <Route path="templates" element={<ParticipantTemplatesPage />} />
        <Route path="surveys" element={<SurveysPage />} />
        <Route path="mock-runs" element={<MockRunsPage />} />
        <Route path="mock-runs/:id" element={<MockRunDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
      <Route path="*" element={<Result status="404" title="404" subTitle="Page not found" />} />
    </Routes>
  );
}
