import { DeleteOutlined, ExclamationCircleOutlined, PlayCircleOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import {
  mockRunStartModeSchema,
  mockRunCreateInputSchema,
  type LlmProviderConfigDto,
  type MockRunCreateInput,
  type MockRunDto,
  type MockRunStartInput,
  type ParticipantTemplateDto,
} from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

type SurveyRecord = { id: string; title: string };

const defaultValues: MockRunCreateInput = {
  name: "Batch 01",
  participantTemplateId: "",
  surveyId: "",
  llmConfigId: "",
  participantCount: 24,
  concurrency: 4,
  reuseIdentity: false,
  reusePersonaPrompt: false,
  extraSystemPrompt: "",
  extraRespondentPrompt: "",
};

export function MockRunsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [startChoiceRun, setStartChoiceRun] = useState<MockRunDto | null>(null);
  const form = useForm<MockRunCreateInput>({
    resolver: zodResolver(mockRunCreateInputSchema),
    defaultValues,
  });

  const [templatesQuery, surveysQuery, llmConfigsQuery, runsQuery] = [
    useQuery({
      queryKey: ["templates"],
      queryFn: () => apiClient.get<ParticipantTemplateDto[]>("/participant-templates"),
    }),
    useQuery({
      queryKey: ["surveys"],
      queryFn: () => apiClient.get<SurveyRecord[]>("/surveys"),
    }),
    useQuery({
      queryKey: ["llm-configs"],
      queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
    }),
    useQuery({
      queryKey: ["mock-runs"],
      queryFn: () => apiClient.get<MockRunDto[]>("/mock-runs"),
      refetchInterval: 4000,
    }),
  ];

  const createMutation = useMutation({
    mutationFn: (values: MockRunCreateInput) => apiClient.post<MockRunDto>("/mock-runs", values),
    onSuccess: (result) => {
      message.success(t("mockRuns.runCreated"));
      form.reset(defaultValues);
      setIsCreateDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      navigate(`/mock-runs/${result.id}`);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: "start" | "cancel"; body?: MockRunStartInput }) =>
      apiClient.post(`/mock-runs/${id}/${action}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-runs"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/mock-runs/${id}`),
    onSuccess: async (_, id) => {
      message.success(t("mockRuns.runDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-runs"] });
      queryClient.removeQueries({ queryKey: ["mock-run", id] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const confirmDelete = (item: MockRunDto) => {
    if (isRunActive(item.status)) {
      message.warning(t("mockRuns.deleteBlocked"));
      return;
    }

    modal.confirm({
      title: t("mockRuns.deleteConfirmTitle"),
      content: t("mockRuns.deleteConfirmDescription", { name: item.name }),
      okText: t("common.delete"),
      cancelText: t("common.cancel"),
      okButtonProps: {
        danger: true,
      },
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        await deleteMutation.mutateAsync(item.id);
      },
    });
  };

  const isRunActive = (status: MockRunDto["status"]) => ["queued", "running", "canceling"].includes(status);

  const getRunControl = (status: MockRunDto["status"]) => {
    if (status === "canceling") {
      return {
        action: "cancel" as const,
        label: t("status.canceling"),
        icon: <StopOutlined />,
        danger: true,
        disabled: true,
      };
    }

    if (isRunActive(status)) {
      return {
        action: "cancel" as const,
        label: t("mockRuns.cancel"),
        icon: <StopOutlined />,
        danger: true,
        disabled: false,
      };
    }

    return {
      action: "start" as const,
      label: t("mockRuns.start"),
      icon: <PlayCircleOutlined />,
      danger: false,
      disabled: false,
    };
  };

  const submit = async (values: MockRunCreateInput) => {
    try {
      await createMutation.mutateAsync(values);
    } catch {
      // handled by mutation
    }
  };

  const handleRunAction = async (item: MockRunDto, action: "start" | "cancel") => {
    if (action === "start") {
      setStartChoiceRun(item);
      return;
    }

    try {
      await actionMutation.mutateAsync({ id: item.id, action });
    } catch {
      // handled by mutation
    }
  };

  return (
    <>
      <PageHeader
        title={t("mockRuns.title")}
        subtitle={t("mockRuns.subtitle")}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateDrawerOpen(true)}>
            {t("mockRuns.newRun")}
          </Button>
        }
      />
      <Panel>
        <Table
          rowKey="id"
          dataSource={runsQuery.data ?? []}
          pagination={false}
          columns={[
            { title: t("mockRuns.run"), dataIndex: "name" },
            {
              title: t("common.status"),
              render: (_, item) => t(`status.${item.status}`),
            },
            { title: t("mockRuns.participants"), dataIndex: "participantCount" },
            {
              title: t("mockRuns.progress"),
              render: (_, item) => `${item.progress.responseCompleted}/${item.progress.total}`,
            },
            {
              title: t("common.actions"),
              render: (_, item) => {
                const control = getRunControl(item.status);
                const isMutatingCurrent = actionMutation.isPending && actionMutation.variables?.id === item.id;

                return (
                  <Space wrap>
                    <Button
                      type={control.action === "start" ? "primary" : "default"}
                      danger={control.danger}
                      icon={control.icon}
                      loading={item.status === "canceling" || isMutatingCurrent}
                      disabled={control.disabled}
                      onClick={() => handleRunAction(item, control.action)}
                    >
                      {control.label}
                    </Button>
                    <Button onClick={() => navigate(`/mock-runs/${item.id}`)}>{t("mockRuns.detail")}</Button>
                    <Button danger icon={<DeleteOutlined />} onClick={() => confirmDelete(item)}>
                      {t("mockRuns.delete")}
                    </Button>
                  </Space>
                );
              },
            },
          ]}
        />
      </Panel>

      <Drawer
        title={t("mockRuns.createRunDrawerTitle")}
        width={560}
        open={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
      >
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <Form layout="vertical" component={false}>
            <Form.Item label={t("mockRuns.runName")} validateStatus={form.formState.errors.name ? "error" : ""} help={form.formState.errors.name?.message}>
              <Controller
                name="name"
                control={form.control}
                render={({ field }) => <Input {...field} value={field.value ?? ""} />}
              />
            </Form.Item>
            <Form.Item label={t("mockRuns.template")} validateStatus={form.formState.errors.participantTemplateId ? "error" : ""} help={form.formState.errors.participantTemplateId?.message}>
              <Controller
                name="participantTemplateId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    options={(templatesQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Form.Item>
            <Form.Item label={t("mockRuns.survey")} validateStatus={form.formState.errors.surveyId ? "error" : ""} help={form.formState.errors.surveyId?.message}>
              <Controller
                name="surveyId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    options={(surveysQuery.data ?? []).map((item) => ({ label: item.title, value: item.id }))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Form.Item>
            <Form.Item label={t("mockRuns.llmConfig")} validateStatus={form.formState.errors.llmConfigId ? "error" : ""} help={form.formState.errors.llmConfigId?.message}>
              <Controller
                name="llmConfigId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Form.Item>
            <Space wrap>
              <Form.Item label={t("mockRuns.participants")} validateStatus={form.formState.errors.participantCount ? "error" : ""} help={form.formState.errors.participantCount?.message}>
                <Controller
                  name="participantCount"
                  control={form.control}
                  render={({ field }) => (
                    <InputNumber min={1} max={1000} value={field.value} onChange={(value) => field.onChange(value ?? 24)} />
                  )}
                />
              </Form.Item>
              <Form.Item label={t("mockRuns.concurrency")} validateStatus={form.formState.errors.concurrency ? "error" : ""} help={form.formState.errors.concurrency?.message}>
                <Controller
                  name="concurrency"
                  control={form.control}
                  render={({ field }) => (
                    <InputNumber min={1} max={32} value={field.value} onChange={(value) => field.onChange(value ?? 4)} />
                  )}
                />
              </Form.Item>
              <Form.Item label={t("mockRuns.reuseIdentity")}>
                <Controller
                  name="reuseIdentity"
                  control={form.control}
                  render={({ field }) => <Switch checked={Boolean(field.value)} onChange={field.onChange} />}
                />
              </Form.Item>
              <Form.Item label={t("mockRuns.reusePersona")}>
                <Controller
                  name="reusePersonaPrompt"
                  control={form.control}
                  render={({ field }) => <Switch checked={Boolean(field.value)} onChange={field.onChange} />}
                />
              </Form.Item>
            </Space>
            <Form.Item label={t("mockRuns.extraSystemPrompt")}>
              <Controller
                name="extraSystemPrompt"
                control={form.control}
                render={({ field }) => <Input.TextArea rows={3} {...field} value={field.value ?? ""} />}
              />
            </Form.Item>
            <Form.Item label={t("mockRuns.extraRespondentPrompt")}>
              <Controller
                name="extraRespondentPrompt"
                control={form.control}
                render={({ field }) => <Input.TextArea rows={3} {...field} value={field.value ?? ""} />}
              />
            </Form.Item>
            <Space>
              <Button onClick={() => setIsCreateDrawerOpen(false)}>{t("common.cancel")}</Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                {t("mockRuns.createRun")}
              </Button>
            </Space>
          </Form>
        </form>
      </Drawer>
      <Modal
        open={Boolean(startChoiceRun)}
        title={t("mockRuns.startModeTitle")}
        footer={null}
        onCancel={() => setStartChoiceRun(null)}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t("mockRuns.startModeDescription")}
          </Typography.Paragraph>
          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button onClick={() => setStartChoiceRun(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (!startChoiceRun) return;
                try {
                  await actionMutation.mutateAsync({
                    id: startChoiceRun.id,
                    action: "start",
                    body: { mode: mockRunStartModeSchema.enum.restart },
                  });
                  setStartChoiceRun(null);
                } catch {
                  // handled by mutation
                }
              }}
            >
              {t("mockRuns.restartRun")}
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                if (!startChoiceRun) return;
                try {
                  await actionMutation.mutateAsync({
                    id: startChoiceRun.id,
                    action: "start",
                    body: { mode: mockRunStartModeSchema.enum.continue },
                  });
                  setStartChoiceRun(null);
                } catch {
                  // handled by mutation
                }
              }}
            >
              {t("mockRuns.continueRun")}
            </Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}
