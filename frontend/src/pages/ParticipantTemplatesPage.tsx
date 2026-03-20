import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, InputNumber, List, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ParticipantRuleInput, ParticipantTemplateDto, TemplatePreview } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { SimpleChart } from "@/components/charts/SimpleChart";
import { RuleBuilder } from "@/components/forms/RuleBuilder";
import { PageHeader, Panel } from "@/components/PageHeader";

type TemplateDraft = {
  template: {
    name: string;
    description?: string;
    dimensions: string[];
    sampleSizePreview: number;
  };
  rules: ParticipantRuleInput[];
};

const defaultDraft: TemplateDraft = {
  template: {
    name: "Global consumer baseline",
    description: "Editable synthetic audience with layered rules.",
    dimensions: ["country", "gender", "ageRange", "interests", "incomeRange"],
    sampleSizePreview: 300,
  },
  rules: [
    {
      name: "Gender split",
      enabled: true,
      priority: 100,
      assignment: {
        attribute: "gender",
        mode: "distribution",
        distribution: [
          { value: "female", percentage: 50 },
          { value: "male", percentage: 50 },
        ],
      },
    },
  ],
};

function toDraft(template: ParticipantTemplateDto): TemplateDraft {
  return {
    template: {
      name: template.name,
      description: template.description,
      dimensions: template.dimensions,
      sampleSizePreview: template.sampleSizePreview,
    },
    rules: template.rules.map((rule) => ({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      scope: rule.scope,
      assignment: rule.assignment,
      note: rule.note,
    })),
  };
}

export function ParticipantTemplatesPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(defaultDraft);

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiClient.get<ParticipantTemplateDto[]>("/participant-templates"),
  });

  const previewQuery = useQuery({
    queryKey: ["template-preview", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => apiClient.get<TemplatePreview>(`/participant-templates/${selectedId}/preview`),
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((item) => item.id === selectedId) ?? null,
    [templatesQuery.data, selectedId],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setDraft(defaultDraft);
      return;
    }
    setDraft(toDraft(selectedTemplate));
  }, [selectedTemplate]);

  const saveMutation = useMutation({
    mutationFn: () =>
      selectedId
        ? apiClient.put<ParticipantTemplateDto>(`/participant-templates/${selectedId}`, draft)
        : apiClient.post<ParticipantTemplateDto>("/participant-templates", draft),
    onSuccess: (result) => {
      message.success(selectedId ? "Template updated" : "Template created");
      setSelectedId(result.id);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template-preview", result.id] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/participant-templates/${id}`),
    onSuccess: () => {
      message.success("Template deleted");
      setSelectedId(null);
      setDraft(defaultDraft);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const previewOptions = useMemo(() => {
    const distributions = previewQuery.data?.attributeDistributions ?? {};
    const firstEntry = Object.entries(distributions)[0];
    if (!firstEntry) return null;
    const [name, items] = firstEntry;
    return {
      title: {
        text: `${name} distribution`,
        left: "center",
        textStyle: { color: "#f4ede1", fontFamily: "Fraunces, serif" },
      },
      tooltip: {},
      xAxis: { type: "category", data: items.map((item) => item.label), axisLabel: { color: "#f4ede1" } },
      yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
      series: [
        {
          type: "bar",
          data: items.map((item) => item.count),
          itemStyle: { color: "#d7b98f", borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [previewQuery.data]);

  const pieOptions = useMemo(() => {
    const distributions = previewQuery.data?.attributeDistributions ?? {};
    const firstEntry = Object.entries(distributions)[1] ?? Object.entries(distributions)[0];
    if (!firstEntry) return null;
    const [name, items] = firstEntry;
    return {
      title: {
        text: `${name} share`,
        left: "center",
        textStyle: { color: "#f4ede1", fontFamily: "Fraunces, serif" },
      },
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
      series: [
        {
          type: "pie",
          radius: ["42%", "72%"],
          data: items.map((item) => ({ name: item.label, value: item.count })),
        },
      ],
    };
  }, [previewQuery.data]);

  return (
    <>
      <PageHeader
        title="Population composition studio"
        subtitle="Layer global distributions, conditional overrides, and rule priority into a reusable participant template."
        actions={
          <Space>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedId(null);
                setDraft(defaultDraft);
              }}
            >
              New
            </Button>
            <Button
              icon={<CopyOutlined />}
              disabled={!selectedId}
              onClick={async () => {
                if (!selectedId) return;
                await apiClient.post(`/participant-templates/${selectedId}/clone`);
                message.success("Template cloned");
                queryClient.invalidateQueries({ queryKey: ["templates"] });
              }}
            >
              Clone
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!selectedId}
              loading={deleteMutation.isPending}
              onClick={() => selectedId && deleteMutation.mutate(selectedId)}
            >
              Delete
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </Button>
          </Space>
        }
      />

      <div className="workspace-grid--triple">
        <Panel>
          <Typography.Title level={4}>Templates</Typography.Title>
          <List
            locale={{ emptyText: <Empty description="No templates yet" /> }}
            dataSource={templatesQuery.data ?? []}
            renderItem={(item) => (
              <List.Item
                style={{
                  cursor: "pointer",
                  borderRadius: 16,
                  paddingInline: 12,
                  background: item.id === selectedId ? "rgba(215,185,143,.12)" : "transparent",
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <List.Item.Meta title={item.name} description={`${item.rules.length} rules`} />
              </List.Item>
            )}
          />
        </Panel>

        <Panel>
          <Typography.Title level={4}>Rule editor</Typography.Title>
          <Form layout="vertical">
            <Form.Item label="Template name">
              <Input
                value={draft.template.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    template: { ...current.template, name: event.target.value },
                  }))
                }
              />
            </Form.Item>
            <Form.Item label="Description">
              <Input.TextArea
                rows={2}
                value={draft.template.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    template: { ...current.template, description: event.target.value },
                  }))
                }
              />
            </Form.Item>
            <Space wrap align="start">
              <Form.Item label="Tracked dimensions">
                <Select
                  mode="multiple"
                  style={{ minWidth: 280 }}
                  value={draft.template.dimensions}
                  options={[
                    "region",
                    "country",
                    "continent",
                    "gender",
                    "ageRange",
                    "educationLevel",
                    "occupation",
                    "incomeRange",
                    "interests",
                    "maritalStatus",
                    "customTags",
                  ].map((value) => ({ label: value, value }))}
                  onChange={(dimensions) =>
                    setDraft((current) => ({ ...current, template: { ...current.template, dimensions } }))
                  }
                />
              </Form.Item>
              <Form.Item label="Preview sample size">
                <InputNumber
                  min={50}
                  max={5000}
                  value={draft.template.sampleSizePreview}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      template: { ...current.template, sampleSizePreview: value ?? 300 },
                    }))
                  }
                />
              </Form.Item>
            </Space>
          </Form>
          <RuleBuilder value={draft.rules} onChange={(rules) => setDraft((current) => ({ ...current, rules }))} />
        </Panel>

        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>Distribution preview</Typography.Title>
            {previewOptions ? <SimpleChart option={previewOptions} /> : <Empty description="Save a template to preview" />}
          </Panel>
          <Panel>
            <Typography.Title level={4}>Composition snapshot</Typography.Title>
            {pieOptions ? <SimpleChart option={pieOptions} /> : <Empty description="No preview available" />}
          </Panel>
          <Panel>
            <Typography.Title level={4}>Conflict detector</Typography.Title>
            <List
              locale={{ emptyText: "No conflicts detected" }}
              dataSource={previewQuery.data?.conflicts ?? []}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta title={item.severity.toUpperCase()} description={item.message} />
                </List.Item>
              )}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
