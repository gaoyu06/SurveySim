import { DeleteOutlined, ExclamationCircleOutlined, EyeOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Empty, Grid, List, Space, Switch, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SurveySchemaDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { SurveySchemaEditor } from "@/components/surveys/SurveySchemaEditor";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";
import { surveyImportStore } from "@/stores/survey-import.store";

type SurveyRecord = {
  id: string;
  title: string;
  description?: string;
  rawText: string;
  schema: SurveySchemaDto;
  ownerId?: string;
  ownerEmail?: string;
  isOwnedByCurrentUser?: boolean;
  createdAt: string;
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function SurveysListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const currentUser = authStore((state) => state.user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [onlyOwnData, setOnlyOwnData] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const draft = surveyImportStore((state) => state.draft);
  const editingSurveyId = surveyImportStore((state) => state.editingSurveyId);
  const hasUnsavedDraft = surveyImportStore((state) => state.hasUnsavedDraft);
  const setDraft = surveyImportStore((state) => state.setDraft);
  const setEditingSurveyId = surveyImportStore((state) => state.setEditingSurveyId);
  const setHasUnsavedDraft = surveyImportStore((state) => state.setHasUnsavedDraft);
  const resetDraft = surveyImportStore((state) => state.resetDraft);

  const surveysQuery = useQuery({
    queryKey: ["content-tasks", currentUser?.role, onlyOwnData, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currentUser?.role === "admin" && !onlyOwnData) {
        params.set("scope", "all");
      }
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const query = params.toString();
      return apiClient.get<PaginatedResponse<SurveyRecord>>(`/content-tasks${query ? `?${query}` : ""}`);
    },
  });

  useEffect(() => {
    setPage(1);
  }, [onlyOwnData]);

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
      setHasUnsavedDraft(false);
      void queryClient.invalidateQueries({ queryKey: ["content-tasks"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/content-tasks/${id}`),
    onSuccess: async (_, id) => {
      message.success(t("surveys.deleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["content-tasks"] });
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
          <Space wrap>
            {currentUser?.role === "admin" ? (
              <Space wrap>
                <span>{t("common.onlyMine")}</span>
                <Switch checked={onlyOwnData} onChange={setOnlyOwnData} />
              </Space>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/content-tasks/import")}>
              {t("surveys.importAction")}
            </Button>
          </Space>
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
              <Button onClick={() => navigate("/content-tasks/import/stream")}>{t("surveys.reopenDraft")}</Button>
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
          dataSource={surveysQuery.data?.items ?? []}
          pagination={{
            current: page,
            pageSize,
            total: surveysQuery.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            onChange: (nextPage, nextPageSize) => {
              if (nextPageSize !== pageSize) {
                setPage(1);
                setPageSize(nextPageSize);
                return;
              }
              setPage(nextPage);
            },
          }}
          renderItem={(item) => (
            <List.Item
              className="responsive-list-item"
              actions={[
                <div key="actions" className="responsive-list-actions">
                  <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/content-tasks/${item.id}/preview`)}>
                    {t("common.preview")}
                  </Button>
                  <Button
                    size="small"
                    disabled={item.isOwnedByCurrentUser === false}
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
                  </Button>
                  <Button size="small" danger disabled={item.isOwnedByCurrentUser === false} icon={<DeleteOutlined />} onClick={() => confirmDelete(item)}>
                    {t("common.delete")}
                  </Button>
                </div>,
              ]}
            >
              <List.Item.Meta
                title={item.title}
                description={`${t("surveys.sectionsCount", { count: item.schema.sections.length })}${item.ownerEmail ? ` · ${t("common.owner")}: ${item.ownerEmail}` : ""}`}
              />
            </List.Item>
          )}
        />
      </Panel>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={screens.lg ? 980 : "100%"}
        title={t("surveys.editSurvey")}
        extra={
          <Space>
            <Button icon={<SaveOutlined />} type="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {t("surveys.saveSurvey")}
            </Button>
          </Space>
        }
      >
        <SurveySchemaEditor value={draft.schema} onChange={(schema: SurveySchemaDto) => setDraft((current) => ({ ...current, schema }))} />
      </Drawer>
    </>
  );
}
