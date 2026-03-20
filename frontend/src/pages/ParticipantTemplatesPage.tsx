import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, InputNumber, List, Select, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { ATTRIBUTE_KEYS, type ParticipantRuleInput, type ParticipantTemplateDto, type TemplatePreview } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { SimpleChart } from "@/components/charts/SimpleChart";
import { RuleBuilder } from "@/components/forms/RuleBuilder";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

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

const builtinDimensions = ATTRIBUTE_KEYS.filter((item) => item !== "noise");

function normalizeDimensions(dimensions: string[]) {
  return Array.from(
    new Set(
      dimensions
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

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
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(defaultDraft);
  const [newDimension, setNewDimension] = useState("");

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
      message.success(selectedId ? t("templates.templateUpdated") : t("templates.templateCreated"));
      setSelectedId(result.id);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template-preview", result.id] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/participant-templates/${id}`),
    onSuccess: () => {
      message.success(t("templates.templateDeleted"));
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
        text: `${t(`attributes.${name}`)} distribution`,
        left: "center",
        textStyle: { color: "#f8fafc", fontFamily: "Fraunces, serif" },
      },
      tooltip: {},
      xAxis: { type: "category", data: items.map((item) => item.label), axisLabel: { color: "#f8fafc" } },
      yAxis: { type: "value", axisLabel: { color: "#f8fafc" } },
      series: [
        {
          type: "bar",
          data: items.map((item) => item.count),
          itemStyle: { color: "#3b82f6", borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [previewQuery.data, t]);

  const pieOptions = useMemo(() => {
    const distributions = previewQuery.data?.attributeDistributions ?? {};
    const firstEntry = Object.entries(distributions)[1] ?? Object.entries(distributions)[0];
    if (!firstEntry) return null;
    const [name, items] = firstEntry;
    return {
      title: {
        text: `${t(`attributes.${name}`)} share`,
        left: "center",
        textStyle: { color: "#f8fafc", fontFamily: "Fraunces, serif" },
      },
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#f8fafc" } },
      series: [
        {
          type: "pie",
          radius: ["42%", "72%"],
          data: items.map((item) => ({ name: item.label, value: item.count })),
        },
      ],
    };
  }, [previewQuery.data, t]);

  const dimensionOptions = useMemo(
    () =>
      normalizeDimensions([...builtinDimensions, ...draft.template.dimensions]).map((value) => ({
        label: t(`attributes.${value}`),
        value,
      })),
    [draft.template.dimensions, t],
  );

  const addDimension = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    setDraft((current) => ({
      ...current,
      template: {
        ...current.template,
        dimensions: normalizeDimensions([...current.template.dimensions, value]),
      },
    }));
    setNewDimension("");
  };

  return (
    <>
      <PageHeader
        title={t("templates.title")}
        subtitle={t("templates.subtitle")}
        actions={
          <Space>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedId(null);
                setDraft(defaultDraft);
              }}
            >
              {t("templates.new")}
            </Button>
            <Button
              icon={<CopyOutlined />}
              disabled={!selectedId}
              onClick={async () => {
                if (!selectedId) return;
                await apiClient.post(`/participant-templates/${selectedId}/clone`);
                message.success(t("templates.templateCloned"));
                queryClient.invalidateQueries({ queryKey: ["templates"] });
              }}
            >
              {t("templates.clone")}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!selectedId}
              loading={deleteMutation.isPending}
              onClick={() => selectedId && deleteMutation.mutate(selectedId)}
            >
              {t("templates.delete")}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {t("templates.save")}
            </Button>
          </Space>
        }
      />

      <div className="workspace-grid--triple">
        <Panel>
          <Typography.Title level={4}>{t("templates.templates")}</Typography.Title>
          <List
            locale={{ emptyText: <Empty description={t("templates.noTemplates")} /> }}
            dataSource={templatesQuery.data ?? []}
            renderItem={(item) => (
              <List.Item
                style={{
                  cursor: "pointer",
                  borderRadius: 16,
                  paddingInline: 12,
                  background: item.id === selectedId ? "rgba(59,130,246,.12)" : "transparent",
                  border: item.id === selectedId ? "1px solid rgba(59,130,246,.28)" : "1px solid transparent",
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <List.Item.Meta title={item.name} description={t("templates.rulesCount", { count: item.rules.length })} />
              </List.Item>
            )}
          />
        </Panel>

        <Panel>
          <Typography.Title level={4}>{t("templates.ruleEditor")}</Typography.Title>
          <Form layout="vertical">
            <Form.Item label={t("templates.templateName")}>
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
            <Form.Item label={t("templates.description")}>
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
            <Space wrap align="start" style={{ width: "100%" }}>
              <Form.Item label={t("templates.trackedDimensions")} style={{ minWidth: 320, flex: 1 }}>
                <Select
                  mode="tags"
                  tokenSeparators={[","]}
                  style={{ minWidth: 280 }}
                  value={draft.template.dimensions}
                  options={dimensionOptions}
                  onChange={(dimensions) =>
                    setDraft((current) => ({
                      ...current,
                      template: { ...current.template, dimensions: normalizeDimensions(dimensions) },
                    }))
                  }
                />
              </Form.Item>
              <Form.Item label={t("templates.previewSampleSize")}>
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
            <Form.Item label={t("templates.customDimension")}>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={newDimension}
                  placeholder={t("templates.customDimensionPlaceholder")}
                  onChange={(event) => setNewDimension(event.target.value)}
                  onPressEnter={() => addDimension(newDimension)}
                />
                <Button onClick={() => addDimension(newDimension)}>{t("templates.addDimension")}</Button>
              </Space.Compact>
              <div className="subtle-help">{t("templates.dimensionHint")}</div>
            </Form.Item>
            <Space size={[8, 8]} wrap>
              {draft.template.dimensions.map((dimension) => (
                <Tag key={dimension} color={builtinDimensions.includes(dimension as (typeof builtinDimensions)[number]) ? "blue" : "default"}>
                  {t(`attributes.${dimension}`)}
                </Tag>
              ))}
            </Space>
          </Form>
          <RuleBuilder
            value={draft.rules}
            attributeOptions={draft.template.dimensions}
            onChange={(rules) => setDraft((current) => ({ ...current, rules }))}
          />
        </Panel>

        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>{t("templates.distributionPreview")}</Typography.Title>
            {previewOptions ? <SimpleChart option={previewOptions} /> : <Empty description={t("templates.previewSaveHint")} />}
          </Panel>
          <Panel>
            <Typography.Title level={4}>{t("templates.compositionSnapshot")}</Typography.Title>
            {pieOptions ? <SimpleChart option={pieOptions} /> : <Empty description={t("templates.previewUnavailable")} />}
          </Panel>
          <Panel>
            <Typography.Title level={4}>{t("templates.conflictDetector")}</Typography.Title>
            <List
              locale={{ emptyText: t("templates.noConflicts") }}
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
