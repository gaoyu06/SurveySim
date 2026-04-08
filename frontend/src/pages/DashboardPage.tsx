import { useQuery } from "@tanstack/react-query";
import { Button, List, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { ConversationQuickStart } from "@/components/onboarding/ConversationQuickStart";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

export function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const surveys = useQuery({
    queryKey: ["surveys"],
    queryFn: () => apiClient.get<any[]>("/surveys"),
  });
  const runs = useQuery({
    queryKey: ["mock-runs"],
    queryFn: () => apiClient.get<any[]>("/mock-runs"),
  });

  const shortcuts = [
    { label: t("dashboard.shortcutImportSurvey"), action: () => navigate("/content-tasks/import") },
    { label: t("dashboard.shortcutCreateTemplate"), action: () => navigate("/templates") },
    { label: t("dashboard.shortcutOpenRuns"), action: () => navigate("/mock-runs") },
  ];

  return (
    <>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <ConversationQuickStart />

      <Panel style={{ marginBottom: 18, padding: 0, overflow: "hidden" }}>
        <div className="dashboard-shortcuts-card">
          <div className="dashboard-shortcuts-card__intro">
            <div className="dashboard-shortcuts-card__eyebrow">{t("dashboard.quickActions")}</div>
            <Typography.Title level={3} className="dashboard-shortcuts-card__title">
              {t("dashboard.quickActions")}
            </Typography.Title>
            <div className="dashboard-shortcuts-card__stats">
              <div className="dashboard-shortcuts-card__stat">
                <span>{t("dashboard.latestSurveys")}</span>
                <strong>{surveys.data?.length ?? 0}</strong>
              </div>
              <div className="dashboard-shortcuts-card__stat">
                <span>{t("dashboard.latestRuns")}</span>
                <strong>{runs.data?.length ?? 0}</strong>
              </div>
            </div>
          </div>

          <div className="dashboard-shortcuts-card__actions">
            {shortcuts.map((shortcut, index) => (
              <Button
                key={shortcut.label}
                type={index === 0 ? "primary" : "default"}
                size="large"
                block
                className="dashboard-shortcuts-card__button"
                onClick={shortcut.action}
              >
                {shortcut.label}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="workspace-grid">
        <Panel>
          <Typography.Title level={4}>{t("dashboard.latestRuns")}</Typography.Title>
          <List
            locale={{ emptyText: t("dashboard.emptyRuns") }}
            dataSource={(runs.data ?? []).slice(0, 6)}
            renderItem={(item: any) => (
              <List.Item>
                <List.Item.Meta
                  title={item.name}
                  description={t("dashboard.runDesc", {
                    participants: item.participantCount,
                    responses: item.progress?.responseCompleted ?? 0,
                  })}
                />
                <Tag color={item.status === "completed" ? "green" : item.status === "failed" ? "red" : "blue"}>{t(`status.${item.status}`)}</Tag>
              </List.Item>
            )}
          />
        </Panel>
        <Panel>
          <Typography.Title level={4}>{t("dashboard.latestSurveys")}</Typography.Title>
          <List
            locale={{ emptyText: t("dashboard.emptySurveys") }}
            dataSource={(surveys.data ?? []).slice(0, 6)}
            renderItem={(item: any) => (
              <List.Item>
                <List.Item.Meta
                  title={item.title}
                  description={t("dashboard.surveyDesc", { sections: item.schema?.sections?.length ?? 0 })}
                />
              </List.Item>
            )}
          />
        </Panel>
      </div>
    </>
  );
}
