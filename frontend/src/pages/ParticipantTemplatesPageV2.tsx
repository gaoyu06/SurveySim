import { CopyOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Collapse, Drawer, Empty, Form, Grid, Input, InputNumber, List, Select, Space, Switch, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  type ConditionExpression,
  getBuiltinParticipantAttributes,
  humanizeParticipantAttributeKey,
  normalizeParticipantAttributeDefinitions,
  normalizeParticipantAttributeKey,
  type LlmProviderConfigDto,
  type ParticipantArchetypeProfileDto,
  type ParticipantAttributeDefinitionDto,
  type ParticipantRandomConfigDto,
  type ParticipantRuleInput,
  type ParticipantTemplateAiGenerateResult,
  type ParticipantTemplateAiGenerateStreamEvent,
  type ParticipantTemplateDto,
} from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { FieldLabel, HelpCallout } from "@/components/Help";
import { RuleBuilderV2 } from "@/components/forms/RuleBuilderV2";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";

type TemplateDraft = {
  template: {
    name: string;
    description?: string;
    archetypeProfile?: ParticipantArchetypeProfileDto;
    attributes: ParticipantAttributeDefinitionDto[];
    randomConfig: ParticipantRandomConfigDto;
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
    archetypeProfile: {
      label: "General consumers",
      description: "Broad synthetic audience for exploratory content tasks.",
      scenarioContext: "consumer feedback",
      seedTags: ["consumer", "general_population"],
      seedPrompt: "A broad consumer population with mild differences in motivation, familiarity, and expression.",
    },
    attributes: normalizeParticipantAttributeDefinitions([
      ...visibleBuiltinAttributes.filter((attribute) => ["country", "gender", "ageRange", "interests", "incomeRange", "customTags"].includes(attribute.key)),
    ]),
    randomConfig: {
      randomnessLevel: "medium",
      noiseProfile: "balanced",
    },
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
      archetypeProfile: template.archetypeProfile,
      attributes: normalizeParticipantAttributeDefinitions(template.attributes),
      randomConfig: template.randomConfig,
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
  const screens = Grid.useBreakpoint();
  const currentUser = authStore((state) => state.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(defaultDraft);
  const [onlyOwnData, setOnlyOwnData] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedLlmConfigId, setSelectedLlmConfigId] = useState<string | undefined>();
  const [aiStreamStage, setAiStreamStage] = useState<string>();
  const [aiGeneratedLines, setAiGeneratedLines] = useState(0);
  const [aiRecordStats, setAiRecordStats] = useState({ validated: 0, repaired: 0, skipped: 0 });
  const [aiStreamLogs, setAiStreamLogs] = useState<string[]>([]);

  const templatesQuery = useQuery({
    queryKey: ["templates", currentUser?.role, onlyOwnData],
    queryFn: () => apiClient.get<ParticipantTemplateDto[]>(`/participant-templates${currentUser?.role === "admin" && !onlyOwnData ? "?scope=all" : ""}`),
  });

  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((item) => item.id === selectedId) ?? null,
    [templatesQuery.data, selectedId],
  );
  const isReadonlySelection = Boolean(selectedId && selectedTemplate && selectedTemplate.isOwnedByCurrentUser === false);

  useEffect(() => {
    if (!selectedTemplate) {
      setDraft(defaultDraft);
      return;
    }
    setDraft(toDraft(selectedTemplate));
  }, [selectedTemplate]);

  const openCreateDrawer = () => {
    setSelectedId(null);
    setDraft(defaultDraft);
    setAiPrompt("");
    setSelectedLlmConfigId(undefined);
    setAiStreamStage(undefined);
    setAiGeneratedLines(0);
    setAiRecordStats({ validated: 0, repaired: 0, skipped: 0 });
    setAiStreamLogs([]);
    setDrawerOpen(true);
  };

  const openTemplateDrawer = (templateId: string) => {
    setSelectedId(templateId);
    setAiPrompt("");
    setSelectedLlmConfigId(undefined);
    setAiStreamStage(undefined);
    setAiGeneratedLines(0);
    setAiRecordStats({ validated: 0, repaired: 0, skipped: 0 });
    setAiStreamLogs([]);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedId(null);
    setDraft(defaultDraft);
    setAiPrompt("");
    setSelectedLlmConfigId(undefined);
    setAiStreamStage(undefined);
    setAiGeneratedLines(0);
    setAiRecordStats({ validated: 0, repaired: 0, skipped: 0 });
    setAiStreamLogs([]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      selectedId
        ? apiClient.put<ParticipantTemplateDto>(`/participant-templates/${selectedId}`, draft)
        : apiClient.post<ParticipantTemplateDto>("/participant-templates", draft),
    onSuccess: () => {
      message.success(selectedId ? t("templates.templateUpdated") : t("templates.templateCreated"));
      closeDrawer();
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/participant-templates/${id}`),
    onSuccess: () => {
      message.success(t("templates.templateDeleted"));
      closeDrawer();
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
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
        archetypeProfile: draft.template.archetypeProfile,
        attributes: draft.template.attributes,
        randomConfig: draft.template.randomConfig,
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
    () => draft.template.attributes.filter((attribute) => builtinAttributeKeys.has(attribute.key)).map((attribute) => attribute.key),
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
          assignment: rule.assignment.attribute === attributeKey ? { ...rule.assignment, attribute: nextKey } : rule.assignment,
        })),
      }));
    }
  };

  const removeCustomAttribute = (attributeKey: string) => {
    updateAttributes((current) => current.filter((attribute) => attribute.key !== attributeKey));
    setDraft((current) => ({
      ...current,
      rules: current.rules.filter((rule) => rule.assignment.attribute !== attributeKey && !scopeUsesAttribute(rule.scope, attributeKey)),
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
          <Space wrap>
            {currentUser?.role === "admin" ? (
              <Space wrap>
                <span>{t("common.onlyMine")}</span>
                <Switch checked={onlyOwnData} onChange={setOnlyOwnData} />
              </Space>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              {t("templates.new")}
            </Button>
          </Space>
        }
      />
      <HelpCallout
        title={t("templates.guideTitle")}
        description={t("templates.guideDescription")}
        items={[t("templates.guideStep1"), t("templates.guideStep2"), t("templates.guideStep3")]}
      />

      <Panel>
        <Typography.Title level={4}>{t("templates.templates")}</Typography.Title>
        <List
          locale={{ emptyText: <Empty description={t("templates.noTemplates")} /> }}
          dataSource={templatesQuery.data ?? []}
          renderItem={(item) => (
            <List.Item
              className="responsive-list-item"
              actions={[
                <div key="actions" className="responsive-list-actions">
                  <Button size="small" icon={item.isOwnedByCurrentUser ? undefined : <EyeOutlined />} onClick={() => openTemplateDrawer(item.id)}>
                    {item.isOwnedByCurrentUser ? t("common.edit") : t("common.preview")}
                  </Button>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    disabled={!item.isOwnedByCurrentUser}
                    onClick={async () => {
                      await apiClient.post(`/participant-templates/${item.id}/clone`);
                      message.success(t("templates.templateCloned"));
                      void queryClient.invalidateQueries({ queryKey: ["templates"] });
                    }}
                  >
                    {t("templates.clone")}
                  </Button>
                  <Button size="small" key="delete" danger icon={<DeleteOutlined />} disabled={!item.isOwnedByCurrentUser} loading={deleteMutation.isPending && deleteMutation.variables === item.id} onClick={() => deleteMutation.mutate(item.id)}>
                    {t("templates.delete")}
                  </Button>
                </div>,
              ]}
            >
              <List.Item.Meta
                title={item.name}
                description={
                  <Space direction="vertical" size={4}>
                    <Typography.Text type="secondary">{item.description || t("common.none")}</Typography.Text>
                    <Typography.Text type="secondary">
                      {t("templates.rulesCount", { count: item.rules.length })}
                      {item.ownerEmail ? ` · ${t("common.owner")}: ${item.ownerEmail}` : ""}
                    </Typography.Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Panel>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        width={screens.lg ? 1280 : "100%"}
        title={selectedId ? (isReadonlySelection ? `${t("common.preview")} · ${t("templates.title")}` : `${t("common.edit")} · ${t("templates.title")}`) : `${t("templates.new")} · ${t("templates.title")}`}
        extra={
          isReadonlySelection ? undefined : (
            <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {t("templates.save")}
            </Button>
          )
        }
      >
        <div className="card-stack">
          <Panel>
            <Typography.Title level={4}>{t("templates.aiGenerateAction")}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              {t("templates.quickCreateDescription")}
            </Typography.Paragraph>
            <Form layout="vertical" disabled={isReadonlySelection}>
              <Form.Item label={<FieldLabel label={t("templates.aiGeneratePrompt")} hint={t("templates.aiGeneratePromptHint")} />}>
                <Input.TextArea rows={4} value={aiPrompt} placeholder={t("templates.aiGeneratePlaceholder")} onChange={(event) => setAiPrompt(event.target.value)} />
              </Form.Item>
              <Space wrap align="start" style={{ width: "100%" }}>
                <Form.Item label={<FieldLabel label={t("templates.aiGenerateModel")} hint={t("templates.aiGenerateModelHint")} />} style={{ minWidth: 260, flex: 1 }}>
                  <Select allowClear placeholder={t("surveys.chooseConfig")} options={(llmConfigsQuery.data ?? []).map((item) => ({ label: item.isOwnedByCurrentUser ? item.name : `${item.name} · ${item.ownerEmail}`, value: item.id }))} value={selectedLlmConfigId} onChange={setSelectedLlmConfigId} />
                </Form.Item>
                <Form.Item label=" ">
                  <Button type="primary" loading={generateWithAiMutation.isPending} disabled={!aiPrompt.trim() || isReadonlySelection} onClick={() => generateWithAiMutation.mutate()}>
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

          <Panel>
            <Typography.Title level={4}>{t("templates.essentialSetup")}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              {t("templates.essentialSetupDescription")}
            </Typography.Paragraph>
            <Form layout="vertical" disabled={isReadonlySelection}>
              {isReadonlySelection ? <div className="subtle-help">{t("common.readonlyForeignData")}</div> : null}
              <div className="responsive-form-inline">
                <Form.Item label={<FieldLabel label={t("templates.templateName")} hint={t("templates.templateNameHint")} />}>
                  <Input value={draft.template.name} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, name: event.target.value } }))} />
                </Form.Item>
                <Form.Item label={<FieldLabel label={t("templates.previewSampleSize")} hint={t("templates.previewSampleSizeHint")} />}>
                  <InputNumber min={10} max={5000} style={{ width: "100%" }} value={draft.template.sampleSizePreview} onChange={(value) => setDraft((current) => ({ ...current, template: { ...current.template, sampleSizePreview: value ?? 300 } }))} />
                </Form.Item>
              </div>
              <Form.Item label={<FieldLabel label={t("templates.description")} hint={t("templates.descriptionHint")} />}>
                <Input.TextArea rows={2} value={draft.template.description} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, description: event.target.value } }))} />
              </Form.Item>
              <Form.Item label={<FieldLabel label={t("templates.trackedDimensions")} hint={t("templates.trackedDimensionsHint")} />}>
                <Select mode="multiple" value={selectedBuiltinKeys} options={visibleBuiltinAttributes.map((attribute) => ({ label: formatAttributeLabel(attribute), value: attribute.key }))} onChange={setBuiltinSelection} />
                <div className="subtle-help">{t("templates.dimensionHint")}</div>
              </Form.Item>
            </Form>
          </Panel>

          <Panel>
            <Space size={[8, 8]} wrap>
              {draft.template.attributes.map((attribute) => (
                <Tag key={attribute.key} color={builtinAttributeKeys.has(attribute.key) ? "blue" : "default"}>
                  {formatAttributeLabel(attribute)}
                </Tag>
              ))}
              {draft.template.archetypeProfile?.label ? <Tag color="gold">{draft.template.archetypeProfile.label}</Tag> : null}
              <Tag>{`random:${draft.template.randomConfig.randomnessLevel}`}</Tag>
              <Tag>{`noise:${draft.template.randomConfig.noiseProfile}`}</Tag>
            </Space>
          </Panel>

          <Collapse
            className="workspace-collapse"
            items={[
              {
                key: "profile",
                label: t("templates.advancedProfile"),
                children: (
                  <Form layout="vertical" disabled={isReadonlySelection}>
                    <Form.Item label={<FieldLabel label={t("templates.archetypeLabel")} hint={t("templates.archetypeLabelHint")} />}>
                      <Input value={draft.template.archetypeProfile?.label} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, archetypeProfile: { ...current.template.archetypeProfile, label: event.target.value, seedTags: current.template.archetypeProfile?.seedTags ?? [] } } }))} />
                    </Form.Item>
                    <Form.Item label={<FieldLabel label={t("templates.archetypeDescription")} hint={t("templates.archetypeDescriptionHint")} />}>
                      <Input.TextArea rows={2} value={draft.template.archetypeProfile?.description} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, archetypeProfile: { ...current.template.archetypeProfile, label: current.template.archetypeProfile?.label ?? "", description: event.target.value, seedTags: current.template.archetypeProfile?.seedTags ?? [] } } }))} />
                    </Form.Item>
                    <Form.Item label={<FieldLabel label={t("templates.scenarioContext")} hint={t("templates.scenarioContextHint")} />}>
                      <Input value={draft.template.archetypeProfile?.scenarioContext} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, archetypeProfile: { ...current.template.archetypeProfile, label: current.template.archetypeProfile?.label ?? "", scenarioContext: event.target.value, seedTags: current.template.archetypeProfile?.seedTags ?? [] } } }))} />
                    </Form.Item>
                    <Form.Item label={<FieldLabel label={t("templates.archetypeTags")} hint={t("templates.archetypeTagsHint")} />}>
                      <Select mode="tags" tokenSeparators={[","]} value={draft.template.archetypeProfile?.seedTags ?? []} onChange={(values) => setDraft((current) => ({ ...current, template: { ...current.template, archetypeProfile: { ...current.template.archetypeProfile, label: current.template.archetypeProfile?.label ?? "", seedTags: values } } }))} />
                    </Form.Item>
                    <Form.Item label={<FieldLabel label={t("templates.archetypePrompt")} hint={t("templates.archetypePromptHint")} />}>
                      <Input.TextArea rows={3} value={draft.template.archetypeProfile?.seedPrompt} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, archetypeProfile: { ...current.template.archetypeProfile, label: current.template.archetypeProfile?.label ?? "", seedTags: current.template.archetypeProfile?.seedTags ?? [], seedPrompt: event.target.value } } }))} />
                    </Form.Item>
                    <div className="responsive-form-inline">
                      <Form.Item label={<FieldLabel label={t("templates.randomSeed")} hint={t("templates.randomSeedHint")} />}>
                        <Input value={draft.template.randomConfig.seed} onChange={(event) => setDraft((current) => ({ ...current, template: { ...current.template, randomConfig: { ...current.template.randomConfig, seed: event.target.value || undefined } } }))} />
                      </Form.Item>
                      <Form.Item label={<FieldLabel label={t("templates.randomnessLevel")} hint={t("templates.randomnessLevelHint")} />}>
                        <Select value={draft.template.randomConfig.randomnessLevel} options={[{ label: "Low", value: "low" }, { label: "Medium", value: "medium" }, { label: "High", value: "high" }]} onChange={(value) => setDraft((current) => ({ ...current, template: { ...current.template, randomConfig: { ...current.template.randomConfig, randomnessLevel: value } } }))} />
                      </Form.Item>
                      <Form.Item label={<FieldLabel label={t("templates.noiseProfile")} hint={t("templates.noiseProfileHint")} />}>
                        <Select value={draft.template.randomConfig.noiseProfile} options={[{ label: "Conservative", value: "conservative" }, { label: "Balanced", value: "balanced" }, { label: "Expressive", value: "expressive" }]} onChange={(value) => setDraft((current) => ({ ...current, template: { ...current.template, randomConfig: { ...current.template.randomConfig, noiseProfile: value } } }))} />
                      </Form.Item>
                    </div>
                  </Form>
                ),
              },
              {
                key: "attributes",
                label: t("templates.advancedAttributes"),
                children: (
                  <Form layout="vertical" disabled={isReadonlySelection}>
                    <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }}>
                      <Typography.Text strong>{t("templates.customDimension")}</Typography.Text>
                      <Button icon={<PlusOutlined />} disabled={isReadonlySelection} onClick={addCustomAttribute}>{t("templates.addDimension")}</Button>
                    </Space>
                    <Space direction="vertical" style={{ width: "100%" }} size={10}>
                      {customAttributes.map((attribute, index) => (
                        <div key={attribute.key} className="rule-card">
                          <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                            <div>
                              <Typography.Text strong>{attribute.displayName || humanizeParticipantAttributeKey(attribute.key)}</Typography.Text>
                              <div className="subtle-help">{attribute.key}</div>
                            </div>
                            <Button danger type="text" icon={<DeleteOutlined />} disabled={isReadonlySelection} onClick={() => removeCustomAttribute(attribute.key)} />
                          </Space>
                          <div className="card-stack" style={{ marginTop: 12 }}>
                            <Input addonBefore={t("templates.customAttributeKey")} value={attribute.key} placeholder={`custom_attribute_${index + 1}`} onChange={(event) => updateCustomAttribute(attribute.key, { key: normalizeParticipantAttributeKey(event.target.value) })} />
                            <Input addonBefore={t("templates.customAttributeDisplayName")} value={attribute.displayName} placeholder={t("templates.customAttributeDisplayNamePlaceholder")} onChange={(event) => updateCustomAttribute(attribute.key, { displayName: event.target.value })} />
                            <Input addonBefore={t("templates.customAttributeDescription")} value={attribute.description} placeholder={t("templates.customAttributeDescriptionPlaceholder")} onChange={(event) => updateCustomAttribute(attribute.key, { description: event.target.value })} />
                            <Select value={attribute.valueType} options={[{ label: t("templates.attributeTypeSingle"), value: "single" }, { label: t("templates.attributeTypeMulti"), value: "multi" }]} onChange={(value) => updateCustomAttribute(attribute.key, { valueType: value })} />
                            <Select mode="tags" tokenSeparators={[","]} value={attribute.presetValues.map((item) => item.value)} placeholder={t("templates.presetValuesPlaceholder")} onChange={(values) => updateCustomAttribute(attribute.key, { presetValues: values.map((value) => ({ value: normalizeParticipantAttributeKey(value), label: humanizeParticipantAttributeKey(value) })) })} />
                          </div>
                        </div>
                      ))}
                      {!customAttributes.length ? <div className="subtle-help">{t("templates.customAttributeEmpty")}</div> : null}
                    </Space>
                  </Form>
                ),
              },
              {
                key: "rules",
                label: t("templates.advancedRules"),
                children: (
                  <RuleBuilderV2
                    value={draft.rules}
                    attributes={draft.template.attributes}
                    disabled={isReadonlySelection}
                    onChange={(rules) => setDraft((current) => ({ ...current, rules }))}
                  />
                ),
              },
            ]}
          />
        </div>
      </Drawer>
    </>
  );
}
