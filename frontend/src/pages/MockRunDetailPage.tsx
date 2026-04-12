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
import { App, Button, Collapse, Form, Grid, InputNumber, List, Modal, Progress, Space, Table, Tag, Tooltip, Typography } from "antd";
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

function summarizeText(text: string | undefined, maxLength = 180) {
  if (!text?.trim()) {
    return "";
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

export function MockRunDetailPage() {
  const { id = "" } = useParams();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
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

  const getIdentityItems = (identity: ParticipantIdentity) => {
    const identityRecord = identity as Record<string, unknown>;
    const fallbackOrder = ["country", "region", "continent", "gender", "ageRange", "occupation", "educationLevel", "incomeRange", "maritalStatus", "interests", "customTags"];
    const orderedDimensions = Array.from(
      new Set(
        [...templateAttributes.map((attribute) => attribute.key), ...fallbackOrder, ...Object.keys(identityRecord)].filter((item) => item && item !== "noise" && item !== "extra"),
      ),
    );

    return orderedDimensions
      .map((attribute) => {
        const values = toDisplayValues(attribute, identityRecord[attribute]);
        if (!values.length) return null;
        return {
          attribute,
          label: formatAttributeLabel(attribute),
          text: `${formatAttributeLabel(attribute)}: ${values.join(", ")}`,
        };
      })
      .filter(Boolean) as Array<{ attribute: string; label: string; text: string }>;
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

    if (participant.status === "running" || participant.personaStatus === "running" || participant.responseStatus === "running") {
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

  const renderStatusTag = (label: string, status: string | undefined) => {
    const normalized = status ?? "pending";
    const color =
      normalized === "completed"
        ? "success"
        : normalized === "running"
          ? "processing"
          : normalized === "failed"
            ? "error"
            : normalized === "canceled"
              ? "default"
              : "default";

    return (
      <Tag color={color} className="participant-stage-tag">
        {label}: {t(`status.${normalized}`)}
      </Tag>
    );
  };

  const summaryMetrics = [
    [t("mockRunDetail.identityCompleted"), runQuery.data?.progress?.identityCompleted ?? 0],
    [t("mockRunDetail.personaCompleted"), runQuery.data?.progress?.personaCompleted ?? 0],
    [t("mockRunDetail.responsesCompleted"), runQuery.data?.progress?.responseCompleted ?? 0],
    [t("mockRunDetail.failures"), runQuery.data?.progress?.failed ?? 0],
    [t("mockRunDetail.canceled"), runQuery.data?.progress?.canceled ?? 0],
  ];

  const overviewCards = [
    [t("mockRunDetail.currentStatus"), runQuery.data ? t(`status.${runQuery.data.status}`) : "--"],
    [t("mockRuns.participantCount"), String(runQuery.data?.participantCount ?? 0)],
    [t("mockRunDetail.requestedConcurrency"), String(runQuery.data?.concurrency ?? 0)],
    [t("common.owner"), runQuery.data?.ownerEmail ?? "--"],
  ];

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
          <Space wrap className="page-header-actions">
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
            <Button icon={<PlusOutlined />} disabled={isActive || isReadonlyRun} onClick={() => setAppendModalOpen(true)}>
              {t("mockRuns.appendParticipants")}
            </Button>
            <Button icon={<ReloadOutlined />} loading={retryMutation.isPending} disabled={selectedParticipantIds.length === 0 || isReadonlyRun} onClick={() => retryMutation.mutate()}>
              {t("mockRunDetail.retrySelected")}
            </Button>
            <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} disabled={isReadonlyRun} onClick={confirmDelete}>
              {t("mockRuns.delete")}
            </Button>
          </Space>
        }
      />

      <div className="run-detail-shell">
        <Panel style={{ padding: screens.md ? 24 : 18 }}>
          <div className="run-summary-hero">
            <div className="run-summary-copy">
              <Typography.Text className="topbar-label">{t("mockRunDetail.runMeta")}</Typography.Text>
              <Typography.Title level={screens.md ? 2 : 3} style={{ marginTop: 8, marginBottom: 8 }}>
                {percent}% · {runQuery.data ? t(`status.${runQuery.data.status}`) : "--"}
              </Typography.Title>
            </div>
            <div className="run-summary-grid">
              {overviewCards.map(([label, value]) => (
                <div key={String(label)} className="run-summary-card">
                  <Typography.Text className="metric-label">{String(label)}</Typography.Text>
                  <Typography.Text className="run-summary-card__value">{String(value)}</Typography.Text>
                </div>
              ))}
            </div>
          </div>

          <Progress percent={percent} status={runQuery.data?.status === "failed" ? "exception" : "active"} />

          <div className="run-stage-grid">
            {summaryMetrics.map(([label, value]) => (
              <div key={String(label)} className="run-stage-card">
                <Typography.Text className="metric-label">{String(label)}</Typography.Text>
                <Typography.Text className="run-stage-card__value">{String(value)}</Typography.Text>
              </div>
            ))}
          </div>
        </Panel>

        <div className="run-detail-main">
          <Collapse
            ghost
            items={[{
              key: "execution-log",
              label: <Typography.Title level={4} style={{ margin: 0 }}>{t("mockRunDetail.executionLog")}</Typography.Title>,
              children: (
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
              ),
            }]}
          />

          <Panel style={{ minHeight: 0 }}>
            <div className="participant-table-head">
              <div>
                <Typography.Title level={4} style={{ marginBottom: 4 }}>
                  {t("mockRunDetail.participants")}
                </Typography.Title>
              </div>
              <Tag color="blue">{`${selectedParticipantIds.length}/${participants.length}`}</Tag>
            </div>

            <Table
              size="small"
              rowKey="id"
              rowSelection={{
                selectedRowKeys: selectedParticipantIds,
                onChange: setSelectedParticipantIds,
              }}
              dataSource={participants}
              pagination={{ pageSize: screens.xxl ? 14 : screens.lg ? 10 : 6 }}
              scroll={{ x: 1180 }}
              columns={[
                { title: "#", dataIndex: "ordinal", width: 64, fixed: "left" },
                {
                  title: t("mockRunDetail.stageStatus"),
                  width: 230,
                  render: (_: unknown, item: ParticipantRow) => {
                    const visual = getParticipantVisualState(item);
                    return (
                      <div className="participant-stage-cell">
                        <Space size={8}>
                          {visual.icon}
                          <Typography.Text strong>{visual.label}</Typography.Text>
                        </Space>
                        <div className="participant-stage-tags">
                          {renderStatusTag(t("common.status"), item.status)}
                          {renderStatusTag(t("mockRunDetail.persona"), item.personaStatus)}
                          {renderStatusTag(t("mockRunDetail.response"), item.responseStatus)}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  title: t("mockRunDetail.identitySummary"),
                  width: 320,
                  render: (_: unknown, item: ParticipantRow) => {
                    const identityItems = getIdentityItems(item.identity);
                    const previewItems = identityItems.slice(0, 4);
                    return (
                      <Tooltip
                        placement="topLeft"
                        title={
                          identityItems.length ? (
                            <div className="participant-tooltip-list">
                              {identityItems.slice(0, 8).map((entry) => (
                                <div key={entry.text}>{entry.text}</div>
                              ))}
                            </div>
                          ) : (
                            t("mockRunDetail.identityEmpty")
                          )
                        }
                      >
                        <div className="participant-identity-cell">
                          {previewItems.length ? (
                            previewItems.map((entry) => (
                              <Tag key={entry.text} className="participant-identity-tag">
                                {entry.text}
                              </Tag>
                            ))
                          ) : (
                            <Typography.Text type="secondary">{t("mockRunDetail.identityEmpty")}</Typography.Text>
                          )}
                          {identityItems.length > previewItems.length ? (
                            <Typography.Text type="secondary" className="participant-identity-more">
                              {t("mockRunDetail.identityMore", { count: identityItems.length - previewItems.length })}
                            </Typography.Text>
                          ) : null}
                        </div>
                      </Tooltip>
                    );
                  },
                },
                {
                  title: (
                    <Tooltip title={t("mockRunDetail.personaPreviewHint")}>
                      <span>{t("mockRunDetail.personaPreview")}</span>
                    </Tooltip>
                  ),
                  width: 280,
                  render: (_: unknown, item: ParticipantRow) => {
                    const preview = summarizeText(item.personaPrompt, 160);
                    const tooltipPreview = summarizeText(item.personaPrompt, 320);
                    return (
                      <Tooltip
                        placement="topLeft"
                        title={
                          preview ? (
                            <div className="persona-preview-tooltip">
                              <div>{tooltipPreview}</div>
                              <Typography.Text type="secondary">{t("mockRunDetail.personaHidden")}</Typography.Text>
                            </div>
                          ) : (
                            t("mockRunDetail.personaUnavailable")
                          )
                        }
                      >
                        <div className="persona-preview-cell">
                          <Typography.Paragraph className="persona-preview-text">
                            {preview || t("mockRunDetail.personaUnavailable")}
                          </Typography.Paragraph>
                        </div>
                      </Tooltip>
                    );
                  },
                },
                {
                  title: t("mockRunDetail.responseProgress"),
                  width: 180,
                  render: (_: unknown, item: ParticipantRow) => {
                    const progress = item.progressPercent ?? 0;
                    const visual = getParticipantVisualState(item);
                    return (
                      <div className="participant-progress-cell">
                        <Progress
                          percent={progress}
                          size="small"
                          status={visual.key === "failed" ? "exception" : visual.key === "completed" ? "success" : visual.key === "running" ? "active" : "normal"}
                        />
                        <Typography.Text type="secondary">{progress}%</Typography.Text>
                      </div>
                    );
                  },
                },
                {
                  title: t("mockRunDetail.error"),
                  width: 220,
                  responsive: ["xl"],
                  render: (_: unknown, item: ParticipantRow) =>
                    item.errorMessage ? (
                      <Tooltip title={item.errorMessage}>
                        <Typography.Text type="danger" ellipsis>
                          {item.errorMessage}
                        </Typography.Text>
                      </Tooltip>
                    ) : (
                      <Typography.Text type="secondary">—</Typography.Text>
                    ),
                },
              ]}
            />
          </Panel>
        </div>
      </div>

      <Modal open={startModeModalOpen} title={t("mockRuns.startModeTitle")} footer={null} onCancel={() => setStartModeModalOpen(false)}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space style={{ width: "100%", justifyContent: "flex-end" }} wrap>
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
          <Form layout="vertical">
            <Form.Item label={t("mockRuns.additionalCount")}>
              <InputNumber min={1} max={1000} style={{ width: "100%" }} value={additionalCount} onChange={(value) => setAdditionalCount(value ?? 1)} />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </>
  );
}
