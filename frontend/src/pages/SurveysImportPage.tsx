import { InboxOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Form, Input, Select, Space, Typography, Upload } from "antd";
import type { LlmProviderConfigDto } from "@surveysim/shared";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { FieldLabel, HelpCallout } from "@/components/Help";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { surveyImportStore } from "@/stores/survey-import.store";

function buildStreamPayload(rawText: string, llmConfigId?: string) {
  return JSON.stringify({
    rawText,
    llmConfigId,
  });
}

export function SurveysImportPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useI18n();
  const importText = surveyImportStore((state) => state.importText);
  const selectedLlmConfigId = surveyImportStore((state) => state.selectedLlmConfigId);
  const isStreaming = surveyImportStore((state) => state.isStreaming);
  const setImportText = surveyImportStore((state) => state.setImportText);
  const setSelectedLlmConfigId = surveyImportStore((state) => state.setSelectedLlmConfigId);
  const startStreamImport = surveyImportStore((state) => state.startStreamImport);

  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
  });

  const startImport = async (body: BodyInit) => {
    navigate("/content-tasks/import/stream");
    void startStreamImport(body).catch((error) => {
      message.error(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <>
      <PageHeader
        title={t("surveys.importPageTitle")}
        subtitle={t("surveys.importPageSubtitle")}
        actions={<Button onClick={() => navigate("/content-tasks")}>{t("common.back")}</Button>}
      />
      <HelpCallout
        title={t("surveys.importGuideTitle")}
        description={t("surveys.importGuideDescription")}
        items={[
          t("surveys.importGuideStep1"),
          t("surveys.importGuideStep2"),
          t("surveys.importGuideStep3"),
        ]}
      />
      <Panel>
        <Typography.Title level={4}>{t("surveys.importRaw")}</Typography.Title>
        <Form layout="vertical">
          <Form.Item label={<FieldLabel label={t("surveys.extractionConfig")} hint={t("surveys.extractionConfigHint")} />}>
            <Select
              allowClear
              placeholder={t("surveys.chooseConfig")}
              options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.isOwnedByCurrentUser ? item.name : `${item.name} · ${item.ownerEmail}`, value: item.id }))}
              value={selectedLlmConfigId}
              onChange={(value) => setSelectedLlmConfigId(value)}
            />
          </Form.Item>
          <Form.Item label={<FieldLabel label={t("surveys.pasteText")} hint={t("surveys.pasteTextHint")} />}>
            <Input.TextArea
              rows={18}
              placeholder={t("surveys.pastePlaceholder")}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          </Form.Item>
          <Form.Item label={<FieldLabel label={t("surveys.uploadFile")} hint={t("surveys.uploadFileHint")} />}>
            <Upload.Dragger
              accept=".txt,.md,.csv,.json,.doc,.docx"
              showUploadList={false}
              beforeUpload={(file) => {
                const formData = new FormData();
                formData.append("file", file);
                if (selectedLlmConfigId) {
                  formData.append("llmConfigId", selectedLlmConfigId);
                }
                void startImport(formData);
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
              onClick={() => void startImport(buildStreamPayload(importText, selectedLlmConfigId))}
              loading={isStreaming}
              disabled={!importText.trim()}
            >
              {t("surveys.extract")}
            </Button>
            <Button onClick={() => navigate("/content-tasks/import/stream")}>{t("surveys.extractionStream")}</Button>
          </Space>
        </Form>
      </Panel>
    </>
  );
}
