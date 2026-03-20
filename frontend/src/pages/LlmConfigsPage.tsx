import { CheckCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, Input, InputNumber, Space, Table, Tag } from "antd";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  llmProviderConfigInputSchema,
  type LlmProviderConfigDto,
  type LlmProviderConfigInput,
} from "@formagents/shared";
import { apiClient } from "@/api/client";
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
                    onClick={() =>
                      apiClient
                        .post(`/llm-configs/${item.id}/default`)
                        .then(() => queryClient.invalidateQueries({ queryKey: ["llm-configs"] }))
                    }
                  >
                    Default
                  </Button>
                  <Button
                    danger
                    onClick={() =>
                      apiClient
                        .delete(`/llm-configs/${item.id}`)
                        .then(() => queryClient.invalidateQueries({ queryKey: ["llm-configs"] }))
                    }
                  >
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
        onClose={() => setOpen(false)}
        width={520}
        title={editing ? "Edit LLM config" : "New LLM config"}
      >
        <Form layout="vertical" onFinish={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <Form.Item label="Name">
            <Input {...form.register("name")} />
          </Form.Item>
          <Form.Item label="Base URL">
            <Input {...form.register("baseUrl")} />
          </Form.Item>
          <Form.Item label="API Key">
            <Input.Password {...form.register("apiKey")} />
          </Form.Item>
          <Form.Item label="Model">
            <Input {...form.register("model")} />
          </Form.Item>
          <Space>
            <Form.Item label="Temperature">
              <InputNumber
                min={0}
                max={2}
                step={0.1}
                value={form.watch("temperature")}
                onChange={(value) => form.setValue("temperature", value ?? 0.7)}
              />
            </Form.Item>
            <Form.Item label="Max tokens">
              <InputNumber
                min={64}
                max={16000}
                value={form.watch("maxTokens")}
                onChange={(value) => form.setValue("maxTokens", value ?? 4000)}
              />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item label="Timeout ms">
              <InputNumber
                min={1000}
                max={300000}
                value={form.watch("timeoutMs")}
                onChange={(value) => form.setValue("timeoutMs", value ?? 60000)}
              />
            </Form.Item>
            <Form.Item label="Concurrency">
              <InputNumber
                min={1}
                max={32}
                value={form.watch("concurrency")}
                onChange={(value) => form.setValue("concurrency", value ?? 4)}
              />
            </Form.Item>
            <Form.Item label="Retries">
              <InputNumber
                min={0}
                max={8}
                value={form.watch("retryCount")}
                onChange={(value) => form.setValue("retryCount", value ?? 2)}
              />
            </Form.Item>
          </Space>
          <Space>
            <Button
              onClick={form.handleSubmit((values) => testMutation.mutate(values))}
              loading={testMutation.isPending}
            >
              Test connection
            </Button>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
              Save
            </Button>
          </Space>
        </Form>
      </Drawer>
    </>
  );
}
