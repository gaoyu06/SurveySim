import { CheckCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, Input, InputNumber, Space, Switch, Table, Tag } from "antd";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  llmProviderConfigInputSchema,
  type LlmProviderConfigDto,
  type LlmProviderConfigInput,
} from "@formagents/shared";
import { ApiError, apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LlmProviderConfigDto | null>(null);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
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
      message.success(editing ? "Config updated" : "Config created");
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
    onSuccess: (result) => message.success(result.ok ? "Connection succeeded" : "Connection failed"),
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
      message.success("Default config updated");
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to update default");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/llm-configs/${id}`);
      message.success("Config deleted");
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to delete config");
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
      message.success(result.ok ? "Connection succeeded" : "Connection failed");
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Connection test failed";
      message.error(errorMessage);
    }
  };

  return (
    <>
      <PageHeader
        title="LLM provider control"
        subtitle="Store multiple OpenAI-compatible endpoints, choose defaults, and verify runtime behavior before mock execution."
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.reset(defaultValues);
              setOpen(true);
            }}
          >
            New config
          </Button>
        }
      />
      <Panel>
        <Table
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data ?? []}
          pagination={false}
          columns={[
            { title: "Name", dataIndex: "name" },
            { title: "Base URL", dataIndex: "baseUrl", ellipsis: true },
            { title: "Model", dataIndex: "model" },
            { title: "Concurrency", dataIndex: "concurrency" },
            { title: "API Key", dataIndex: "maskedApiKey" },
            {
              title: "State",
              render: (_, item) => (item.isDefault ? <Tag color="gold">Default</Tag> : <Tag>Saved</Tag>),
            },
            {
              title: "Actions",
              render: (_, item) => (
                <Space>
                  <Button
                    onClick={() => {
                      setEditing(item);
                      form.reset({ ...item, apiKey: item.apiKey });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleDefault(item.id)}
                  >
                    Default
                  </Button>
                  <Button danger onClick={() => handleDelete(item.id)}>
                    Delete
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Panel>
      <Drawer
        open={open}
        onClose={closeDrawer}
        width={520}
        title={editing ? "Edit LLM config" : "New LLM config"}
      >
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <Form layout="vertical" component={false}>
          <Form.Item
            label="Name"
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
            label="Base URL"
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
            label="API Key"
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
            label="Model"
            validateStatus={form.formState.errors.model ? "error" : ""}
            help={form.formState.errors.model?.message}
          >
            <Controller
              name="model"
              control={form.control}
              render={({ field }) => <Input {...field} value={field.value ?? ""} />}
            />
          </Form.Item>
          <Space>
            <Form.Item label="Temperature" validateStatus={form.formState.errors.temperature ? "error" : ""} help={form.formState.errors.temperature?.message}>
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
            <Form.Item label="Max tokens" validateStatus={form.formState.errors.maxTokens ? "error" : ""} help={form.formState.errors.maxTokens?.message}>
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
          </Space>
          <Space>
            <Form.Item label="Timeout ms" validateStatus={form.formState.errors.timeoutMs ? "error" : ""} help={form.formState.errors.timeoutMs?.message}>
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
            <Form.Item label="Concurrency" validateStatus={form.formState.errors.concurrency ? "error" : ""} help={form.formState.errors.concurrency?.message}>
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
            <Form.Item label="Retries" validateStatus={form.formState.errors.retryCount ? "error" : ""} help={form.formState.errors.retryCount?.message}>
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
          </Space>
          <Form.Item label="Set as default">
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
              Test connection
            </Button>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
              Save
            </Button>
          </Space>
          </Form>
        </form>
      </Drawer>
    </>
  );
}
