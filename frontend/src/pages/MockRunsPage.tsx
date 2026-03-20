import { PlayCircleOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, InputNumber, Select, Space, Switch, Table } from "antd";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
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

  return (
    <>
      <PageHeader
        title="Mock execution lab"
        subtitle="Assemble a run from template, survey, and provider configuration, then execute the three-stage pipeline inside the local task engine."
      />
      <div className="workspace-grid">
        <Panel>
          <Form layout="vertical" onFinish={form.handleSubmit((values) => createMutation.mutate(values))}>
            <Form.Item label="Run name">
              <Input {...form.register("name")} />
            </Form.Item>
            <Form.Item label="Participant template">
              <Select
                options={(templatesQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                value={form.watch("participantTemplateId")}
                onChange={(value) => form.setValue("participantTemplateId", value)}
              />
            </Form.Item>
            <Form.Item label="Survey">
              <Select
                options={(surveysQuery.data ?? []).map((item) => ({ label: item.title, value: item.id }))}
                value={form.watch("surveyId")}
                onChange={(value) => form.setValue("surveyId", value)}
              />
            </Form.Item>
            <Form.Item label="LLM config">
              <Select
                options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                value={form.watch("llmConfigId")}
                onChange={(value) => form.setValue("llmConfigId", value)}
              />
            </Form.Item>
            <Space wrap>
              <Form.Item label="Participants">
                <InputNumber min={1} max={1000} value={form.watch("participantCount")} onChange={(value) => form.setValue("participantCount", value ?? 24)} />
              </Form.Item>
              <Form.Item label="Concurrency">
                <InputNumber min={1} max={32} value={form.watch("concurrency")} onChange={(value) => form.setValue("concurrency", value ?? 4)} />
              </Form.Item>
              <Form.Item label="Reuse identity">
                <Switch checked={form.watch("reuseIdentity")} onChange={(checked) => form.setValue("reuseIdentity", checked)} />
              </Form.Item>
              <Form.Item label="Reuse persona prompt">
                <Switch checked={form.watch("reusePersonaPrompt")} onChange={(checked) => form.setValue("reusePersonaPrompt", checked)} />
              </Form.Item>
            </Space>
            <Form.Item label="Extra system prompt">
              <Input.TextArea rows={3} {...form.register("extraSystemPrompt")} />
            </Form.Item>
            <Form.Item label="Extra respondent prompt">
              <Input.TextArea rows={3} {...form.register("extraRespondentPrompt")} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
              Create run
            </Button>
          </Form>
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
