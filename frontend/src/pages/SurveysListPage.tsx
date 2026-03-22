import { DeleteOutlined, ExclamationCircleOutlined, EyeOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, List, Space, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SurveySchemaDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { SurveySchemaEditor } from "@/components/surveys/SurveySchemaEditor";
import { useI18n } from "@/i18n/I18nProvider";
import { surveyImportStore } from "@/stores/survey-import.store";

type SurveyRecord = {
  id: string;
  title: string;
  description?: string;
  rawText: string;
  schema: SurveySchemaDto;
  createdAt: string;
};

export function SurveysListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const draft = surveyImportStore((state) => state.draft);
  const editingSurveyId = surveyImportStore((state) => state.editingSurveyId);
  const hasUnsavedDraft = surveyImportStore((state) => state.hasUnsavedDraft);
  const setDraft = surveyImportStore((state) => state.setDraft);
  const setEditingSurveyId = surveyImportStore((state) => state.setEditingSurveyId);
  const setHasUnsavedDraft = surveyImportStore((state) => state.setHasUnsavedDraft);
  const resetDraft = surveyImportStore((state) => state.resetDraft);

  const surveysQuery = useQuery({
    queryKey: ["surveys"],
    queryFn: () => apiClient.get<SurveyRecord[]>("/surveys"),
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
      message.success(editingSurveyId ? t("surveys.updateSuccess") : t("surveys.saveSuccess"));
      setDrawerOpen(false);
      setHasUnsavedDraft(false);
      void queryClient.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/surveys/${id}`),
    onSuccess: async (_, id) => {
      message.success(t("surveys.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["surveys"] });
      queryClient.removeQueries({ queryKey: ["survey", id] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const confirmDelete = (item: SurveyRecord) => {
    modal.confirm({
      title: t("surveys.deleteConfirmTitle"),
      content: t("surveys.deleteConfirmDescription", { name: item.title }),
      okText: t("common.delete"),
      cancelText: t("common.cancel"),
      okButtonProps: { danger: true },
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        await deleteMutation.mutateAsync(item.id);
      },
    });
  };

  return (
    <>
      <PageHeader
        title={t("surveys.title")}
        subtitle={t("surveys.listSubtitle")}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/surveys/import")}>
            {t("surveys.importAction")}
          </Button>
        }
      />

      {hasUnsavedDraft ? (
        <Panel style={{ marginBottom: 18 }}>
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
              <Button onClick={() => navigate("/surveys/import/stream")}>{t("surveys.reopenDraft")}</Button>
              <Button
                onClick={() => {
                  resetDraft();
                  setDrawerOpen(false);
                }}
              >
                {t("surveys.dismissDraft")}
              </Button>
            </Space>
          </Space>
        </Panel>
      ) : null}

      <Panel>
        <Typography.Title level={4}>{t("surveys.savedSurveys")}</Typography.Title>
        <List
          locale={{ emptyText: <Empty description={t("surveys.noSurveys")} /> }}
          dataSource={surveysQuery.data ?? []}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="preview" icon={<EyeOutlined />} onClick={() => navigate(`/surveys/${item.id}/preview`)}>
                  {t("common.preview")}
                </Button>,
                <Button
                  key="edit"
                  onClick={() => {
                    setEditingSurveyId(item.id);
                    setHasUnsavedDraft(false);
                    setDraft({
                      rawText: item.rawText,
                      schema: item.schema,
                      extractionNotes: [],
                    });
                    setDrawerOpen(true);
                  }}
                >
                  {t("common.edit")}
                </Button>,
                <Button key="delete" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(item)}>
                  {t("common.delete")}
                </Button>,
              ]}
            >
              <List.Item.Meta title={item.title} description={t("surveys.sectionsCount", { count: item.schema.sections.length })} />
            </List.Item>
          )}
        />
      </Panel>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={980}
        title={t("surveys.editSurvey")}
        extra={
          <Space>
            <Button icon={<SaveOutlined />} type="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {t("surveys.saveSurvey")}
            </Button>
          </Space>
        }
      >
        <SurveySchemaEditor value={draft.schema} onChange={(schema) => setDraft((current) => ({ ...current, schema }))} />
      </Drawer>
    </>
  );
}
