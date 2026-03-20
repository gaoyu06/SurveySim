import { PlayCircleOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, InputNumber, Select, Space, Switch, Table } from "antd";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import {
  mockRunCreateInputSchema,
  type LlmProviderConfigDto,
  type MockRunCreateInput,
  type MockRunDto,
  type ParticipantTemplateDto,
} from "@formagents/shared";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";

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
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      message.success("Mock run created");
      form.reset(defaultValues);
      queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
      navigate(`/mock-runs/${result.id}`);
    },
    onError: (error: Error) => message.error(error.message),
  });

  const runAction = async (id: string, action: "start" | "cancel") => {
    await apiClient.post(`/mock-runs/${id}/${action}`);
    queryClient.invalidateQueries({ queryKey: ["mock-runs"] });
  };

  const submit = async (values: MockRunCreateInput) => {
    try {
      await createMutation.mutateAsync(values);
    } catch {
      // handled by mutation
    }
  };

  return (
    <>
      <PageHeader
        title="Mock execution lab"
        subtitle="Assemble a run from template, survey, and provider configuration, then execute the three-stage pipeline inside the local task engine."
      />
      <div className="workspace-grid">
        <Panel>
          <form onSubmit={form.handleSubmit(submit)} noValidate>
            <Form layout="vertical" component={false}>
            <Form.Item label="Run name" validateStatus={form.formState.errors.name ? "error" : ""} help={form.formState.errors.name?.message}>
              <Controller
                name="name"
                control={form.control}
                render={({ field }) => <Input {...field} value={field.value ?? ""} />}
              />
            </Form.Item>
            <Form.Item label="Participant template" validateStatus={form.formState.errors.participantTemplateId ? "error" : ""} help={form.formState.errors.participantTemplateId?.message}>
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
            <Form.Item label="Survey" validateStatus={form.formState.errors.surveyId ? "error" : ""} help={form.formState.errors.surveyId?.message}>
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
            <Form.Item label="LLM config" validateStatus={form.formState.errors.llmConfigId ? "error" : ""} help={form.formState.errors.llmConfigId?.message}>
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
              <Form.Item label="Participants" validateStatus={form.formState.errors.participantCount ? "error" : ""} help={form.formState.errors.participantCount?.message}>
                <Controller
                  name="participantCount"
                  control={form.control}
                  render={({ field }) => (
                    <InputNumber min={1} max={1000} value={field.value} onChange={(value) => field.onChange(value ?? 24)} />
                  )}
                />
              </Form.Item>
              <Form.Item label="Concurrency" validateStatus={form.formState.errors.concurrency ? "error" : ""} help={form.formState.errors.concurrency?.message}>
                <Controller
                  name="concurrency"
                  control={form.control}
                  render={({ field }) => (
                    <InputNumber min={1} max={32} value={field.value} onChange={(value) => field.onChange(value ?? 4)} />
                  )}
                />
              </Form.Item>
              <Form.Item label="Reuse identity">
                <Controller
                  name="reuseIdentity"
                  control={form.control}
                  render={({ field }) => <Switch checked={Boolean(field.value)} onChange={field.onChange} />}
                />
              </Form.Item>
              <Form.Item label="Reuse persona prompt">
                <Controller
                  name="reusePersonaPrompt"
                  control={form.control}
                  render={({ field }) => <Switch checked={Boolean(field.value)} onChange={field.onChange} />}
                />
              </Form.Item>
            </Space>
            <Form.Item label="Extra system prompt">
              <Controller
                name="extraSystemPrompt"
                control={form.control}
                render={({ field }) => <Input.TextArea rows={3} {...field} value={field.value ?? ""} />}
              />
            </Form.Item>
            <Form.Item label="Extra respondent prompt">
              <Controller
                name="extraRespondentPrompt"
                control={form.control}
                render={({ field }) => <Input.TextArea rows={3} {...field} value={field.value ?? ""} />}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
              Create run
            </Button>
            </Form>
          </form>
        </Panel>

        <Panel>
          <Table
            rowKey="id"
            dataSource={runsQuery.data ?? []}
            pagination={false}
            columns={[
              { title: "Run", dataIndex: "name" },
              { title: "Status", dataIndex: "status" },
              { title: "Participants", dataIndex: "participantCount" },
              {
                title: "Progress",
                render: (_, item) => `${item.progress.responseCompleted}/${item.progress.total}`,
              },
              {
                title: "Actions",
                render: (_, item) => (
                  <Space>
                    <Button icon={<PlayCircleOutlined />} onClick={() => runAction(item.id, "start")}>
                      Start
                    </Button>
                    <Button onClick={() => runAction(item.id, "cancel")}>Cancel</Button>
                    <Button onClick={() => navigate(`/mock-runs/${item.id}`)}>Detail</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
