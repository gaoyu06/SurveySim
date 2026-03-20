import { InboxOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, Form, Input, List, Select, Space, Typography, Upload } from "antd";
import { useState } from "react";
import type { LlmProviderConfigDto, SurveyDraft, SurveySchemaDto } from "@formagents/shared";
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

export function SurveysPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [importText, setImportText] = useState("");
  const [selectedLlmConfigId, setSelectedLlmConfigId] = useState<string | undefined>();
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);

  const surveysQuery = useQuery({
    queryKey: ["surveys"],
    queryFn: () => apiClient.get<SurveyRecord[]>("/surveys"),
  });
  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
  });

  const importMutation = useMutation({
    mutationFn: () =>
      apiClient.post<SurveyDraft>("/surveys/import", {
        rawText: importText,
        llmConfigId: selectedLlmConfigId,
      }),
    onSuccess: (result) => {
      setDraft(result);
      setEditingSurveyId(null);
      setDrawerOpen(true);
      message.success("Survey structured successfully");
    },
    onError: (error: Error) => message.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: draft.schema.survey.title,
        description: draft.schema.survey.description,
        rawText: draft.rawText,
        schema: draft.schema,
      };
      return editingSurveyId
        ? apiClient.put(`/surveys/${editingSurveyId}`, payload)
        : apiClient.post("/surveys", payload);
    },
    onSuccess: () => {
      message.success(editingSurveyId ? "Survey updated" : "Survey saved");
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Survey structuring workbench"
        subtitle="Paste messy questionnaires or upload text files, then manually correct the extracted schema before it becomes a real survey."
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
                beforeUpload={(file) => {
                  const formData = new FormData();
                  formData.append("file", file);
                  if (selectedLlmConfigId) {
                    formData.append("llmConfigId", selectedLlmConfigId);
                  }
                  apiClient
                    .upload<SurveyDraft>("/surveys/import", formData)
                    .then((result) => {
                      setDraft(result);
                      setEditingSurveyId(null);
                      setDrawerOpen(true);
                      message.success("Survey file imported successfully");
                    })
                    .catch((error) => message.error(error.message));
                  return false;
                }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p>Drop txt / md / text-like files here</p>
              </Upload.Dragger>
            </Form.Item>
            <Button
              type="primary"
              onClick={() => importMutation.mutate()}
              loading={importMutation.isPending}
              disabled={!importText.trim()}
            >
              Extract structure
            </Button>
          </Form>
        </Panel>

        <Panel>
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
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={920}
        title={editingSurveyId ? "Edit survey schema" : "Review structured survey"}
        extra={
          <Space>
            <Button icon={<SaveOutlined />} type="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              Save survey
            </Button>
          </Space>
        }
      >
        <SurveySchemaEditor value={draft.schema} onChange={(schema) => setDraft((current) => ({ ...current, schema }))} />
      </Drawer>
    </>
  );
}
