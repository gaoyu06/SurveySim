import { ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, List, Progress, Space, Table, Typography } from "antd";
import { useMemo, useState, type Key } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

export function MockRunDetailPage() {
  const { id = "" } = useParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Key[]>([]);

  const runQuery = useQuery({
    queryKey: ["mock-run", id],
    queryFn: () => apiClient.get<any>(`/mock-runs/${id}`),
    refetchInterval: 3500,
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/mock-runs/${id}/retry`, {
        participantIds: selectedParticipantIds,
      }),
    onSuccess: () => {
      message.success(t("mockRunDetail.retryQueued"));
      queryClient.invalidateQueries({ queryKey: ["mock-run", id] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const percent = useMemo(() => {
    const progress = runQuery.data?.progress;
    if (!progress?.total) return 0;
    return Math.round((progress.responseCompleted / progress.total) * 100);
  }, [runQuery.data?.progress]);

  return (
    <>
      <PageHeader
        title={runQuery.data?.name ?? t("mockRunDetail.titleFallback")}
        subtitle={t("mockRunDetail.subtitle")}
        actions={
          <Space>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["mock-run", id] })}>
              {t("common.refresh")}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={retryMutation.isPending}
              disabled={selectedParticipantIds.length === 0}
              onClick={() => retryMutation.mutate()}
            >
              {t("mockRunDetail.retrySelected")}
            </Button>
          </Space>
        }
      />
      <div className="workspace-grid">
        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>{t("mockRunDetail.overallProgress")}</Typography.Title>
            <Progress percent={percent} status={runQuery.data?.status === "failed" ? "exception" : "active"} />
            <List
              dataSource={[
                [t("mockRunDetail.identityCompleted"), runQuery.data?.progress?.identityCompleted ?? 0],
                [t("mockRunDetail.personaCompleted"), runQuery.data?.progress?.personaCompleted ?? 0],
                [t("mockRunDetail.responsesCompleted"), runQuery.data?.progress?.responseCompleted ?? 0],
                [t("mockRunDetail.failures"), runQuery.data?.progress?.failed ?? 0],
                [t("mockRunDetail.canceled"), runQuery.data?.progress?.canceled ?? 0],
              ]}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta title={String(item[0])} />
                  <Typography.Text>{String(item[1])}</Typography.Text>
                </List.Item>
              )}
            />
          </Panel>
          <Panel>
            <Typography.Title level={4}>{t("mockRunDetail.executionLog")}</Typography.Title>
            <List
              size="small"
              dataSource={runQuery.data?.logs ?? []}
              renderItem={(item: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${item.level.toUpperCase()} · ${item.stage}`}
                    description={`${item.message} · ${new Date(item.createdAt).toLocaleString()}`}
                  />
                </List.Item>
              )}
            />
          </Panel>
        </div>
        <Panel>
          <Typography.Title level={4}>{t("mockRunDetail.participants")}</Typography.Title>
          <Table
            rowKey="id"
            rowSelection={{
              selectedRowKeys: selectedParticipantIds,
              onChange: setSelectedParticipantIds,
            }}
            dataSource={runQuery.data?.participants ?? []}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: "#", dataIndex: "ordinal", width: 72 },
              { title: t("common.status"), dataIndex: "status" },
              { title: t("mockRunDetail.persona"), dataIndex: "personaStatus" },
              { title: t("mockRunDetail.response"), dataIndex: "responseStatus" },
              {
                title: t("mockRunDetail.identity"),
                render: (_: unknown, item: any) => JSON.stringify(item.identity),
              },
              {
                title: t("mockRunDetail.error"),
                dataIndex: "errorMessage",
                ellipsis: true,
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
