// @ts-nocheck
import { EditOutlined, EyeInvisibleOutlined, EyeOutlined, InboxOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, Form, Input, List, Select, Space, Steps, Tag, Timeline, Typography, Upload } from "antd";
import { useEffect, useMemo, useRef } from "react";
import type { LlmProviderConfigDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { SurveySchemaEditor } from "@/components/surveys/SurveySchemaEditor";
import { useI18n } from "@/i18n/I18nProvider";
import { surveyImportStore, type ProcessedRecord, type StreamStage } from "@/stores/survey-import.store";

const streamStepOrder: StreamStage[] = ["queued", "extracting", "validating", "repairing", "normalizing", "completed"];

function buildStreamPayload(rawText: string, llmConfigId?: string) {
  return JSON.stringify({
    rawText,
    llmConfigId,
  });
}

function buildStepIndex(stage?: StreamStage) {
  if (!stage) return 0;
  if (stage === "interrupted") {
    return streamStepOrder.length - 1;
  }
  const index = streamStepOrder.indexOf(stage);
  return index < 0 ? 0 : index;
}

type SurveyRecord = {
  id: string;
  title: string;
  description?: string;
  rawText: string;
  schema: import("@surveysim/shared").SurveySchemaDto;
  createdAt: string;
};

export function SurveyImportPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useI18n();
  const importText = surveyImportStore((state) => state.importText);
  const selectedLlmConfigId = surveyImportStore((state) => state.selectedLlmConfigId);
  const draft = surveyImportStore((state) => state.draft);
  const drawerOpen = surveyImportStore((state) => state.drawerOpen);
  const editingSurveyId = surveyImportStore((state) => state.editingSurveyId);
  const streamLogs = surveyImportStore((state) => state.streamLogs);
  const streamStage = surveyImportStore((state) => state.streamStage);
  const isStreaming = surveyImportStore((state) => state.isStreaming);
  const streamPreview = surveyImportStore((state) => state.streamPreview);
  const processedRecords = surveyImportStore((state) => state.processedRecords);
  const hasUnsavedDraft = surveyImportStore((state) => state.hasUnsavedDraft);
  const showRawJsonl = surveyImportStore((state) => state.showRawJsonl);
  const setImportText = surveyImportStore((state) => state.setImportText);
  const setSelectedLlmConfigId = surveyImportStore((state) => state.setSelectedLlmConfigId);
  const setDrawerOpen = surveyImportStore((state) => state.setDrawerOpen);
  const setShowRawJsonl = surveyImportStore((state) => state.setShowRawJsonl);
  const setDraftSchema = surveyImportStore((state) => state.setDraftSchema);
  const markDraftSaved = surveyImportStore((state) => state.markDraftSaved);
  const dismissDraft = surveyImportStore((state) => state.dismissDraft);
  const startStreamImport = surveyImportStore((state) => state.startStreamImport);
  const retryRecord = surveyImportStore((state) => state.retryRecord);
  const appendLog = surveyImportStore((state) => state.appendLog);
  const timelineBodyRef = useRef<HTMLDivElement | null>(null);
  const recordsBodyRef = useRef<HTMLDivElement | null>(null);

  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: draft.schema.survey.title,
        description: draft.schema.survey.description,
        rawText: draft.rawText,
        schema: draft.schema,
      };
      return editingSurveyId ? apiClient.put<SurveyRecord>(`/surveys/${editingSurveyId}`, payload) : apiClient.post<SurveyRecord>("/surveys", payload);
    },
    onSuccess: (result) => {
      message.success(editingSurveyId ? t("surveys.updateSuccess") : t("surveys.saveSuccess"));
      markDraftSaved(editingSurveyId ?? result?.id ?? null);
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const retryRecordMutation = useMutation({
    mutationFn: (record: ProcessedRecord) => retryRecord(record),
    onSuccess: () => {
      appendLog({ text: t("surveys.retrySuccess"), color: "green" });
      message.success(t("surveys.retrySuccess"));
    },
    onError: (error: Error) => message.error(error.message),
  });

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
    const node = timelineBodyRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth",
    });
  }, [streamLogs]);

  useEffect(() => {
    const node = recordsBodyRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth",
    });
  }, [processedRecords]);

  const handleStartImport = async (body: BodyInit) => {
    try {
      await startStreamImport(body);
      message.success(t("surveys.extractSuccess"));
    } catch (error) {
      const resolved = error instanceof Error ? error.message : String(error);
      message.error(resolved);
    }
  };

  return (
    <>
      <PageHeader
        title={t("surveys.importRaw")}
        subtitle={t("surveys.subtitle")}
      />
      <div className="workspace-grid">
        <Panel>
          <Typography.Title level={4}>{t("surveys.importRaw")}</Typography.Title>
          <Form layout="vertical">
            <Form.Item label={t("surveys.extractionConfig")}>
              <Select
                allowClear
                placeholder={t("surveys.chooseConfig")}
                options={(llmConfigsQuery.data ?? []).map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                value={selectedLlmConfigId}
                onChange={(value) => setSelectedLlmConfigId(value)}
              />
            </Form.Item>
            <Form.Item label={t("surveys.pasteText")}>
              <Input.TextArea
                rows={14}
                placeholder={t("surveys.pastePlaceholder")}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
              />
            </Form.Item>
            <Form.Item label={t("surveys.uploadFile")}>
              <Upload.Dragger
                accept=".txt,.md,.csv,.json"
                showUploadList={false}
                beforeUpload={(file) => {
                  const formData = new FormData();
                  formData.append("file", file);
                  if (selectedLlmConfigId) {
                    formData.append("llmConfigId", selectedLlmConfigId);
                  }
                  void handleStartImport(formData);
                  return false;
                }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p>{t("surveys.uploadHint")}</p>
              </Upload.Dragger>
            </Form.Item>
            <Space wrap>
              <Button
                type="primary"
                onClick={() => void handleStartImport(buildStreamPayload(importText, selectedLlmConfigId))}
                loading={isStreaming}
                disabled={!importText.trim()}
              >
                {t("surveys.extract")}
              </Button>
              {draft.extractionNotes.length ? <Tag color="gold">{t("surveys.notesCount", { count: draft.extractionNotes.length })}</Tag> : null}
            </Space>
          </Form>
        </Panel>

        <Panel>
          <Typography.Title level={4}>{t("surveys.extractionStream")}</Typography.Title>
          {streamLogs.length ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div className="metric-grid">
                <Panel style={{ padding: 16 }}>
                  <div className="metric-label">{t("surveys.recordsProcessed")}</div>
                  <div className="metric-value">{processedRecords.length}</div>
                </Panel>
                <Panel style={{ padding: 16 }}>
                  <div className="metric-label">{t("surveys.recordsRepaired")}</div>
                  <div className="metric-value">{processedRecords.filter((item) => item.status === "repaired" || item.status === "skipped").length}</div>
                </Panel>
                <Panel style={{ padding: 16 }}>
                  <div className="metric-label">{t("surveys.currentStage")}</div>
                  <div className="metric-value" style={{ fontSize: 22 }}>{streamStage ? t(`surveys.stage.${streamStage}`) : "-"}</div>
                </Panel>
              </div>
              <Steps
                size="small"
                current={buildStepIndex(streamStage)}
                items={streamStepOrder.map((step) => ({ title: t(`surveys.stage.${step}`) }))}
              />
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
                                  <Button
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    loading={retryRecordMutation.isPending}
                                    onClick={() => retryRecordMutation.mutate(record)}
                                  >
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
                          <Button
                            size="small"
                            icon={showRawJsonl ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                            onClick={() => setShowRawJsonl(!showRawJsonl)}
                          >
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
                  <Button
                    size="small"
                    icon={showRawJsonl ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    onClick={() => setShowRawJsonl(!showRawJsonl)}
                  >
                    {showRawJsonl ? t("surveys.hideRawJsonl") : t("surveys.showRawJsonl")}
                  </Button>
                  {!showRawJsonl ? <Typography.Text type="secondary">{t("surveys.rawJsonlHidden")}</Typography.Text> : null}
                </div>
              ) : null}
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
            </Space>
          ) : (
            <Empty description={t("surveys.streamEmpty")} />
          )}
        </Panel>
      </div>

      {hasUnsavedDraft ? (
        <Panel style={{ marginTop: 18 }}>
          <Space align="center" style={{ width: "100%", justifyContent: "space-between" }} wrap>
            <div>
              <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
                {t("surveys.unsavedDraftTitle")}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {t("surveys.unsavedDraftDescription", {
                  title: draft.schema.survey.title || t("surveys.untitledDraft"),
                  sections: draft.schema.sections.length,
                })}
              </Typography.Paragraph>
            </div>
            <Space wrap>
              <Button icon={<EditOutlined />} onClick={() => setDrawerOpen(true)}>
                {t("surveys.reopenDraft")}
              </Button>
              <Button onClick={dismissDraft}>
                {t("surveys.dismissDraft")}
              </Button>
            </Space>
          </Space>
        </Panel>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
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
        <SurveySchemaEditor value={draft.schema} onChange={setDraftSchema} />
      </Drawer>
    </>
  );
}
