import { CheckCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, Grid, Input, InputNumber, Space, Switch, Table, Tag } from "antd";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { llmProviderConfigInputSchema, type LlmProviderConfigDto, type LlmProviderConfigInput } from "@surveysim/shared";
import { ApiError, apiClient } from "@/api/client";
import { useI18n } from "@/i18n/I18nProvider";
import { PageHeader, Panel } from "@/components/PageHeader";
import { authStore } from "@/stores/auth.store";

const defaultValues: LlmProviderConfigInput = {
  name: "Jucode GPT-5.4",
  baseUrl: "https://api.jucode.cn/v1/chat/completions",
  apiKey: "",
  model: "gpt-5.4",
  temperature: 0.7,
  maxTokens: 4000,
  timeoutMs: 60000,
  concurrency: 4,
  retryCount: 2,
  isDefault: true,
};

export function LlmConfigsPage() {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const currentUser = authStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LlmProviderConfigDto | null>(null);
  const [onlyOwnData, setOnlyOwnData] = useState(true);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["llm-configs", currentUser?.role, onlyOwnData],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>(`/llm-configs${currentUser?.role === "admin" && !onlyOwnData ? "?scope=all" : ""}`),
  });

  const form = useForm<LlmProviderConfigInput>({
    resolver: zodResolver(llmProviderConfigInputSchema),
    defaultValues,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: LlmProviderConfigInput) =>
      editing
        ? apiClient.put<LlmProviderConfigDto>(`/llm-configs/${editing.id}`, values)
        : apiClient.post<LlmProviderConfigDto>("/llm-configs", values),
    onSuccess: () => {
      message.success(editing ? t("llm.configUpdated") : t("llm.configCreated"));
      setOpen(false);
      setEditing(null);
      form.reset(defaultValues);
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: (values: LlmProviderConfigInput) =>
      apiClient.post<{ ok: boolean }>("/llm-configs/test", values),
    onSuccess: (result) => message.success(result.ok ? t("llm.connectionSucceeded") : t("llm.connectionFailed")),
    onError: (error: Error) => message.error(error.message),
  });

  const publicMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      apiClient.post<LlmProviderConfigDto>(`/llm-configs/${id}/public`, { isPublic }),
    onSuccess: () => {
      message.success(t("llm.visibilityUpdated"));
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const closeDrawer = () => {
    setOpen(false);
    setEditing(null);
    form.reset(defaultValues);
  };

  const handleDefault = async (id: string) => {
    try {
      await apiClient.post(`/llm-configs/${id}/default`);
      message.success(t("llm.defaultUpdated"));
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("llm.defaultUpdated"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/llm-configs/${id}`);
      message.success(t("llm.configDeleted"));
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("llm.configDeleted"));
    }
  };

  const submit = async (values: LlmProviderConfigInput) => {
    try {
      await saveMutation.mutateAsync(values);
    } catch {
      // handled in mutation onError
    }
  };

  const testConnection = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    try {
      const values = form.getValues();
      const result = await testMutation.mutateAsync(values);
      message.success(result.ok ? t("llm.connectionSucceeded") : t("llm.connectionFailed"));
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : t("llm.connectionFailed");
      message.error(errorMessage);
    }
  };

  return (
    <>
      <PageHeader
        title={t("llm.title")}
        subtitle={t("llm.subtitle")}
        actions={
          <Space wrap>
            {currentUser?.role === "admin" ? (
              <Space wrap>
                <span>{t("common.onlyMine")}</span>
                <Switch checked={onlyOwnData} onChange={setOnlyOwnData} />
              </Space>
            ) : null}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                form.reset(defaultValues);
                setOpen(true);
              }}
            >
              {t("llm.newConfig")}
            </Button>
          </Space>
        }
      />
      <Panel>
        <Table
          className="llm-configs-table"
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data ?? []}
          pagination={false}
          scroll={{ x: "max-content" }}
          columns={[
            { title: t("llm.name"), dataIndex: "name" },
            { title: t("common.owner"), dataIndex: "ownerEmail" },
            { title: t("llm.baseUrl"), dataIndex: "baseUrl", ellipsis: true },
            { title: t("llm.model"), dataIndex: "model" },
            { title: t("llm.concurrency"), dataIndex: "concurrency" },
            { title: t("llm.apiKey"), dataIndex: "maskedApiKey" },
            {
              title: t("llm.state"),
              render: (_, item) => (
                <Space wrap>
                  {item.isDefault ? <Tag color="blue">{t("llm.defaultTag")}</Tag> : <Tag>{t("llm.savedTag")}</Tag>}
                  {item.isPublic ? <Tag color="gold">{t("llm.publicTag")}</Tag> : null}
                  {!item.isOwnedByCurrentUser ? <Tag>{t("llm.readOnlyTag")}</Tag> : null}
                </Space>
              ),
            },
            {
              title: t("common.actions"),
              width: 340,
              render: (_, item) => (
                <div className="table-action-scroll">
                  <Space>
                    <Button
                      disabled={!item.isOwnedByCurrentUser}
                      onClick={() => {
                        setEditing(item);
                        form.reset({ ...item, apiKey: item.apiKey });
                        setOpen(true);
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      icon={<CheckCircleOutlined />}
                      disabled={!item.isOwnedByCurrentUser}
                      onClick={() => handleDefault(item.id)}
                    >
                      {t("common.default")}
                    </Button>
                    {currentUser?.role === "admin" ? (
                      <Button loading={publicMutation.isPending && publicMutation.variables?.id === item.id} onClick={() => publicMutation.mutate({ id: item.id, isPublic: !item.isPublic })}>
                        {item.isPublic ? t("llm.makePrivate") : t("llm.makePublic")}
                      </Button>
                    ) : null}
                    <Button danger disabled={!item.isOwnedByCurrentUser} onClick={() => handleDelete(item.id)}>
                      {t("common.delete")}
                    </Button>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Drawer
        open={open}
        onClose={closeDrawer}
        width={screens.md ? 520 : "100%"}
        title={editing ? t("llm.editConfig") : t("llm.createConfig")}
      >
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <Form layout="vertical" component={false}>
          <Form.Item
            label={t("llm.name")}
            validateStatus={form.formState.errors.name ? "error" : ""}
            help={form.formState.errors.name?.message}
          >
            <Controller
              name="name"
              control={form.control}
              render={({ field }) => <Input {...field} value={field.value ?? ""} />}
            />
          </Form.Item>
          <Form.Item
            label={t("llm.baseUrl")}
            validateStatus={form.formState.errors.baseUrl ? "error" : ""}
            help={form.formState.errors.baseUrl?.message}
          >
            <Controller
              name="baseUrl"
              control={form.control}
              render={({ field }) => <Input {...field} value={field.value ?? ""} />}
            />
          </Form.Item>
          <Form.Item
            label={t("llm.apiKey")}
            validateStatus={form.formState.errors.apiKey ? "error" : ""}
            help={form.formState.errors.apiKey?.message}
          >
            <Controller
              name="apiKey"
              control={form.control}
              render={({ field }) => <Input.Password {...field} value={field.value ?? ""} />}
            />
          </Form.Item>
          <Form.Item
            label={t("llm.model")}
            validateStatus={form.formState.errors.model ? "error" : ""}
            help={form.formState.errors.model?.message}
          >
            <Controller
              name="model"
              control={form.control}
              render={({ field }) => <Input {...field} value={field.value ?? ""} />}
            />
          </Form.Item>
          <div className="responsive-form-inline">
            <Form.Item label={t("llm.temperature")} validateStatus={form.formState.errors.temperature ? "error" : ""} help={form.formState.errors.temperature?.message}>
              <Controller
                name="temperature"
                control={form.control}
                render={({ field }) => (
                  <InputNumber
                    min={0}
                    max={2}
                    step={0.1}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 0.7)}
                  />
                )}
              />
            </Form.Item>
            <Form.Item label={t("llm.maxTokens")} validateStatus={form.formState.errors.maxTokens ? "error" : ""} help={form.formState.errors.maxTokens?.message}>
              <Controller
                name="maxTokens"
                control={form.control}
                render={({ field }) => (
                  <InputNumber
                    min={64}
                    max={16000}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 4000)}
                  />
                )}
              />
            </Form.Item>
          </div>
          <div className="responsive-form-inline">
            <Form.Item label={t("llm.timeoutMs")} validateStatus={form.formState.errors.timeoutMs ? "error" : ""} help={form.formState.errors.timeoutMs?.message}>
              <Controller
                name="timeoutMs"
                control={form.control}
                render={({ field }) => (
                  <InputNumber
                    min={1000}
                    max={300000}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 60000)}
                  />
                )}
              />
            </Form.Item>
            <Form.Item label={t("llm.concurrency")} validateStatus={form.formState.errors.concurrency ? "error" : ""} help={form.formState.errors.concurrency?.message}>
              <Controller
                name="concurrency"
                control={form.control}
                render={({ field }) => (
                  <InputNumber
                    min={1}
                    max={32}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 4)}
                  />
                )}
              />
            </Form.Item>
            <Form.Item label={t("llm.retries")} validateStatus={form.formState.errors.retryCount ? "error" : ""} help={form.formState.errors.retryCount?.message}>
              <Controller
                name="retryCount"
                control={form.control}
                render={({ field }) => (
                  <InputNumber
                    min={0}
                    max={8}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 2)}
                  />
                )}
              />
            </Form.Item>
          </div>
          <Form.Item label={t("llm.setAsDefault")}>
            <Controller
              name="isDefault"
              control={form.control}
              render={({ field }) => (
                <Switch checked={Boolean(field.value)} onChange={field.onChange} />
              )}
            />
          </Form.Item>
          <Space>
            <Button
              htmlType="button"
              onClick={() => void testConnection()}
              loading={testMutation.isPending}
            >
              {t("llm.testConnection")}
            </Button>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
              {t("llm.save")}
            </Button>
          </Space>
          </Form>
        </form>
      </Drawer>
    </>
  );
}
