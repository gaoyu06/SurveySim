import { useQuery } from "@tanstack/react-query";
import { List, Tag, Typography } from "antd";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";

export function DashboardPage() {
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
    { label: "LLM configs", value: llmConfigs.data?.length ?? 0 },
    { label: "Participant templates", value: templates.data?.length ?? 0 },
    { label: "Surveys", value: surveys.data?.length ?? 0 },
    { label: "Mock runs", value: runs.data?.length ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Command deck"
        subtitle="Track your synthetic research system at a glance, then jump directly into the next high-leverage workflow."
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
          <Typography.Title level={4}>Latest mock runs</Typography.Title>
          <List
            dataSource={(runs.data ?? []).slice(0, 6)}
            renderItem={(item: any) => (
              <List.Item>
                <List.Item.Meta
                  title={item.name}
                  description={`Participants ${item.participantCount} · Responses ${item.progress?.responseCompleted ?? 0}`}
                />
                <Tag
                  color={
                    item.status === "completed"
                      ? "green"
                      : item.status === "failed"
                        ? "red"
                        : "gold"
                  }
                >
                  {item.status}
                </Tag>
              </List.Item>
            )}
          />
        </Panel>
        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>System posture</Typography.Title>
            <Typography.Paragraph style={{ color: "rgba(244,237,225,.72)" }}>
              This MVP is optimized for local-first iteration: build population rules, review
              extracted survey structure before persistence, and launch long-running mock batches
              from the same workspace.
            </Typography.Paragraph>
          </Panel>
          <Panel>
            <Typography.Title level={4}>Recommended next step</Typography.Title>
            <Typography.Paragraph style={{ color: "rgba(244,237,225,.72)" }}>
              1. Create or test an LLM config. 2. Model a participant template. 3. Import a raw
              survey and confirm the structure. 4. Start your first mock run.
            </Typography.Paragraph>
          </Panel>
        </div>
      </div>
    </>
  );
}
