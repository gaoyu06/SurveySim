import { InboxOutlined, RocketOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Collapse, Form, Input, Select, Space, Typography, Upload } from "antd";
import type { LlmProviderConfigDto, SurveyDraft } from "@surveysim/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { FieldLabel } from "@/components/Help";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { surveyImportStore } from "@/stores/survey-import.store";

function buildStreamPayload(rawText: string, llmConfigId?: string) {
  return JSON.stringify({
    rawText,
    llmConfigId,
  });
}

function getCopy(locale: string) {
  const zh = locale === "zh-CN";
  return {
    quickTitle: zh ? "先用几句话直接生成问卷" : "Start with a few sentences",
    quickDesc: zh ? "如果你手上还没有整理好的问卷原文，直接描述研究主题、目标人群和关注点，就能先生成一版可编辑草稿。" : "If you do not have a finished questionnaire yet, describe the research topic, target audience, and focus areas to generate an editable draft first.",
    quickPlaceholder: zh ? "例如：做一个关于短视频会员体验的问卷，面向 18-30 岁重度用户，重点了解使用频率、付费意愿、最常见不满与功能期待。" : "Example: Create a survey about short-video membership experience for heavy users aged 18-30, focused on usage frequency, willingness to pay, pain points, and desired features.",
    quickAction: zh ? "直接生成问卷草稿" : "Generate draft now",
    quickExamples: zh ? ["校园咖啡消费习惯", "企业服务满意度", "内容阅读反馈"] : ["Campus coffee habits", "Enterprise service satisfaction", "Content reading feedback"],
    importTitle: zh ? "已有问卷原文？再展开导入" : "Already have source text? Expand to import",
    importDesc: zh ? "导入原文、上传文件、指定模型这些都保留，但默认收起，避免第一次使用时被复杂选项打断。" : "Source import, file upload, and model selection are still available, but collapsed by default so the first experience stays simple.",
    advanced: zh ? "展开高级选项" : "Show advanced options",
    importAdvanced: zh ? "展开原文导入" : "Open source import",
    readyMessage: zh ? "AI 已生成问卷草稿，正在为你打开编辑页。" : "The AI draft is ready and the editor is opening now.",
    quickModel: zh ? "生成使用的模型配置（可选）" : "Model config for generation (optional)",
  };
}

export function SurveysImportPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t, locale } = useI18n();
  const copy = useMemo(() => getCopy(locale), [locale]);
  const [quickPrompt, setQuickPrompt] = useState("");
  const importText = surveyImportStore((state) => state.importText);
  const selectedLlmConfigId = surveyImportStore((state) => state.selectedLlmConfigId);
  const isStreaming = surveyImportStore((state) => state.isStreaming);
  const setImportText = surveyImportStore((state) => state.setImportText);
  const setSelectedLlmConfigId = surveyImportStore((state) => state.setSelectedLlmConfigId);
  const startStreamImport = surveyImportStore((state) => state.startStreamImport);
  const resetStream = surveyImportStore((state) => state.resetStream);
  const handleStreamEvent = surveyImportStore((state) => state.handleStreamEvent);

  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiClient.post<SurveyDraft>("/content-tasks/generate-with-ai", {
      prompt: quickPrompt,
      title: quickPrompt.split(/[。！？.!?\n]/)[0]?.slice(0, 60),
      llmConfigId: selectedLlmConfigId,
    }),
    onSuccess: (draft) => {
      resetStream();
      handleStreamEvent({ type: "status", stage: "completed", message: copy.readyMessage });
      handleStreamEvent({ type: "draft", draft });
      message.success(copy.readyMessage);
      navigate("/content-tasks/import/stream");
    },
    onError: (error: Error) => message.error(error.message),
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

      <div className="workspace-grid quick-import-grid">
        <Panel>
          <Typography.Title level={4}>{copy.quickTitle}</Typography.Title>
          <Typography.Paragraph type="secondary">{copy.quickDesc}</Typography.Paragraph>
          <Form layout="vertical">
            <Form.Item label={<FieldLabel label={copy.quickTitle} hint={copy.quickDesc} />}>
              <Input.TextArea rows={10} value={quickPrompt} placeholder={copy.quickPlaceholder} onChange={(event) => setQuickPrompt(event.target.value)} />
            </Form.Item>
            <Space wrap size={[8, 8]} style={{ marginBottom: 14 }}>
              {copy.quickExamples.map((item) => (
                <Button key={item} onClick={() => setQuickPrompt(item)}>{item}</Button>
              ))}
            </Space>
            <Collapse
              ghost
              items={[
                {
                  key: "quick-model",
                  label: copy.advanced,
                  children: (
                    <Form.Item label={copy.quickModel} style={{ marginBottom: 0 }}>
                      <Select
                        allowClear
                        placeholder={t("surveys.chooseConfig")}
                        options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.isOwnedByCurrentUser ? item.name : `${item.name} · ${item.ownerEmail}`, value: item.id }))}
                        value={selectedLlmConfigId}
                        onChange={(value) => setSelectedLlmConfigId(value)}
                      />
                    </Form.Item>
                  ),
                },
              ]}
            />
            <Space wrap style={{ marginTop: 18 }}>
              <Button type="primary" icon={<RocketOutlined />} loading={generateMutation.isPending} disabled={!quickPrompt.trim()} onClick={() => generateMutation.mutate()}>
                {copy.quickAction}
              </Button>
              <Button onClick={() => navigate("/content-tasks/import/stream")}>{t("surveys.extractionStream")}</Button>
            </Space>
          </Form>
        </Panel>

        <Panel>
          <Typography.Title level={4}>{copy.importTitle}</Typography.Title>
          <Typography.Paragraph type="secondary">{copy.importDesc}</Typography.Paragraph>
          <Collapse
            defaultActiveKey={[]}
            items={[
              {
                key: "source-import",
                label: copy.importAdvanced,
                children: (
                  <Form layout="vertical">
                    <Form.Item label={<FieldLabel label={t("surveys.pasteText")} hint={t("surveys.pasteTextHint")} />}>
                      <Input.TextArea
                        rows={12}
                        placeholder={t("surveys.pastePlaceholder")}
                        value={importText}
                        onChange={(event) => setImportText(event.target.value)}
                      />
                    </Form.Item>
                    <Collapse
                      ghost
                      items={[
                        {
                          key: "source-model",
                          label: copy.advanced,
                          children: (
                            <Form.Item label={<FieldLabel label={t("surveys.extractionConfig")} hint={t("surveys.extractionConfigHint")} />}>
                              <Select
                                allowClear
                                placeholder={t("surveys.chooseConfig")}
                                options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.isOwnedByCurrentUser ? item.name : `${item.name} · ${item.ownerEmail}`, value: item.id }))}
                                value={selectedLlmConfigId}
                                onChange={(value) => setSelectedLlmConfigId(value)}
                              />
                            </Form.Item>
                          ),
                        },
                      ]}
                    />
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
                    <Button
                      type="primary"
                      onClick={() => void startImport(buildStreamPayload(importText, selectedLlmConfigId))}
                      loading={isStreaming}
                      disabled={!importText.trim()}
                    >
                      {t("surveys.extract")}
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
