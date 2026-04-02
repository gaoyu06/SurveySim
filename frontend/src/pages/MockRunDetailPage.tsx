import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  DeleteOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, InputNumber, List, Modal, Progress, Space, Table, Tooltip, Typography } from "antd";
import { useMemo, useState, type Key } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  humanizeParticipantAttributeKey,
  mockRunStartModeSchema,
  type MockRunStartInput,
  type ParticipantAttributeDefinitionDto,
  type ParticipantIdentity,
} from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

type ParticipantRow = {
  id: string;
  ordinal: number;
  status: string;
  identity: ParticipantIdentity;
  progressPercent?: number;
  personaStatus?: string;
  personaPrompt?: string;
  responseStatus?: string;
  errorMessage?: string;
};

export function MockRunDetailPage() {
  const { id = "" } = useParams();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Key[]>([]);
  const [appendModalOpen, setAppendModalOpen] = useState(false);
  const [additionalCount, setAdditionalCount] = useState(10);
  const [startModeModalOpen, setStartModeModalOpen] = useState(false);

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

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/mock-runs/${id}`),
    onSuccess: async () => {
      message.success(t("mockRuns.runDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-runs"] });
      queryClient.removeQueries({ queryKey: ["mock-run", id] });
      navigate("/mock-runs");
    },
    onError: (error: Error) => message.error(error.message),
  });

  const controlMutation = useMutation({
    mutationFn: ({ action, body }: { action: "start" | "cancel"; body?: MockRunStartInput }) => apiClient.post(`/mock-runs/${id}/${action}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mock-run", id] });
      await queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-runs"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const appendMutation = useMutation({
    mutationFn: (payload: { additionalCount: number }) => apiClient.post(`/mock-runs/${id}/append-participants`, payload),
    onSuccess: async () => {
      message.success(t("mockRuns.appendSuccess"));
      setAppendModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["mock-run", id] });
      await queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-runs"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const percent = useMemo(() => {
    const progress = runQuery.data?.progress;
    if (!progress?.total) return 0;
    return Math.round((progress.responseCompleted / progress.total) * 100);
  }, [runQuery.data?.progress]);

  const isActive = ["queued", "running", "canceling"].includes(runQuery.data?.status ?? "");
  const isReadonlyRun = runQuery.data?.isOwnedByCurrentUser === false;
  const controlAction = runQuery.data?.status === "canceling" ? "cancel" : isActive ? "cancel" : "start";

  const participants = useMemo<ParticipantRow[]>(() => runQuery.data?.participants ?? [], [runQuery.data?.participants]);
  const templateAttributes = useMemo<ParticipantAttributeDefinitionDto[]>(() => runQuery.data?.templateAttributes ?? [], [runQuery.data?.templateAttributes]);
  const templateAttributeMap = useMemo(
    () => new Map(templateAttributes.map((attribute) => [attribute.key, attribute] as const)),
    [templateAttributes],
  );

  const formatAttributeLabel = (attribute: string) => {
    const resolved = templateAttributeMap.get(attribute);
    const key = `attributes.${attribute}`;
    const translated = t(key);
    return translated === key ? resolved?.displayName ?? humanizeParticipantAttributeKey(attribute) : translated;
  };

  const toDisplayValues = (attribute: string, rawValue: unknown) => {
    if (rawValue == null) return [];

    const definition = templateAttributeMap.get(attribute);
    const presetMap = new Map((definition?.presetValues ?? []).map((item) => [item.value, item.label] as const));

    const mapScalar = (value: string | number | boolean) => presetMap.get(String(value)) ?? String(value);

    if (Array.isArray(rawValue)) {
      return rawValue
        .filter((value): value is string | number | boolean => ["string", "number", "boolean"].includes(typeof value))
        .map(mapScalar);
    }

    if (typeof rawValue === "object") {
      return [];
    }

    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
      return [mapScalar(rawValue)];
    }

    return [];
  };

  const getParticipantVisualState = (participant: ParticipantRow) => {
    const states = [participant.status, participant.personaStatus ?? "pending", participant.responseStatus ?? "pending"];

    if (states.includes("failed")) {
      return {
        key: "failed",
        label: t("status.failed"),
        icon: <CloseCircleFilled style={{ color: "#ef4444", fontSize: 18 }} />,
      };
    }

    if (states.includes("canceled")) {
      return {
        key: "canceled",
        label: t("status.canceled"),
        icon: <ClockCircleOutlined style={{ color: "#94a3b8", fontSize: 18 }} />,
      };
    }

    if (participant.status === "completed" || participant.responseStatus === "completed") {
      return {
        key: "completed",
        label: t("status.completed"),
        icon: <CheckCircleFilled style={{ color: "#22c55e", fontSize: 18 }} />,
      };
    }

    if (participant.personaStatus === "running" || participant.responseStatus === "running") {
      return {
        key: "running",
        label: t("status.running"),
        icon: <LoadingOutlined style={{ color: "#3b82f6", fontSize: 18 }} spin />,
      };
    }

    return {
      key: "pending",
      label: t("status.pending"),
      icon: <ClockCircleOutlined style={{ color: "#64748b", fontSize: 18 }} />,
    };
  };

  const renderIdentity = (identity: ParticipantIdentity) => {
    const identityRecord = identity as Record<string, unknown>;
    const fallbackOrder = ["country", "region", "continent", "gender", "ageRange", "occupation", "educationLevel", "incomeRange", "maritalStatus", "interests", "customTags"];
    const orderedDimensions = Array.from(
      new Set(
        [...templateAttributes.map((attribute) => attribute.key), ...fallbackOrder, ...Object.keys(identityRecord)].filter((item) => item && item !== "noise" && item !== "extra"),
      ),
    );

    const items = orderedDimensions
      .map((attribute) => {
        const values = toDisplayValues(attribute, identityRecord[attribute]);
        if (!values.length) return null;
        return `${formatAttributeLabel(attribute)}: ${values.join(", ")}`;
      })
      .filter(Boolean) as string[];

    const primaryItems = items.slice(0, 3);
    const secondaryItems = items.slice(3, 6);
    const remainderCount = Math.max(0, items.length - 6);

    return (
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Typography.Text strong>
          {primaryItems.length ? primaryItems.join(" · ") : t("mockRunDetail.identityEmpty")}
        </Typography.Text>
        {secondaryItems.length ? (
          <Typography.Text type="secondary">{secondaryItems.join(" · ")}</Typography.Text>
        ) : null}
        {remainderCount > 0 ? (
          <Typography.Text type="secondary">{t("mockRunDetail.identityMore", { count: remainderCount })}</Typography.Text>
        ) : null}
      </Space>
    );
  };

  const confirmDelete = () => {
    if (!runQuery.data) return;
    if (isActive) {
      message.warning(t("mockRuns.deleteBlocked"));
      return;
    }

    Modal.confirm({
      title: t("mockRuns.deleteConfirmTitle"),
      content: t("mockRuns.deleteConfirmDescription", { name: runQuery.data.name }),
      okText: t("common.delete"),
      cancelText: t("common.cancel"),
      okButtonProps: {
        danger: true,
      },
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        await deleteMutation.mutateAsync();
      },
    });
  };

  const handleControl = async () => {
    if (controlAction === "start") {
      setStartModeModalOpen(true);
      return;
    }

    try {
      await controlMutation.mutateAsync({ action: controlAction });
    } catch {
      // handled by mutation
    }
  };

  const handleAppendParticipants = async () => {
    if (isActive) {
      message.warning(t("mockRuns.appendBlocked"));
      return;
    }

    try {
      await appendMutation.mutateAsync({ additionalCount });
    } catch {
      // handled by mutation
    }
  };

  return (
    <>
      <PageHeader
        title={runQuery.data?.name ?? t("mockRunDetail.titleFallback")}
        subtitle={`${t("mockRunDetail.subtitle")}${runQuery.data?.ownerEmail ? ` · ${t("common.owner")}: ${runQuery.data.ownerEmail}` : ""}`}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/mock-runs")}>
              {t("common.back")}
            </Button>
            <Button
              type={controlAction === "start" ? "primary" : "default"}
              danger={controlAction === "cancel"}
              icon={controlAction === "start" ? <PlayCircleOutlined /> : <StopOutlined />}
              loading={runQuery.data?.status === "canceling" || controlMutation.isPending}
              disabled={runQuery.data?.status === "canceling" || isReadonlyRun}
              onClick={handleControl}
            >
              {runQuery.data?.status === "canceling" ? t("status.canceling") : controlAction === "start" ? t("mockRuns.start") : t("mockRuns.cancel")}
            </Button>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["mock-run", id] })}>
              {t("common.refresh")}
            </Button>
            <Button
              icon={<PlusOutlined />}
              disabled={isActive || isReadonlyRun}
              onClick={() => setAppendModalOpen(true)}
            >
              {t("mockRuns.appendParticipants")}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={retryMutation.isPending}
              disabled={selectedParticipantIds.length === 0 || isReadonlyRun}
              onClick={() => retryMutation.mutate()}
            >
              {t("mockRunDetail.retrySelected")}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleteMutation.isPending}
              disabled={isReadonlyRun}
              onClick={confirmDelete}
            >
              {t("mockRuns.delete")}
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
            <div className="run-log-shell">
              <div className="run-log-fade run-log-fade--top" />
              <div className="run-log-body">
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
              </div>
              <div className="run-log-fade run-log-fade--bottom" />
            </div>
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
            dataSource={participants}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: "#", dataIndex: "ordinal", width: 72 },
              {
                title: t("common.status"),
                width: 84,
                align: "center",
                render: (_: unknown, item: ParticipantRow) => {
                  const visual = getParticipantVisualState(item);
                  const tooltipLines = [visual.label];
                  if (item.errorMessage) {
                    tooltipLines.push(item.errorMessage);
                  }

                  return <Tooltip title={tooltipLines.join(" · ")}>{visual.icon}</Tooltip>;
                },
              },
              {
                title: t("mockRunDetail.identity"),
                render: (_: unknown, item: ParticipantRow) => (
                  <Tooltip
                    placement="leftTop"
                    title={
                      item.personaPrompt ? (
                        <div style={{ maxWidth: 420, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{item.personaPrompt}</div>
                      ) : (
                        t("mockRunDetail.personaUnavailable")
                      )
                    }
                  >
                    <div>{renderIdentity(item.identity)}</div>
                  </Tooltip>
                ),
              },
              {
                title: t("mockRunDetail.responseProgress"),
                width: 220,
                render: (_: unknown, item: ParticipantRow) => {
                  const progress = item.progressPercent ?? 0;
                  const visual = getParticipantVisualState(item);
                  return (
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Progress
                        percent={progress}
                        size="small"
                        status={visual.key === "failed" ? "exception" : visual.key === "completed" ? "success" : visual.key === "running" ? "active" : "normal"}
                      />
                      <Typography.Text type="secondary">{progress}%</Typography.Text>
                    </Space>
                  );
                },
              },
            ]}
          />
        </Panel>
      </div>
      <Modal
        open={startModeModalOpen}
        title={t("mockRuns.startModeTitle")}
        footer={null}
        onCancel={() => setStartModeModalOpen(false)}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t("mockRuns.startModeDescription")}
          </Typography.Paragraph>
          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button onClick={() => setStartModeModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                try {
                  await controlMutation.mutateAsync({ action: "start", body: { mode: mockRunStartModeSchema.enum.restart } });
                  setStartModeModalOpen(false);
                } catch {
                  // handled by mutation
                }
              }}
            >
              {t("mockRuns.restartRun")}
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                try {
                  await controlMutation.mutateAsync({ action: "start", body: { mode: mockRunStartModeSchema.enum.continue } });
                  setStartModeModalOpen(false);
                } catch {
                  // handled by mutation
                }
              }}
            >
              {t("mockRuns.continueRun")}
            </Button>
          </Space>
        </Space>
      </Modal>
      <Modal
        open={appendModalOpen}
        title={t("mockRuns.appendParticipantsTitle")}
        onCancel={() => setAppendModalOpen(false)}
        onOk={handleAppendParticipants}
        okText={t("mockRuns.appendParticipants")}
        cancelText={t("common.cancel")}
        confirmLoading={appendMutation.isPending}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t("mockRuns.appendParticipantsDescription")}
          </Typography.Paragraph>
          <Form layout="vertical">
            <Form.Item label={t("mockRuns.additionalCount")} extra={t("mockRuns.additionalCountHint")}>
              <InputNumber
                min={1}
                max={1000}
                style={{ width: "100%" }}
                value={additionalCount}
                onChange={(value) => setAdditionalCount(value ?? 1)}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </>
  );
}
