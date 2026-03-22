import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, InputNumber, List, Select, Space, Switch, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  type ConditionExpression,
  getBuiltinParticipantAttributes,
  humanizeParticipantAttributeKey,
  normalizeParticipantAttributeDefinitions,
  normalizeParticipantAttributeKey,
  type LlmProviderConfigDto,
  type ParticipantAttributeDefinitionDto,
  type ParticipantRuleInput,
  type ParticipantTemplateAiGenerateResult,
  type ParticipantTemplateAiGenerateStreamEvent,
  type ParticipantTemplateDto,
} from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { RuleBuilderV2 } from "@/components/forms/RuleBuilderV2";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

type TemplateDraft = {
  template: {
    name: string;
    description?: string;
    attributes: ParticipantAttributeDefinitionDto[];
    sampleSizePreview: number;
  };
  rules: ParticipantRuleInput[];
};

const builtinAttributes = getBuiltinParticipantAttributes();
const builtinAttributeKeys = new Set(builtinAttributes.map((attribute) => attribute.key));
const visibleBuiltinAttributes = builtinAttributes.filter((attribute) => attribute.key !== "noise");

const defaultDraft: TemplateDraft = {
  template: {
    name: "Global consumer baseline",
    description: "Editable synthetic audience with layered rules.",
    attributes: normalizeParticipantAttributeDefinitions([
      ...visibleBuiltinAttributes.filter((attribute) => ["country", "gender", "ageRange", "interests", "incomeRange"].includes(attribute.key)),
    ]),
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

function normalizeGeneratedRules(rules: ParticipantRuleInput[]): ParticipantRuleInput[] {
  return rules.map((rule, index) => {
    const attribute = rule.assignment?.attribute?.trim() || "gender";
    const mode = rule.assignment?.mode ?? "distribution";
    const distribution = Array.isArray(rule.assignment?.distribution) ? rule.assignment.distribution : undefined;

    return {
      name: rule.name || `Rule ${index + 1}`,
      enabled: rule.enabled ?? true,
      priority: typeof rule.priority === "number" ? rule.priority : 100,
      scope: rule.scope,
      assignment: {
        attribute,
        mode,
        fixedValue: rule.assignment?.fixedValue,
        distribution: mode === "distribution" ? (distribution && distribution.length ? distribution : undefined) : undefined,
      },
      note: rule.note,
    };
  });
}

function toDraft(template: ParticipantTemplateDto): TemplateDraft {
  return {
    template: {
      name: template.name,
      description: template.description,
      attributes: normalizeParticipantAttributeDefinitions(template.attributes),
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

function emptyCustomAttribute(index: number): ParticipantAttributeDefinitionDto {
  const key = `custom_attribute_${index}`;
  return {
    key,
    displayName: humanizeParticipantAttributeKey(key),
    description: "",
    valueType: "single",
    presetValues: [],
    builtin: false,
  };
}

function scopeUsesAttribute(scope: ParticipantRuleInput["scope"], attributeKey: string): boolean {
  if (!scope) return false;
  if (scope.type === "leaf") return scope.field === attributeKey;
  return scope.children.some((child: ConditionExpression) => scopeUsesAttribute(child, attributeKey));
}

function remapScopeAttribute(scope: ParticipantRuleInput["scope"], fromKey: string, toKey: string): ParticipantRuleInput["scope"] {
  if (!scope) return scope;
  if (scope.type === "leaf") {
    return scope.field === fromKey ? { ...scope, field: toKey } : scope;
  }
  return {
    ...scope,
    children: scope.children.map((child: ConditionExpression) => remapScopeAttribute(child, fromKey, toKey) as ConditionExpression),
  };
}

export function ParticipantTemplatesPageV2() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(defaultDraft);
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedLlmConfigId, setSelectedLlmConfigId] = useState<string | undefined>();
  const [aiStreamStage, setAiStreamStage] = useState<string>();
  const [aiGeneratedLines, setAiGeneratedLines] = useState(0);
  const [aiRecordStats, setAiRecordStats] = useState({ validated: 0, repaired: 0, skipped: 0 });
  const [aiStreamLogs, setAiStreamLogs] = useState<string[]>([]);

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiClient.get<ParticipantTemplateDto[]>("/participant-templates"),
  });

  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
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

  const generateWithAiMutation = useMutation({
    mutationFn: async () => {
      setAiStreamStage(undefined);
      setAiGeneratedLines(0);
      setAiRecordStats({ validated: 0, repaired: 0, skipped: 0 });
      setAiStreamLogs([]);

      let finalResult: ParticipantTemplateAiGenerateResult | undefined;
      const payload = {
        prompt: aiPrompt,
        attributes: draft.template.attributes,
        llmConfigId: selectedLlmConfigId,
        templateName: draft.template.name,
        templateDescription: draft.template.description,
      };

      const handleEvent = (event: ParticipantTemplateAiGenerateStreamEvent) => {
        if (event.type === "status") {
          setAiStreamStage(event.stage);
          setAiGeneratedLines(event.lines ?? 0);
          setAiStreamLogs((current) => [...current.slice(-7), event.message]);
          return;
        }

        if (event.type === "record") {
          setAiGeneratedLines((current) => Math.max(current, event.index));
          setAiRecordStats((current) => ({ ...current, [event.status]: current[event.status] + 1 }));
          setAiStreamLogs((current) => [...current.slice(-7), event.message ?? `Record ${event.index} ${event.status}`]);
          return;
        }

        if (event.type === "result") {
          finalResult = event.result;
          return;
        }

        throw new Error(event.message);
      };

      await apiClient.streamParticipantTemplateGenerate("/participant-templates/generate-with-ai/stream", JSON.stringify(payload), handleEvent);

      if (!finalResult) {
        throw new Error(t("templates.aiGenerateNoResult"));
      }

      return finalResult;
    },
    onSuccess: (result) => {
      setDraft({
        template: {
          ...result.template,
          attributes: normalizeParticipantAttributeDefinitions(result.template.attributes),
        },
        rules: normalizeGeneratedRules(result.rules),
      });
      message.success(t("templates.aiGenerateSuccess"));
    },
    onError: (error: Error) => message.error(error.message),
  });

  const selectedBuiltinKeys = useMemo(
    () =>
      draft.template.attributes
        .filter((attribute) => builtinAttributeKeys.has(attribute.key))
        .map((attribute) => attribute.key),
    [draft.template.attributes],
  );

  const customAttributes = useMemo(
    () => draft.template.attributes.filter((attribute) => !builtinAttributeKeys.has(attribute.key)),
    [draft.template.attributes],
  );

  const updateAttributes = (updater: (current: ParticipantAttributeDefinitionDto[]) => ParticipantAttributeDefinitionDto[]) => {
    setDraft((current) => ({
      ...current,
      template: {
        ...current.template,
        attributes: normalizeParticipantAttributeDefinitions(updater(current.template.attributes)),
      },
    }));
  };

  const setBuiltinSelection = (nextKeys: string[]) => {
    updateAttributes((current) => {
      const custom = current.filter((attribute) => !builtinAttributeKeys.has(attribute.key));
      const selectedBuiltin = visibleBuiltinAttributes.filter((attribute) => nextKeys.includes(attribute.key));
      return [...selectedBuiltin, ...custom];
    });
  };

  const addCustomAttribute = () => {
    updateAttributes((current) => {
      const nextIndex = current.filter((attribute) => !builtinAttributeKeys.has(attribute.key)).length + 1;
      return [...current, emptyCustomAttribute(nextIndex)];
    });
  };

  const updateCustomAttribute = (attributeKey: string, patch: Partial<ParticipantAttributeDefinitionDto>) => {
    const nextKey = patch.key && patch.key !== attributeKey ? normalizeParticipantAttributeKey(patch.key) : undefined;
    updateAttributes((current) =>
      current.map((attribute) =>
        attribute.key !== attributeKey
          ? attribute
          : {
              ...attribute,
              ...patch,
              key: nextKey ?? attribute.key,
            },
      ),
    );
    if (nextKey && nextKey !== attributeKey) {
      setDraft((current) => ({
        ...current,
        rules: current.rules.map((rule) => ({
          ...rule,
          scope: remapScopeAttribute(rule.scope, attributeKey, nextKey),
          assignment:
            rule.assignment.attribute === attributeKey
              ? { ...rule.assignment, attribute: nextKey }
              : rule.assignment,
        })),
      }));
    }
  };

  const removeCustomAttribute = (attributeKey: string) => {
    updateAttributes((current) => current.filter((attribute) => attribute.key !== attributeKey));
    setDraft((current) => ({
      ...current,
      rules: current.rules.filter(
        (rule) => rule.assignment.attribute !== attributeKey && !scopeUsesAttribute(rule.scope, attributeKey),
      ),
    }));
  };

  const formatAttributeLabel = (attribute: ParticipantAttributeDefinitionDto) => {
    const translationKey = `attributes.${attribute.key}`;
    const translated = t(translationKey);
    return translated === translationKey ? attribute.displayName : translated;
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
            <Button danger icon={<DeleteOutlined />} disabled={!selectedId} loading={deleteMutation.isPending} onClick={() => selectedId && deleteMutation.mutate(selectedId)}>
              {t("templates.delete")}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {t("templates.save")}
            </Button>
          </Space>
        }
      />

      <div className="workspace-grid" style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}>
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

        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>{t("templates.ruleEditor")}</Typography.Title>
            <Form layout="vertical">
              <Form.Item label={t("templates.aiGeneratePrompt")}>
                <Input.TextArea rows={4} value={aiPrompt} placeholder={t("templates.aiGeneratePlaceholder")} onChange={(event) => setAiPrompt(event.target.value)} />
              </Form.Item>
              <Space wrap align="start" style={{ width: "100%" }}>
                <Form.Item label={t("templates.aiGenerateModel")} style={{ minWidth: 260, flex: 1 }}>
                  <Select
                    allowClear
                    placeholder={t("surveys.chooseConfig")}
                    options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                    value={selectedLlmConfigId}
                    onChange={setSelectedLlmConfigId}
                  />
                </Form.Item>
                <Form.Item label=" ">
                  <Button type="primary" loading={generateWithAiMutation.isPending} disabled={!aiPrompt.trim()} onClick={() => generateWithAiMutation.mutate()}>
                    {t("templates.aiGenerateAction")}
                  </Button>
                </Form.Item>
              </Space>
              <div className="subtle-help">{t("templates.aiGenerateHint")}</div>
              {generateWithAiMutation.isPending || aiGeneratedLines > 0 ? (
                <div className="rule-card" style={{ marginTop: 8 }}>
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Space wrap>
                      <Tag color="blue">{t("templates.aiLines", { count: aiGeneratedLines })}</Tag>
                      {aiStreamStage ? <Tag color="gold">{t(`templates.aiStage.${aiStreamStage}`)}</Tag> : null}
                      <Tag>{t("templates.aiValidated", { count: aiRecordStats.validated })}</Tag>
                      <Tag>{t("templates.aiRepaired", { count: aiRecordStats.repaired })}</Tag>
                      <Tag>{t("templates.aiSkipped", { count: aiRecordStats.skipped })}</Tag>
                    </Space>
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      {aiStreamLogs.map((item, index) => (
                        <Typography.Text key={`${index}_${item}`} type="secondary">
                          {item}
                        </Typography.Text>
                      ))}
                    </Space>
                  </Space>
                </div>
              ) : null}
            </Form>
          </Panel>

          <div className="workspace-grid" style={{ gridTemplateColumns: "minmax(360px, 440px) minmax(0, 1fr)" }}>
            <Panel>
              <Form layout="vertical">
                <Form.Item label={t("templates.templateName")}>
                  <Input value={draft.template.name} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, name: event.target.value } }))} />
                </Form.Item>
                <Form.Item label={t("templates.description")}>
                  <Input.TextArea rows={2} value={draft.template.description} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, description: event.target.value } }))} />
                </Form.Item>
                <Form.Item label={t("templates.previewSampleSize")}>
                  <InputNumber min={10} max={5000} style={{ width: "100%" }} value={draft.template.sampleSizePreview} onChange={(value) => setDraft((current) => ({ ...current, template: { ...current.template, sampleSizePreview: value ?? 300 } }))} />
                </Form.Item>

                <Form.Item label={t("templates.trackedDimensions")}>
                  <Select
                    mode="multiple"
                    value={selectedBuiltinKeys}
                    options={visibleBuiltinAttributes.map((attribute) => ({ label: formatAttributeLabel(attribute), value: attribute.key }))}
                    onChange={setBuiltinSelection}
                  />
                  <div className="subtle-help">{t("templates.dimensionHint")}</div>
                </Form.Item>

                <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }}>
                  <Typography.Text strong>{t("templates.customDimension")}</Typography.Text>
                  <Button icon={<PlusOutlined />} onClick={addCustomAttribute}>
                    {t("templates.addDimension")}
                  </Button>
                </Space>

                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  {customAttributes.map((attribute, index) => (
                    <div key={attribute.key} className="rule-card">
                      <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                        <div>
                          <Typography.Text strong>
                            {attribute.displayName || humanizeParticipantAttributeKey(attribute.key)}
                          </Typography.Text>
                          <div className="subtle-help">{attribute.key}</div>
                        </div>
                        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeCustomAttribute(attribute.key)} />
                      </Space>
                      <div className="card-stack" style={{ marginTop: 12 }}>
                        <Input
                          addonBefore={t("templates.customAttributeKey")}
                          value={attribute.key}
                          placeholder={`custom_attribute_${index + 1}`}
                          onChange={(event) => updateCustomAttribute(attribute.key, { key: normalizeParticipantAttributeKey(event.target.value) })}
                        />
                        <Input
                          addonBefore={t("templates.customAttributeDisplayName")}
                          value={attribute.displayName}
                          placeholder={t("templates.customAttributeDisplayNamePlaceholder")}
                          onChange={(event) => updateCustomAttribute(attribute.key, { displayName: event.target.value })}
                        />
                        <Input
                          addonBefore={t("templates.customAttributeDescription")}
                          value={attribute.description}
                          placeholder={t("templates.customAttributeDescriptionPlaceholder")}
                          onChange={(event) => updateCustomAttribute(attribute.key, { description: event.target.value })}
                        />
                        <Select
                          value={attribute.valueType}
                          options={[
                            { label: t("templates.attributeTypeSingle"), value: "single" },
                            { label: t("templates.attributeTypeMulti"), value: "multi" },
                          ]}
                          onChange={(value) => updateCustomAttribute(attribute.key, { valueType: value })}
                        />
                        <Select
                          mode="tags"
                          tokenSeparators={[","]}
                          value={attribute.presetValues.map((item) => item.value)}
                          placeholder={t("templates.presetValuesPlaceholder")}
                          onChange={(values) =>
                            updateCustomAttribute(attribute.key, {
                              presetValues: values.map((value) => ({
                                value: normalizeParticipantAttributeKey(value),
                                label: humanizeParticipantAttributeKey(value),
                              })),
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                  {!customAttributes.length ? (
                    <div className="subtle-help">{t("templates.customAttributeEmpty")}</div>
                  ) : null}
                </Space>
              </Form>
            </Panel>

            <Panel>
              <Space size={[8, 8]} wrap style={{ marginBottom: 12 }}>
                {draft.template.attributes.map((attribute) => (
                  <Tag key={attribute.key} color={builtinAttributeKeys.has(attribute.key) ? "blue" : "default"}>
                    {formatAttributeLabel(attribute)}
                  </Tag>
                ))}
              </Space>
              <RuleBuilderV2
                value={draft.rules}
                attributes={draft.template.attributes}
                onChange={(rules) => setDraft((current) => ({ ...current, rules }))}
              />
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
