import { ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, List, Progress, Space, Table, Typography } from "antd";
import { useMemo, useState, type Key } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";

export function MockRunDetailPage() {
  const { id = "" } = useParams();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
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
      message.success("Participants queued for retry");
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
        title={runQuery.data?.name ?? "Mock run detail"}
        subtitle="Observe stage-level progress, inspect participant-level failures, and selectively rerun broken personas or responses."
        actions={
          <Space>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["mock-run", id] })}>
              Refresh
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={retryMutation.isPending}
              disabled={selectedParticipantIds.length === 0}
              onClick={() => retryMutation.mutate()}
            >
              Retry selected
            </Button>
          </Space>
        }
      />
      <div className="workspace-grid">
        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>Overall progress</Typography.Title>
            <Progress percent={percent} status={runQuery.data?.status === "failed" ? "exception" : "active"} />
            <List
              dataSource={[
                ["Identity completed", runQuery.data?.progress?.identityCompleted ?? 0],
                ["Persona completed", runQuery.data?.progress?.personaCompleted ?? 0],
                ["Responses completed", runQuery.data?.progress?.responseCompleted ?? 0],
                ["Failures", runQuery.data?.progress?.failed ?? 0],
                ["Canceled", runQuery.data?.progress?.canceled ?? 0],
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
            <Typography.Title level={4}>Execution log</Typography.Title>
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
          <Typography.Title level={4}>Participants</Typography.Title>
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
              { title: "Status", dataIndex: "status" },
              { title: "Persona", dataIndex: "personaStatus" },
              { title: "Response", dataIndex: "responseStatus" },
              {
                title: "Identity",
                render: (_: unknown, item: any) => JSON.stringify(item.identity),
              },
              {
                title: "Error",
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
