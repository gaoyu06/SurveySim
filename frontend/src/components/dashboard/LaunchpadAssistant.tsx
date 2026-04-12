import { CheckCircleOutlined, MessageOutlined, ReloadOutlined, RocketOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { getBuiltinParticipantAttributes, type LlmProviderConfigDto, type ParticipantTemplateAiGenerateResult, type SurveyDraft } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

type AssistantStep = "brief" | "scenario" | "audience" | "length" | "participants" | "tone" | "model" | "confirm" | "done";

type AssistantOption = {
  label: string;
  value: string;
};

type AssistantMessage = {
  id: string;
  role: "assistant" | "user" | "status";
  content: string;
  options?: AssistantOption[];
  tone?: "default" | "success" | "warning";
};

type AssistantDraft = {
  brief: string;
  scenario: string;
  audience: string;
  length: string;
  participants: string;
  tone: string;
  llmConfigId?: string;
};

type CreationResult = {
  surveyId: string;
  surveyTitle: string;
  templateId: string;
  templateName: string;
};

const DEFAULT_MODEL_VALUE = "__default__";

function nextMessageId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildSurveyBrief(
  draft: AssistantDraft,
  labels: Record<"scenario" | "audience" | "length" | "participants" | "tone" | "model", string>,
) {
  return [
    `Please create a complete questionnaire draft for SurveySim based on the following brief.`,
    `Core topic: ${draft.brief}`,
    `Research scenario: ${labels.scenario}`,
    `Target respondents: ${labels.audience}`,
    `Desired survey length: ${labels.length}`,
    `Expected participant volume for later simulation: ${labels.participants}`,
    `Preferred response tone: ${labels.tone}`,
    "Output should feel ready for a first usable draft.",
    "Please include:",
    "- one concise survey title",
    "- one short respondent instruction block",
    "- a balanced mix of single choice, rating, and open text questions",
    "- clear section structure when it helps readability",
    "- an ending open text question for extra suggestions or opinions",
    "Keep the wording natural and directly usable in a real questionnaire.",
  ].join("\n");
}

function buildParticipantPrompt(
  draft: AssistantDraft,
  labels: Record<"scenario" | "audience" | "length" | "participants" | "tone" | "model", string>,
) {
  return [
    `Create a reusable participant template for a SurveySim project.`,
    `Research topic: ${draft.brief}`,
    `Scenario: ${labels.scenario}`,
    `Target audience: ${labels.audience}`,
    `Expected survey length: ${labels.length}`,
    `Planned simulation scale: ${labels.participants}`,
    `Preferred answer style: ${labels.tone}`,
    "Please keep the rules compact, practical, and high-signal.",
    "Use only the attributes that matter for this study and define custom attributes only when clearly helpful.",
    "Make the template ready to save and reuse without requiring lots of manual cleanup.",
  ].join("\n");
}

export function LaunchpadAssistant({ llmConfigs }: { llmConfigs: LlmProviderConfigDto[] }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [step, setStep] = useState<AssistantStep>("brief");
  const [composerValue, setComposerValue] = useState("");
  const [result, setResult] = useState<CreationResult | null>(null);
  const [draft, setDraft] = useState<AssistantDraft>({
    brief: "",
    scenario: "",
    audience: "",
    length: "",
    participants: "",
    tone: "",
    llmConfigId: undefined,
  });
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: nextMessageId(),
      role: "assistant",
      content: t("dashboard.assistantAskBrief"),
    },
  ]);

  const scenarioOptions = useMemo<AssistantOption[]>(
    () => [
      { value: "product_feedback", label: t("dashboard.assistant.optionScenarioProduct") },
      { value: "content_testing", label: t("dashboard.assistant.optionScenarioContent") },
      { value: "brand_campaign", label: t("dashboard.assistant.optionScenarioCampaign") },
      { value: "user_opinion", label: t("dashboard.assistant.optionScenarioOpinion") },
    ],
    [t],
  );

  const audienceOptions = useMemo<AssistantOption[]>(
    () => [
      { value: "general_consumers", label: t("dashboard.assistant.optionAudienceConsumers") },
      { value: "existing_customers", label: t("dashboard.assistant.optionAudienceCustomers") },
      { value: "students", label: t("dashboard.assistant.optionAudienceStudents") },
      { value: "white_collar", label: t("dashboard.assistant.optionAudienceWhiteCollar") },
      { value: "overseas_users", label: t("dashboard.assistant.optionAudienceOverseas") },
    ],
    [t],
  );

  const lengthOptions = useMemo<AssistantOption[]>(
    () => [
      { value: "quick_6", label: t("dashboard.assistant.optionLengthQuick") },
      { value: "standard_10", label: t("dashboard.assistant.optionLengthStandard") },
      { value: "deep_15", label: t("dashboard.assistant.optionLengthDeep") },
    ],
    [t],
  );

  const participantOptions = useMemo<AssistantOption[]>(
    () => [
      { value: "50", label: t("dashboard.assistant.optionParticipants50") },
      { value: "120", label: t("dashboard.assistant.optionParticipants120") },
      { value: "300", label: t("dashboard.assistant.optionParticipants300") },
    ],
    [t],
  );

  const toneOptions = useMemo<AssistantOption[]>(
    () => [
      { value: "neutral_professional", label: t("dashboard.assistant.optionToneProfessional") },
      { value: "friendly_conversational", label: t("dashboard.assistant.optionToneFriendly") },
      { value: "sharp_decisive", label: t("dashboard.assistant.optionToneSharp") },
    ],
    [t],
  );

  const modelOptions = useMemo<AssistantOption[]>(
    () => [
      { value: DEFAULT_MODEL_VALUE, label: t("dashboard.assistant.optionModelDefault") },
      ...llmConfigs.map((item) => ({
        value: item.id,
        label: item.isOwnedByCurrentUser ? item.name : `${item.name} · ${item.ownerEmail}`,
      })),
    ],
    [llmConfigs, t],
  );

  const optionCatalog = useMemo(
    () => ({
      scenario: scenarioOptions,
      audience: audienceOptions,
      length: lengthOptions,
      participants: participantOptions,
      tone: toneOptions,
      model: modelOptions,
    }),
    [audienceOptions, lengthOptions, modelOptions, participantOptions, scenarioOptions, toneOptions],
  );

  const examplePrompts = useMemo(
    () => [
      t("dashboard.assistant.example1"),
      t("dashboard.assistant.example2"),
      t("dashboard.assistant.example3"),
    ],
    [t],
  );

  const activeOptions = useMemo<AssistantOption[] | undefined>(() => {
    if (step === "scenario") return scenarioOptions;
    if (step === "audience") return audienceOptions;
    if (step === "length") return lengthOptions;
    if (step === "participants") return participantOptions;
    if (step === "tone") return toneOptions;
    if (step === "model") return modelOptions;
    if (step === "confirm") {
      return [
        { value: "confirm", label: t("dashboard.assistantConfirmAction") },
        { value: "restart", label: t("dashboard.assistantRestartAction") },
      ];
    }
    return undefined;
  }, [audienceOptions, lengthOptions, modelOptions, participantOptions, scenarioOptions, step, t, toneOptions]);

  const labelMaps = useMemo(
    () => ({
      scenario: new Map(optionCatalog.scenario.map((item) => [item.value, item.label])),
      audience: new Map(optionCatalog.audience.map((item) => [item.value, item.label])),
      length: new Map(optionCatalog.length.map((item) => [item.value, item.label])),
      participants: new Map(optionCatalog.participants.map((item) => [item.value, item.label])),
      tone: new Map(optionCatalog.tone.map((item) => [item.value, item.label])),
      model: new Map(optionCatalog.model.map((item) => [item.value, item.label])),
    }),
    [optionCatalog],
  );

  const resolveLabel = (kind: keyof typeof labelMaps, value: string) => labelMaps[kind].get(value) ?? value;

  const summaryLabels = useMemo(
    () => ({
      scenario: draft.scenario ? resolveLabel("scenario", draft.scenario) : t("common.none"),
      audience: draft.audience ? resolveLabel("audience", draft.audience) : t("common.none"),
      length: draft.length ? resolveLabel("length", draft.length) : t("common.none"),
      participants: draft.participants ? resolveLabel("participants", draft.participants) : t("common.none"),
      tone: draft.tone ? resolveLabel("tone", draft.tone) : t("common.none"),
      model: resolveLabel("model", draft.llmConfigId ?? DEFAULT_MODEL_VALUE),
    }),
    [draft.audience, draft.length, draft.llmConfigId, draft.participants, draft.scenario, draft.tone, t],
  );

  const askNext = (nextStep: AssistantStep) => {
    setStep(nextStep);

    if (nextStep === "scenario") {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskScenario"), options: scenarioOptions },
      ]);
      return;
    }

    if (nextStep === "audience") {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskAudience"), options: audienceOptions },
      ]);
      return;
    }

    if (nextStep === "length") {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskLength"), options: lengthOptions },
      ]);
      return;
    }

    if (nextStep === "participants") {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskParticipants"), options: participantOptions },
      ]);
      return;
    }

    if (nextStep === "tone") {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskTone"), options: toneOptions },
      ]);
      return;
    }

    if (nextStep === "model") {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskModel"), options: modelOptions },
      ]);
      return;
    }

    if (nextStep === "confirm") {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: t("dashboard.assistantAskConfirm", {
            scenario: summaryLabels.scenario,
            audience: summaryLabels.audience,
            length: summaryLabels.length,
            participants: summaryLabels.participants,
            tone: summaryLabels.tone,
          }),
          options: [
            { value: "confirm", label: t("dashboard.assistantConfirmAction") },
            { value: "restart", label: t("dashboard.assistantRestartAction") },
          ],
        },
      ]);
    }
  };

  const resetConversation = () => {
    setStep("brief");
    setComposerValue("");
    setResult(null);
    setDraft({
      brief: "",
      scenario: "",
      audience: "",
      length: "",
      participants: "",
      tone: "",
      llmConfigId: undefined,
    });
    setMessages([{ id: nextMessageId(), role: "assistant", content: t("dashboard.assistantAskBrief") }]);
  };

  const creationMutation = useMutation({
    mutationFn: async () => {
      const labels = {
        scenario: summaryLabels.scenario,
        audience: summaryLabels.audience,
        length: summaryLabels.length,
        participants: summaryLabels.participants,
        tone: summaryLabels.tone,
        model: summaryLabels.model,
      };

      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "status", content: t("dashboard.assistantCreatingParticipants") },
      ]);

      const participantDraft = await apiClient.post<ParticipantTemplateAiGenerateResult>("/participant-templates/generate-with-ai", {
        prompt: buildParticipantPrompt(draft, labels),
        attributes: getBuiltinParticipantAttributes().filter((item) => item.key !== "noise"),
        randomConfig: {
          randomnessLevel: draft.tone === "sharp_decisive" ? "high" : "medium",
          noiseProfile: draft.tone === "neutral_professional" ? "conservative" : "balanced",
        },
        llmConfigId: draft.llmConfigId,
      });

      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "status", content: t("dashboard.assistantSavingTemplate") },
      ]);

      const savedTemplate = await apiClient.post<{ id: string; name: string }>("/participant-templates", {
        template: participantDraft.template,
        rules: participantDraft.rules,
      });

      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "status", content: t("dashboard.assistantCreatingSurvey") },
      ]);

      const surveyDraft = await apiClient.post<SurveyDraft>("/content-tasks/import", {
        rawText: buildSurveyBrief(draft, labels),
        llmConfigId: draft.llmConfigId,
        title: draft.brief.slice(0, 80),
      });

      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "status", content: t("dashboard.assistantSavingSurvey") },
      ]);

      const savedSurvey = await apiClient.post<{ id: string; title: string }>("/content-tasks", {
        title: surveyDraft.schema.survey.title,
        description: surveyDraft.schema.survey.description,
        rawText: surveyDraft.rawText,
        schema: surveyDraft.schema,
      });

      return {
        templateId: savedTemplate.id,
        templateName: savedTemplate.name,
        surveyId: savedSurvey.id,
        surveyTitle: savedSurvey.title,
      } satisfies CreationResult;
    },
    onSuccess: async (created) => {
      setResult(created);
      setStep("done");
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          tone: "success",
          content: t("dashboard.assistantDone", {
            templateName: created.templateName,
            surveyTitle: created.surveyTitle,
          }),
        },
      ]);
      message.success(t("dashboard.assistantCreateSuccess"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["templates"] }),
        queryClient.invalidateQueries({ queryKey: ["surveys"] }),
        queryClient.invalidateQueries({ queryKey: ["content-tasks"] }),
      ]);
    },
    onError: (error: Error) => {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          tone: "warning",
          content: t("dashboard.assistantError", { message: error.message }),
        },
      ]);
      message.error(error.message);
      setStep("confirm");
    },
  });

  const submitResponse = (rawValue?: string) => {
    const value = (rawValue ?? composerValue).trim();
    if (!value || creationMutation.isPending) return;

    if (step === "confirm") {
      if (value === "restart") {
        resetConversation();
        return;
      }

      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "user", content: t("dashboard.assistantConfirmAction") },
      ]);
      void creationMutation.mutateAsync();
      return;
    }

    if (step === "model") {
      const selectedValue = value || DEFAULT_MODEL_VALUE;
      setDraft((current) => ({ ...current, llmConfigId: selectedValue === DEFAULT_MODEL_VALUE ? undefined : selectedValue }));
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "user", content: resolveLabel("model", selectedValue) },
      ]);
      setComposerValue("");
      askNext("confirm");
      return;
    }

    setMessages((current) => [...current, { id: nextMessageId(), role: "user", content: value }]);

    if (step === "brief") {
      setDraft((current) => ({ ...current, brief: value }));
      setComposerValue("");
      askNext("scenario");
      return;
    }

    if (step === "scenario") {
      setDraft((current) => ({ ...current, scenario: value }));
      setComposerValue("");
      askNext("audience");
      return;
    }

    if (step === "audience") {
      setDraft((current) => ({ ...current, audience: value }));
      setComposerValue("");
      askNext("length");
      return;
    }

    if (step === "length") {
      setDraft((current) => ({ ...current, length: value }));
      setComposerValue("");
      askNext("participants");
      return;
    }

    if (step === "participants") {
      setDraft((current) => ({ ...current, participants: value }));
      setComposerValue("");
      askNext("tone");
      return;
    }

    if (step === "tone") {
      setDraft((current) => ({ ...current, tone: value }));
      setComposerValue("");
      askNext("model");
    }
  };

  const currentProgress = useMemo(() => {
    const order: AssistantStep[] = ["brief", "scenario", "audience", "length", "participants", "tone", "model", "confirm", "done"];
    const index = order.indexOf(step);
    if (index < 0) return 1;
    return Math.min(index + 1, 8);
  }, [step]);

  const composerDisabled = creationMutation.isPending || step === "confirm" || step === "done";
  const composerPlaceholder =
    step === "brief"
      ? t("dashboard.assistantStartPlaceholder")
      : step === "model"
        ? t("dashboard.assistantModelPlaceholder")
        : t("dashboard.assistantReplyPlaceholder");

  return (
    <Panel style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <div className="launchpad-hero">
        <div className="launchpad-hero__copy">
          <Tag className="launchpad-hero__badge" icon={<RocketOutlined />}>
            {t("dashboard.assistantEyebrow")}
          </Tag>
          <Typography.Title level={2} className="launchpad-hero__title">
            {t("dashboard.assistantTitle")}
          </Typography.Title>
          <Typography.Paragraph className="launchpad-hero__subtitle">
            {t("dashboard.assistantSubtitle")}
          </Typography.Paragraph>
          <Space wrap size={[8, 8]}>
            {examplePrompts.map((item) => (
              <Button key={item} className="launchpad-example" onClick={() => submitResponse(item)}>
                {item}
              </Button>
            ))}
          </Space>
        </div>
        <div className="launchpad-summary">
          <div className="launchpad-summary__eyebrow">{t("dashboard.assistantSummaryTitle")}</div>
          <div className="launchpad-summary__grid">
            <div className="launchpad-summary__item">
              <span>{t("dashboard.assistantSummaryScenario")}</span>
              <strong>{summaryLabels.scenario}</strong>
            </div>
            <div className="launchpad-summary__item">
              <span>{t("dashboard.assistantSummaryAudience")}</span>
              <strong>{summaryLabels.audience}</strong>
            </div>
            <div className="launchpad-summary__item">
              <span>{t("dashboard.assistantSummaryLength")}</span>
              <strong>{summaryLabels.length}</strong>
            </div>
            <div className="launchpad-summary__item">
              <span>{t("dashboard.assistantSummaryParticipants")}</span>
              <strong>{summaryLabels.participants}</strong>
            </div>
            <div className="launchpad-summary__item">
              <span>{t("dashboard.assistantSummaryTone")}</span>
              <strong>{summaryLabels.tone}</strong>
            </div>
            <div className="launchpad-summary__item">
              <span>{t("dashboard.assistantSummaryModel")}</span>
              <strong>{summaryLabels.model}</strong>
            </div>
          </div>
          <div className="launchpad-summary__progress">
            <MessageOutlined />
            <span>{t("dashboard.assistantProgress", { current: currentProgress, total: 8 })}</span>
          </div>
        </div>
      </div>

      <div className="launchpad-chat">
        <div className="launchpad-messages">
          {messages.map((item) => (
            <div key={item.id} className={`launchpad-message launchpad-message--${item.role}`}>
              <div className={`launchpad-message__bubble${item.tone ? ` launchpad-message__bubble--${item.tone}` : ""}`}>
                <Typography.Paragraph style={{ marginBottom: 0 }}>{item.content}</Typography.Paragraph>
                {item.options?.length ? (
                  <Space wrap size={[8, 8]} style={{ marginTop: 12 }}>
                    {item.options.map((option) => (
                      <Button
                        key={`${item.id}_${option.value}`}
                        className="launchpad-option"
                        onClick={() => submitResponse(option.value)}
                        disabled={creationMutation.isPending}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </Space>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="launchpad-composer">
          <Input.TextArea
            value={composerValue}
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={composerDisabled}
            placeholder={composerPlaceholder}
            onChange={(event) => setComposerValue(event.target.value)}
            onPressEnter={(event) => {
              if (event.shiftKey) return;
              event.preventDefault();
              submitResponse();
            }}
          />
          <div className="launchpad-composer__footer">
            <Button icon={<ReloadOutlined />} onClick={resetConversation} disabled={creationMutation.isPending}>
              {t("dashboard.assistantReset")}
            </Button>
            <Button type="primary" icon={step === "done" ? <CheckCircleOutlined /> : <SendOutlined />} onClick={() => submitResponse()} disabled={composerDisabled || !composerValue.trim()}>
              {step === "done" ? t("dashboard.assistantCreated") : t("dashboard.assistantSend")}
            </Button>
          </div>
        </div>

        {result ? (
          <div className="launchpad-result">
            <Typography.Text strong>{t("dashboard.assistantResultTitle")}</Typography.Text>
            <Space wrap size={[8, 8]} style={{ marginTop: 10 }}>
              <Button href="/templates">{t("dashboard.assistantOpenTemplates")}</Button>
              <Button href="/content-tasks">{t("dashboard.assistantOpenSurveys")}</Button>
              <Button type="primary" href="/mock-runs">
                {t("dashboard.assistantOpenRuns")}
              </Button>
            </Space>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
