import { EditOutlined, EyeInvisibleOutlined, EyeOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, List, Space, Steps, Tag, Timeline, Typography } from "antd";
import type { SurveyImportRecordEvent, SurveySchemaDto } from "@surveysim/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { SurveySchemaEditor } from "@/components/surveys/SurveySchemaEditor";
import { useI18n } from "@/i18n/I18nProvider";
import { surveyImportStore, type ProcessedRecord, type StreamStage } from "@/stores/survey-import.store";

const streamStepOrder: StreamStage[] = ["queued", "extracting", "validating", "repairing", "normalizing", "completed"];

function buildStepIndex(stage?: StreamStage) {
  if (!stage) return 0;
  if (stage === "interrupted") return streamStepOrder.length - 1;
  const index = streamStepOrder.indexOf(stage);
  return index < 0 ? 0 : index;
}

export function SurveyImportStreamPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const timelineBodyRef = useRef<HTMLDivElement | null>(null);
  const recordsBodyRef = useRef<HTMLDivElement | null>(null);

  const importText = surveyImportStore((state) => state.importText);
  const selectedLlmConfigId = surveyImportStore((state) => state.selectedLlmConfigId);
  const draft = surveyImportStore((state) => state.draft);
  const persistedDrawerOpen = surveyImportStore((state) => state.drawerOpen);
  const editingSurveyId = surveyImportStore((state) => state.editingSurveyId);
  const streamLogs = surveyImportStore((state) => state.streamLogs);
  const streamStage = surveyImportStore((state) => state.streamStage);
  const streamPreview = surveyImportStore((state) => state.streamPreview);
  const processedRecords = surveyImportStore((state) => state.processedRecords);
  const hasUnsavedDraft = surveyImportStore((state) => state.hasUnsavedDraft);
  const showRawJsonl = surveyImportStore((state) => state.showRawJsonl);
  const setDraft = surveyImportStore((state) => state.setDraft);
  const setDrawerOpenState = surveyImportStore((state) => state.setDrawerOpen);
  const setEditingSurveyId = surveyImportStore((state) => state.setEditingSurveyId);
  const setShowRawJsonl = surveyImportStore((state) => state.setShowRawJsonl);
  const setHasUnsavedDraft = surveyImportStore((state) => state.setHasUnsavedDraft);
  const handleStreamEvent = surveyImportStore((state) => state.handleStreamEvent);
  const resetDraft = surveyImportStore((state) => state.resetDraft);

  const latestLogs = useMemo(
    () =>
      streamLogs.slice(-10).map((item) => {
        if (item.text.startsWith("record:")) {
          const [, index, status, title] = item.text.split(":");
          return {
            ...item,
            text:
              status === "repaired"
                ? t("surveys.recordRepaired", { index, title })
                : status === "skipped"
                  ? t("surveys.recordSkipped", { index, title })
                  : t("surveys.recordValidated", { index, title }),
          };
        }

        if (item.text.startsWith("draft:")) {
          const [, count] = item.text.split(":");
          return {
            ...item,
            text: t("surveys.draftReady", { count }),
          };
        }

        return item;
      }),
    [streamLogs, t],
  );

  useEffect(() => {
    if (persistedDrawerOpen) {
      setDrawerOpen(true);
    }
  }, [persistedDrawerOpen]);

  useEffect(() => {
    const node = timelineBodyRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [latestLogs]);

  useEffect(() => {
    const node = recordsBodyRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [processedRecords]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: draft.schema.survey.title,
        description: draft.schema.survey.description,
        rawText: draft.rawText,
        schema: draft.schema,
      };
      return editingSurveyId ? apiClient.put(`/content-tasks/${editingSurveyId}`, payload) : apiClient.post("/content-tasks", payload);
    },
    onSuccess: () => {
      message.success(editingSurveyId ? t("surveys.updateSuccess") : t("surveys.saveSuccess"));
      setDrawerOpen(false);
      setDrawerOpenState(false);
      setHasUnsavedDraft(false);
      void queryClient.invalidateQueries({ queryKey: ["content-tasks"] });
      navigate("/content-tasks");
    },
    onError: (error: Error) => message.error(error.message),
  });

  const retryRecordMutation = useMutation({
    mutationFn: (record: ProcessedRecord) =>
      apiClient.post<SurveyImportRecordEvent>("/content-tasks/import/retry-record", {
        rawText: draft.rawText || importText,
        invalidLine: record.rawLine,
        errorMessage: record.message,
        llmConfigId: selectedLlmConfigId,
        index: record.index,
      }),
    onSuccess: (event) => {
      handleStreamEvent(event, { onDraftReady: () => setDrawerOpen(true) });
      message.success(t("surveys.retrySuccess"));
    },
    onError: (error: Error) => message.error(error.message),
  });

  return (
    <>
      <PageHeader
        title={t("surveys.streamPageTitle")}
        subtitle={t("surveys.streamPageSubtitle")}
        actions={
          <Space>
            <Button onClick={() => navigate("/content-tasks/import")}>{t("surveys.importRaw")}</Button>
            <Button onClick={() => navigate("/content-tasks")}>{t("common.back")}</Button>
          </Space>
        }
      />
      {streamLogs.length ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div className="metric-grid">
            <Panel style={{ padding: 16 }}>
              <div className="metric-label">{t("surveys.recordsProcessed")}</div>
              <div className="metric-value">{processedRecords.length}</div>
            </Panel>
            <Panel style={{ padding: 16 }}>
              <div className="metric-label">{t("surveys.recordsRepaired")}</div>
              <div className="metric-value">{processedRecords.filter((item) => item.status !== "validated").length}</div>
            </Panel>
            <Panel style={{ padding: 16 }}>
              <div className="metric-label">{t("surveys.currentStage")}</div>
              <div className="metric-value" style={{ fontSize: 22 }}>{streamStage ? t(`surveys.stage.${streamStage}`) : "-"}</div>
            </Panel>
          </div>

          <Panel>
            <Steps size="small" current={buildStepIndex(streamStage)} items={streamStepOrder.map((step) => ({ title: t(`surveys.stage.${step}`) }))} />
          </Panel>

          {processedRecords.length || (showRawJsonl && streamPreview) ? (
            <div className={showRawJsonl && streamPreview ? "workspace-grid" : "card-stack"} style={{ alignItems: "start" }}>
              <div className="rule-card survey-records-shell">
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  <Typography.Title level={5} style={{ margin: 0 }}>{t("surveys.recordListTitle")}</Typography.Title>
                  <Typography.Text type="secondary">{t("surveys.recordListHint")}</Typography.Text>
                  {processedRecords.length ? (
                    <div ref={recordsBodyRef} className="survey-records-body">
                      {processedRecords.map((record) => (
                        <div key={record.index} className="survey-record-item">
                          <Space wrap size={6} style={{ marginBottom: 6 }}>
                            <Tag color={record.status === "repaired" ? "gold" : record.status === "skipped" ? "red" : "green"}>
                              {record.status === "repaired" ? t("surveys.repaired") : record.status === "skipped" ? t("surveys.skipped") : t("surveys.validated")}
                            </Tag>
                            <Tag>{t("surveys.recordIndex", { index: record.index })}</Tag>
                            {record.recordType ? <Tag color="blue">{record.recordType}</Tag> : null}
                            {record.questionType ? <Tag>{t(`questionType.${record.questionType}`)}</Tag> : null}
                          </Space>
                          <Typography.Paragraph style={{ marginBottom: 4 }}>
                            <strong>{record.title || record.summary || t("surveys.recordUntitled")}</strong>
                          </Typography.Paragraph>
                          {record.summary ? <Typography.Text type="secondary">{record.summary}</Typography.Text> : null}
                          {record.message ? (
                            <div style={{ marginTop: 4 }}>
                              <Typography.Text type="secondary">{record.message}</Typography.Text>
                            </div>
                          ) : null}
                          <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: 0.8 }}>
                            {record.status === "repaired" && record.repairedLine ? record.repairedLine : record.rawLine}
                          </div>
                          {record.status === "skipped" ? (
                            <div style={{ marginTop: 8 }}>
                              <Button size="small" icon={<ReloadOutlined />} loading={retryRecordMutation.isPending} onClick={() => retryRecordMutation.mutate(record)}>
                                {t("surveys.retryRecord")}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty description={t("surveys.recordListEmpty")} />
                  )}
                </Space>
              </div>

              {showRawJsonl && streamPreview ? (
                <div className="rule-card survey-jsonl-shell">
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <Typography.Title level={5} style={{ margin: 0 }}>{t("surveys.jsonlPreview")}</Typography.Title>
                      <Button size="small" icon={showRawJsonl ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setShowRawJsonl((current) => !current)}>
                        {showRawJsonl ? t("surveys.hideRawJsonl") : t("surveys.showRawJsonl")}
                      </Button>
                    </Space>
                    <Typography.Text type="secondary">{t("surveys.jsonlPreviewHint")}</Typography.Text>
                    <div className="survey-jsonl-body">{streamPreview || t("surveys.recordListEmpty")}</div>
                  </Space>
                </div>
              ) : null}
            </div>
          ) : null}

          {streamPreview ? (
            <div className="survey-stream-toolbar">
              <Button size="small" icon={showRawJsonl ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setShowRawJsonl((current) => !current)}>
                {showRawJsonl ? t("surveys.hideRawJsonl") : t("surveys.showRawJsonl")}
              </Button>
              {!showRawJsonl ? <Typography.Text type="secondary">{t("surveys.rawJsonlHidden")}</Typography.Text> : null}
            </div>
          ) : null}

          <Panel>
            <div className="survey-stream-log-shell">
              <div className="survey-stream-log-fade survey-stream-log-fade--top" />
              <div className="survey-stream-log-fade survey-stream-log-fade--bottom" />
              <div ref={timelineBodyRef} className="survey-stream-log-body">
                <Timeline
                  items={latestLogs.map((item) => ({
                    color: item.color,
                    className: "survey-log-item",
                    children: (
                      <Space direction="vertical" size={2}>
                        {item.stage ? <Tag color="blue">{t(`surveys.stage.${item.stage}`)}</Tag> : null}
                        <Typography.Text>{item.text}</Typography.Text>
                      </Space>
                    ),
                  }))}
                />
              </div>
            </div>
          </Panel>
        </Space>
      ) : (
        <Panel>
          <Empty description={t("surveys.streamEmpty")} />
        </Panel>
      )}

      {hasUnsavedDraft ? (
        <Panel style={{ marginTop: 18 }}>
          <Space align="center" style={{ width: "100%", justifyContent: "space-between" }} wrap>
            <div>
              <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>{t("surveys.unsavedDraftTitle")}</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {t("surveys.unsavedDraftDescription", {
                  title: draft.schema.survey.title || t("surveys.untitledDraft"),
                  sections: draft.schema.sections.length,
                })}
              </Typography.Paragraph>
            </div>
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => setDrawerOpen(true)}>{t("surveys.reopenDraft")}</Button>
              <Button
                onClick={() => {
                  setHasUnsavedDraft(false);
                  setDrawerOpenState(false);
                  setEditingSurveyId(null);
                  resetDraft();
                }}
              >
                {t("surveys.dismissDraft")}
              </Button>
            </Space>
          </Space>
        </Panel>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerOpenState(false);
        }}
        width={980}
        title={editingSurveyId ? t("surveys.editSurvey") : t("surveys.reviewSurvey")}
        extra={
          <Space>
            <Button icon={<SaveOutlined />} type="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {t("surveys.saveSurvey")}
            </Button>
          </Space>
        }
      >
        {draft.extractionNotes.length ? (
          <Panel style={{ marginBottom: 16 }}>
            <Typography.Title level={5}>{t("surveys.extractionNotes")}</Typography.Title>
            <List
              dataSource={draft.extractionNotes}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text>{item}</Typography.Text>
                </List.Item>
              )}
            />
          </Panel>
        ) : null}
        <SurveySchemaEditor value={draft.schema} onChange={(schema: SurveySchemaDto) => setDraft((current) => ({ ...current, schema }))} />
      </Drawer>
    </>
  );
}
