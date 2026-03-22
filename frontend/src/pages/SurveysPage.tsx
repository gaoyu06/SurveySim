// @ts-nocheck
import { PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, List, Space, Typography } from "antd";
import { useState } from "react";
import { type SurveyDraft, type SurveySchemaDto } from "@surveysim/shared";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { SurveySchemaEditor } from "@/components/surveys/SurveySchemaEditor";
import { useI18n } from "@/i18n/I18nProvider";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  return (
    <>
      <PageHeader
        title={t("surveys.title")}
        subtitle={t("surveys.subtitle")}
        actions={[
          <Button
            key="new-import"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/surveys/import")}
          >
            {t("surveys.importRaw")}
          </Button>,
        ]}
      />
      <Panel style={{ marginTop: 18 }}>
        <Typography.Title level={4}>{t("surveys.savedSurveys")}</Typography.Title>
        <List
          locale={{ emptyText: <Empty description={t("surveys.noSurveys")} /> }}
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
                  {t("common.edit")}
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
        <SurveySchemaEditor value={draft.schema} onChange={(schema) => setDraft((current) => ({ ...current, schema }))} />
      </Drawer>
    </>
  );
}
