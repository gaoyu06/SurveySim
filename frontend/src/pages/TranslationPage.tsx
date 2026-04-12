import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Empty, Form, Input, Modal, Popconfirm, Space, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);

export function TranslationPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);

  const projects = useQuery({
    queryKey: ["translation-projects"],
    queryFn: () => apiClient.get<any[]>("/translations/projects"),
  });

  const createProject = useMutation({
    mutationFn: (data: any) => apiClient.post("/translations/projects", data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["translation-projects"] });
      setModalOpen(false);
      form.resetFields();
      navigate(`/translation/projects/${result.id}`, { state: { autoOpenAddVersion: true } });
    },
    onError: (error: Error) => {
      console.error("Failed to create project:", error);
    },
  });

  const deleteProject = useMutation({
    mutationFn: (projectId: string) => apiClient.delete(`/translations/projects/${projectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["translation-projects"] });
    },
  });

  const handleCreate = () => {
    form
      .validateFields()
      .then((values) => {
        createProject.mutate(values);
      })
      .catch(() => {
        // validation failed, Ant Design shows errors inline
      });
  };

  return (
    <>
      <PageHeader
        title={t("translation.title")}
        subtitle={t("translation.subtitle")}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t("translation.createProject")}
          </Button>
        }
      />

      {projects.data?.length ? (
        <div className="translation-project-grid">
          {projects.data.map((project: any) => (
            <Card
              key={project.id}
              className="translation-project-card"
              hoverable
              onClick={() => navigate(`/translation/projects/${project.id}`)}
              extra={
                <Popconfirm
                  title={t("translation.deleteProjectConfirm")}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    deleteProject.mutate(project.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    loading={deleteProject.isPending && deleteProject.variables === project.id}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              }
            >
              <Typography.Title level={4} ellipsis>
                {project.title}
              </Typography.Title>
              <div className="translation-project-card__meta">
                {project.dramaTheme && (
                  <span className="translation-project-card__tag">{project.dramaTheme}</span>
                )}
                {project.targetMarket && (
                  <span className="translation-project-card__tag">{project.targetMarket}</span>
                )}
              </div>
              <div className="translation-project-card__footer">
                <Typography.Text type="secondary">
                  {t("translation.versionCount", { count: project.versionCount })}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {dayjs(project.updatedAt).locale(locale === "zh-CN" ? "zh-cn" : "en").fromNow()}
                </Typography.Text>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            description={t("translation.emptyProjects")}
            style={{ padding: 48 }}
          >
            <Button type="primary" onClick={() => setModalOpen(true)}>
              {t("translation.createFirstProject")}
            </Button>
          </Empty>
        </Panel>
      )}

      <Modal
        title={t("translation.createProject")}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={handleCreate}
        confirmLoading={createProject.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label={t("translation.projectTitle")} rules={[{ required: true, message: t("translation.projectTitleRequired") }]}>
            <Input placeholder={t("translation.projectTitlePlaceholder")} />
          </Form.Item>
          <Form.Item name="dramaTheme" label={t("translation.dramaTheme")}>
            <Input placeholder={t("translation.dramaThemePlaceholder")} />
          </Form.Item>
          <Form.Item name="targetMarket" label={t("translation.targetMarket")}>
            <Input placeholder={t("translation.targetMarketPlaceholder")} />
          </Form.Item>
          <Form.Item name="targetCulture" label={t("translation.targetCulture")}>
            <Input placeholder={t("translation.targetCulturePlaceholder")} />
          </Form.Item>
          <Space style={{ width: "100%" }} direction="horizontal" size={16}>
            <Form.Item name="sourceLanguage" label={t("translation.sourceLanguage")} style={{ flex: 1 }}>
              <Input placeholder={t("translation.languagePlaceholder")} />
            </Form.Item>
            <Form.Item name="targetLanguage" label={t("translation.targetLanguage")} style={{ flex: 1 }}>
              <Input placeholder={t("translation.languagePlaceholder")} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
