import { useQuery } from "@tanstack/react-query";
import { List, Tag, Typography } from "antd";
import { apiClient } from "@/api/client";
import { useI18n } from "@/i18n/I18nProvider";
import { PageHeader, Panel } from "@/components/PageHeader";

export function DashboardPage() {
  const { t } = useI18n();
  const llmConfigs = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<any[]>("/llm-configs"),
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiClient.get<any[]>("/participant-templates"),
  });
  const surveys = useQuery({
    queryKey: ["surveys"],
    queryFn: () => apiClient.get<any[]>("/surveys"),
  });
  const runs = useQuery({
    queryKey: ["mock-runs"],
    queryFn: () => apiClient.get<any[]>("/mock-runs"),
  });

  const metrics = [
    { label: t("dashboard.metricLlmConfigs"), value: llmConfigs.data?.length ?? 0 },
    { label: t("dashboard.metricTemplates"), value: templates.data?.length ?? 0 },
    { label: t("dashboard.metricSurveys"), value: surveys.data?.length ?? 0 },
    { label: t("dashboard.metricMockRuns"), value: runs.data?.length ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
      />
      <div className="metric-grid" style={{ marginBottom: 18 }}>
        {metrics.map((metric) => (
          <div className="panel metric-card" key={metric.label}>
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
          </div>
        ))}
      </div>
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
