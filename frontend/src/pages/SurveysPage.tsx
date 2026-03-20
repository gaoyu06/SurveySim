import { InboxOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, Form, Input, List, Select, Space, Steps, Tag, Timeline, Typography, Upload } from "antd";
import { useState } from "react";
import type { LlmProviderConfigDto, SurveyDraft, SurveyImportStreamEvent, SurveySchemaDto } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { SurveySchemaEditor } from "@/components/surveys/SurveySchemaEditor";

type SurveyRecord = {
  id: string;
  title: string;
  description?: string;
  rawText: string;
  schema: SurveySchemaDto;
  createdAt: string;
};

type StreamStage = "queued" | "extracting" | "repairing" | "normalizing" | "completed";

const streamStepOrder: StreamStage[] = ["queued", "extracting", "repairing", "normalizing", "completed"];

const emptyDraft: SurveyDraft = {
  rawText: "",
  schema: {
    survey: {
      title: "Untitled Survey",
      respondentInstructions: "",
      language: "auto",
    },
    sections: [
      {
        id: "section_root",
        title: "Section 1",
        displayOrder: 0,
        questions: [],
      },
    ],
  },
  extractionNotes: [],
};

function buildStreamPayload(rawText: string, llmConfigId?: string) {
  return JSON.stringify({
    rawText,
    llmConfigId,
  });
}

function buildStepIndex(stage?: StreamStage) {
  if (!stage) return 0;
  const index = streamStepOrder.indexOf(stage);
  return index < 0 ? 0 : index;
}

export function SurveysPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [importText, setImportText] = useState("");
  const [selectedLlmConfigId, setSelectedLlmConfigId] = useState<string | undefined>();
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);
  const [streamLogs, setStreamLogs] = useState<Array<{ key: string; stage?: StreamStage; text: string; color?: string }>>([]);
  const [streamStage, setStreamStage] = useState<StreamStage | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");

  const surveysQuery = useQuery({
    queryKey: ["surveys"],
    queryFn: () => apiClient.get<SurveyRecord[]>("/surveys"),
  });
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
      return editingSurveyId ? apiClient.put(`/surveys/${editingSurveyId}`, payload) : apiClient.post("/surveys", payload);
    },
    onSuccess: () => {
      message.success(editingSurveyId ? "Survey updated" : "Survey saved");
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const appendLog = (entry: { stage?: StreamStage; text: string; color?: string }) => {
    setStreamLogs((current) => [...current, { key: `${Date.now()}_${current.length}`, ...entry }]);
  };

  const handleStreamEvent = (event: SurveyImportStreamEvent) => {
    if (event.type === "status") {
      setStreamStage(event.stage);
      appendLog({ stage: event.stage, text: event.message, color: event.stage === "completed" ? "green" : "blue" });
      return;
    }

    if (event.type === "delta") {
      setStreamPreview((current) => `${current}${event.chunk}`.slice(-8000));
      return;
    }

    if (event.type === "draft") {
      setDraft(event.draft);
      setEditingSurveyId(null);
      setDrawerOpen(true);
      appendLog({ text: `Draft ready: ${event.draft.schema.sections.length} sections extracted`, color: "gold" });
      return;
    }

    appendLog({ text: event.message, color: "red" });
    throw new Error(event.message);
  };

  const startStreamImport = async (body: BodyInit) => {
    setIsStreaming(true);
    setStreamStage(undefined);
    setStreamLogs([]);
    setStreamPreview("");

    try {
      await apiClient.streamSurveyImport("/surveys/import/stream", body, handleStreamEvent);
      message.success("Extraction completed");
    } catch (error) {
      const resolved = error instanceof Error ? error.message : String(error);
      appendLog({ text: resolved, color: "red" });
      message.error(resolved);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Survey structuring workbench"
        subtitle="Paste messy questionnaires or upload text files, watch the extraction stream in real time, then edit the structured draft before saving."
      />
      <div className="workspace-grid">
        <Panel>
          <Typography.Title level={4}>Import raw questionnaire</Typography.Title>
          <Form layout="vertical">
            <Form.Item label="LLM config for extraction">
              <Select
                allowClear
                placeholder="Choose config"
                options={(llmConfigsQuery.data ?? []).map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                value={selectedLlmConfigId}
                onChange={(value) => setSelectedLlmConfigId(value)}
              />
            </Form.Item>
            <Form.Item label="Paste questionnaire text">
              <Input.TextArea
                rows={14}
                placeholder="Paste raw questionnaire text or upload a file below."
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
              />
            </Form.Item>
            <Form.Item label="Upload text file">
              <Upload.Dragger
                accept=".txt,.md,.csv,.json"
                showUploadList={false}
                beforeUpload={(file) => {
                  const formData = new FormData();
                  formData.append("file", file);
                  if (selectedLlmConfigId) {
                    formData.append("llmConfigId", selectedLlmConfigId);
                  }
                  void startStreamImport(formData);
                  return false;
                }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p>Drop txt / md / text-like files here</p>
              </Upload.Dragger>
            </Form.Item>
            <Space wrap>
              <Button
                type="primary"
                onClick={() => void startStreamImport(buildStreamPayload(importText, selectedLlmConfigId))}
                loading={isStreaming}
                disabled={!importText.trim()}
              >
                Extract structure
              </Button>
              {draft.extractionNotes.length ? <Tag color="gold">{`${draft.extractionNotes.length} extraction notes`}</Tag> : null}
            </Space>
          </Form>
        </Panel>

        <Panel>
          <Typography.Title level={4}>Extraction stream</Typography.Title>
          {streamLogs.length ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Steps
                size="small"
                current={buildStepIndex(streamStage)}
                items={streamStepOrder.map((step) => ({ title: step }))}
              />
              {streamPreview ? (
                <div className="rule-card" style={{ maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
                  {streamPreview}
                </div>
              ) : null}
              <Timeline
                items={streamLogs.map((item) => ({
                  color: item.color,
                  children: (
                    <Space direction="vertical" size={2}>
                      {item.stage ? <Tag color="blue">{item.stage}</Tag> : null}
                      <Typography.Text>{item.text}</Typography.Text>
                    </Space>
                  ),
                }))}
              />
            </Space>
          ) : (
            <Empty description="Start extraction to see live progress and normalization stages" />
          )}
        </Panel>
      </div>

      <Panel style={{ marginTop: 18 }}>
        <Typography.Title level={4}>Saved surveys</Typography.Title>
        <List
          locale={{ emptyText: <Empty description="No surveys yet" /> }}
          dataSource={surveysQuery.data ?? []}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  onClick={() => {
                    setEditingSurveyId(item.id);
                    setDraft({
                      rawText: item.rawText,
                      schema: item.schema,
                      extractionNotes: [],
                    });
                    setDrawerOpen(true);
                  }}
                >
                  Edit
                </Button>,
              ]}
            >
              <List.Item.Meta title={item.title} description={`${item.schema.sections.length} sections`} />
            </List.Item>
          )}
        />
      </Panel>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={980}
        title={editingSurveyId ? "Edit survey schema" : "Review structured survey"}
        extra={
          <Space>
            <Button icon={<SaveOutlined />} type="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              Save survey
            </Button>
          </Space>
        }
      >
        {draft.extractionNotes.length ? (
          <Panel style={{ marginBottom: 16 }}>
            <Typography.Title level={5}>Extraction notes</Typography.Title>
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
        <SurveySchemaEditor value={draft.schema} onChange={(schema) => setDraft((current) => ({ ...current, schema }))} />
      </Drawer>
    </>
  );
}
