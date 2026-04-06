import { CompassOutlined, MessageOutlined, RocketOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Input, Space, Tag, Typography } from "antd";
import type { LlmProviderConfigDto, ParticipantTemplateAiGenerateResult, SurveyDraft } from "@surveysim/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useI18n } from "@/i18n/I18nProvider";

type AssistantStep = "intent" | "audience" | "surveyGoal" | "tone" | "count" | "config" | "confirm" | "done";

type AssistantAnswerState = {
  intent: string;
  audience: string;
  surveyGoal: string;
  tone: string;
  participantCount: number;
  llmConfigId?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  tone?: "default" | "success" | "status";
};

type CreatedResources = {
  survey: { id: string; title: string };
  template: { id: string; name: string };
};

type QuickOption = {
  label: string;
  value: string;
  mode?: "primary" | "default";
};

const defaultAnswers: AssistantAnswerState = {
  intent: "",
  audience: "",
  surveyGoal: "",
  tone: "balanced",
  participantCount: 120,
  llmConfigId: undefined,
};

function createMessage(role: ChatMessage["role"], text: string, tone: ChatMessage["tone"] = "default"): ChatMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    tone,
  };
}

function getCopy(locale: string) {
  const zh = locale === "zh-CN";
  return {
    heroBadge: zh ? "Natural language quick start" : "Natural language quick start",
    heroTitle: zh ? "一句话描述，我来帮你创建问卷和参与者模板" : "Describe it once, then let the assistant create your survey and participant template",
    heroDescription: zh
      ? "直接写下研究主题、目标人群和想了解的问题。系统会在对话里继续追问，并自动生成可编辑的问卷草稿与人群模板。"
      : "Describe the topic, audience, and what you want to learn. The assistant will follow up and build an editable survey draft plus a reusable participant template.",
    heroPlaceholder: zh ? "例如：我想做一个面向大学生的校园外卖满意度调研，重点了解下单频率、价格敏感度和配送体验。" : "Example: I need a campus food delivery satisfaction survey for college students, focused on order frequency, price sensitivity, and delivery experience.",
    startConversation: zh ? "开始对话创建" : "Start guided creation",
    openTemplates: zh ? "去看参与者页" : "Open templates",
    openSurveys: zh ? "去看问卷页" : "Open surveys",
    examplesLabel: zh ? "试试这些开场" : "Try these prompts",
    drawerTitle: zh ? "极速创建助手" : "Quick creation assistant",
    restart: zh ? "重新开始" : "Restart",
    createNow: zh ? "直接创建" : "Create now",
    composerPlaceholder:
      zh ? "也可以直接补充一句，比如“题目偏短一些，适合 3 分钟内完成”" : "You can add one more instruction, such as “keep it short enough for a 3-minute flow”.",
    askIntent: zh ? "先直接告诉我你想做什么研究。我会继续追问几步，然后直接帮你生成问卷和参与者模板。" : "Start by telling me what you want to research. I’ll ask a few follow-ups and then create the survey and participant template.",
    askAudience: zh ? "这份问卷主要希望谁来回答？如果有更具体的人群，也可以直接输入。" : "Who should answer this survey? You can also type a more specific audience.",
    askGoal: zh ? "这份问卷更接近哪类任务？我会据此控制题型和结构。" : "What kind of task is this closest to? I’ll use that to shape the question types and structure.",
    askTone: zh ? "你希望整体风格更偏哪种？" : "What tone should the survey lean toward?",
    askCount: zh ? "想先按多少参与者规模来生成一个默认模板预览？" : "What participant scale should I use for the default template preview?",
    askConfig: zh ? "最后一步：想用默认模型，还是指定某个配置？" : "Final step: use the default model or choose a specific config?",
    summaryLead: zh ? "我已经整理好了创建方案：" : "Here is the creation plan:",
    summaryIntent: zh ? "研究目标" : "Research goal",
    summaryAudience: zh ? "参与者" : "Audience",
    summaryTask: zh ? "问卷类型" : "Survey type",
    summaryTone: zh ? "风格" : "Tone",
    summaryCount: zh ? "预览人数" : "Preview count",
    summaryModel: zh ? "模型配置" : "Model config",
    modelDefault: zh ? "默认模型" : "Default model",
    generatingTemplate: zh ? "正在生成参与者模板…" : "Generating participant template…",
    generatingSurvey: zh ? "正在生成问卷草稿…" : "Generating survey draft…",
    savingResult: zh ? "正在保存到工作台…" : "Saving into the workspace…",
    success: zh ? "已创建完成。你现在可以直接继续编辑，或者跳去对应页面查看。" : "Done. You can continue editing now or jump to the created resources.",
    openSurvey: zh ? "打开问卷" : "Open survey",
    openTemplate: zh ? "打开参与者模板" : "Open template",
    helperHint: zh ? "当前流程支持点选快捷选项，也支持你随时直接输入自然语言补充。" : "You can click quick options at any step, or type additional natural-language instructions anytime.",
    noConfig: zh ? "使用默认模型" : "Use default model",
    doneHint: zh ? "如果还想换一个方向，直接重新开始即可。" : "If you want a different direction, simply restart.",
    addDetail: zh ? "补充要求" : "Add detail",
    send: zh ? "发送" : "Send",
    options: {
      intents: zh
        ? [
            "做一个新品概念测试问卷，并配一组年轻消费者参与者",
            "生成一个面向企业用户的 B 端满意度调研",
            "我想做内容反馈问卷，重点看用户是否愿意继续阅读",
          ]
        : [
            "Create a concept test survey with a young consumer audience",
            "Generate a B2B satisfaction survey for enterprise users",
            "I need a content-feedback survey focused on reading intent",
          ],
      audiences: zh ? ["普通消费者", "大学生", "白领用户", "企业决策者"] : ["General consumers", "College students", "Office workers", "Business decision makers"],
      goals: zh ? ["满意度调研", "概念测试", "内容反馈", "品牌认知"] : ["Satisfaction research", "Concept test", "Content feedback", "Brand awareness"],
      tones: zh ? ["轻量快速", "平衡通用", "更深入一些"] : ["Fast and light", "Balanced and general", "More in-depth"],
    },
  };
}

function nextStep(current: AssistantStep): AssistantStep {
  switch (current) {
    case "intent":
      return "audience";
    case "audience":
      return "surveyGoal";
    case "surveyGoal":
      return "tone";
    case "tone":
      return "count";
    case "count":
      return "config";
    case "config":
      return "confirm";
    default:
      return current;
  }
}

function buildAssistantQuestion(step: AssistantStep, copy: ReturnType<typeof getCopy>): string {
  switch (step) {
    case "intent":
      return copy.askIntent;
    case "audience":
      return copy.askAudience;
    case "surveyGoal":
      return copy.askGoal;
    case "tone":
      return copy.askTone;
    case "count":
      return copy.askCount;
    case "config":
      return copy.askConfig;
    default:
      return "";
  }
}

function buildSummary(copy: ReturnType<typeof getCopy>, answers: AssistantAnswerState, llmConfigs: LlmProviderConfigDto[]) {
  const selectedConfig = llmConfigs.find((item) => item.id === answers.llmConfigId);
  return [
    copy.summaryLead,
    `• ${copy.summaryIntent}：${answers.intent}`,
    `• ${copy.summaryAudience}：${answers.audience}`,
    `• ${copy.summaryTask}：${answers.surveyGoal}`,
    `• ${copy.summaryTone}：${answers.tone}`,
    `• ${copy.summaryCount}：${answers.participantCount}`,
    `• ${copy.summaryModel}：${selectedConfig?.name ?? copy.modelDefault}`,
  ].join("\n");
}

function buildParticipantPrompt(answers: AssistantAnswerState) {
  return [
    `Research brief: ${answers.intent}`,
    `Target audience: ${answers.audience}`,
    `Survey goal: ${answers.surveyGoal}`,
    `Desired tone: ${answers.tone}`,
    `Default preview participant count: ${answers.participantCount}`,
    "Generate a practical participant template for this research setup.",
    "Prefer a compact, reusable set of attributes and rules.",
  ].join("\n");
}

function buildSurveyPrompt(answers: AssistantAnswerState) {
  const lengthHint = answers.tone === "轻量快速" || answers.tone === "Fast and light"
    ? "Keep it concise, suitable for roughly 3 minutes."
    : answers.tone === "更深入一些" || answers.tone === "More in-depth"
      ? "Make it deeper with clearer probing and richer sections."
      : "Keep it balanced and easy to launch.";

  return [
    `Research brief: ${answers.intent}`,
    `Target audience: ${answers.audience}`,
    `Survey goal: ${answers.surveyGoal}`,
    `Desired tone: ${answers.tone}`,
    lengthHint,
    "Generate a complete, editable survey schema with a clear title, 1-3 sections, and question types that match the task.",
    "Prefer a practical survey that can be used immediately by a product or research team.",
  ].join("\n");
}

export function ConversationQuickStart() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { locale } = useI18n();
  const copy = useMemo(() => getCopy(locale), [locale]);
  const [heroInput, setHeroInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [step, setStep] = useState<AssistantStep>("intent");
  const [answers, setAnswers] = useState<AssistantAnswerState>(defaultAnswers);
  const [messages, setMessages] = useState<ChatMessage[]>([createMessage("assistant", buildAssistantQuestion("intent", copy))]);
  const [created, setCreated] = useState<CreatedResources | null>(null);

  const llmConfigsQuery = useQuery({
    queryKey: ["llm-configs", "quick-start"],
    queryFn: () => apiClient.get<LlmProviderConfigDto[]>("/llm-configs"),
  });

  const resetConversation = () => {
    setAnswers(defaultAnswers);
    setStep("intent");
    setCreated(null);
    setComposerValue("");
    setMessages([createMessage("assistant", buildAssistantQuestion("intent", copy))]);
  };

  const createMutation = useMutation({
    mutationFn: async (currentAnswers: AssistantAnswerState) => {
      const [templateGenerated, surveyGenerated] = await Promise.all([
        apiClient.post<ParticipantTemplateAiGenerateResult>("/participant-templates/generate-with-ai", {
          prompt: buildParticipantPrompt(currentAnswers),
          templateName: currentAnswers.audience ? `${currentAnswers.audience} · template` : undefined,
          templateDescription: currentAnswers.intent,
          llmConfigId: currentAnswers.llmConfigId,
          attributes: [],
          randomConfig: {
            randomnessLevel: currentAnswers.tone === "更深入一些" || currentAnswers.tone === "More in-depth" ? "high" : currentAnswers.tone === "轻量快速" || currentAnswers.tone === "Fast and light" ? "low" : "medium",
            noiseProfile: currentAnswers.tone === "更深入一些" || currentAnswers.tone === "More in-depth" ? "expressive" : "balanced",
          },
        }),
        apiClient.post<SurveyDraft>("/content-tasks/generate-with-ai", {
          prompt: buildSurveyPrompt(currentAnswers),
          llmConfigId: currentAnswers.llmConfigId,
          title: currentAnswers.intent,
        }),
      ]);

      const [savedTemplate, savedSurvey] = await Promise.all([
        apiClient.post<{ id: string; name: string }>("/participant-templates", {
          template: {
            ...templateGenerated.template,
            name: templateGenerated.template.name || currentAnswers.audience || "Generated template",
            description: templateGenerated.template.description || currentAnswers.intent,
            sampleSizePreview: currentAnswers.participantCount,
          },
          rules: templateGenerated.rules,
        }),
        apiClient.post<{ id: string; title: string }>("/content-tasks", {
          title: surveyGenerated.schema.survey.title,
          description: surveyGenerated.schema.survey.description,
          rawText: surveyGenerated.rawText,
          schema: surveyGenerated.schema,
        }),
      ]);

      return {
        template: savedTemplate,
        survey: savedSurvey,
      };
    },
    onSuccess: async (result) => {
      setCreated(result);
      setStep("done");
      setMessages((current) => [...current, createMessage("assistant", copy.success, "success")]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["templates"] }),
        queryClient.invalidateQueries({ queryKey: ["surveys"] }),
        queryClient.invalidateQueries({ queryKey: ["content-tasks"] }),
      ]);
    },
    onError: (error: Error) => {
      message.error(error.message);
      setMessages((current) => [...current, createMessage("assistant", error.message, "status")]);
    },
  });

  const submitAnswer = (rawValue: string, forcedStep?: AssistantStep) => {
    const activeStep = forcedStep ?? step;
    const value = rawValue.trim();
    if (!value || createMutation.isPending) return;

    const nextAnswers = { ...answers };
    if (activeStep === "intent") nextAnswers.intent = value;
    if (activeStep === "audience") nextAnswers.audience = value;
    if (activeStep === "surveyGoal") nextAnswers.surveyGoal = value;
    if (activeStep === "tone") nextAnswers.tone = value;
    if (activeStep === "count") nextAnswers.participantCount = Number.parseInt(value, 10) || answers.participantCount;
    if (activeStep === "config") nextAnswers.llmConfigId = value === "__default__" ? undefined : value;
    if (activeStep === "confirm") nextAnswers.intent = `${answers.intent}\n${value}`.trim();

    const displayValue = activeStep === "config"
      ? (value === "__default__" ? copy.noConfig : (llmConfigsQuery.data ?? []).find((item) => item.id === value)?.name ?? value)
      : value;
    const nextMessages = [...messages, createMessage("user", displayValue)];

    if (activeStep === "confirm") {
      setAnswers(nextAnswers);
      setMessages([...nextMessages, createMessage("assistant", buildSummary(copy, nextAnswers, llmConfigsQuery.data ?? []))]);
      setComposerValue("");
      return;
    }

    const upcomingStep = nextStep(activeStep);
    setAnswers(nextAnswers);
    setStep(upcomingStep);
    setComposerValue("");

    if (upcomingStep === "confirm") {
      setMessages([...nextMessages, createMessage("assistant", buildSummary(copy, nextAnswers, llmConfigsQuery.data ?? []))]);
      return;
    }

    setMessages([...nextMessages, createMessage("assistant", buildAssistantQuestion(upcomingStep, copy))]);
  };

  const openDrawer = (initialText?: string) => {
    resetConversation();
    setDrawerOpen(true);
    if (initialText?.trim()) {
      const seededAnswers = { ...defaultAnswers, intent: initialText.trim() };
      setAnswers(seededAnswers);
      setStep("audience");
      setMessages([
        createMessage("assistant", buildAssistantQuestion("intent", copy)),
        createMessage("user", initialText.trim()),
        createMessage("assistant", buildAssistantQuestion("audience", copy)),
      ]);
    }
  };

  const currentOptions = useMemo<QuickOption[]>(() => {
    if (step === "intent") {
      return copy.options.intents.map((item, index) => ({ label: item, value: item, mode: index === 0 ? "primary" : "default" }));
    }
    if (step === "audience") {
      return copy.options.audiences.map((item, index) => ({ label: item, value: item, mode: index === 0 ? "primary" : "default" }));
    }
    if (step === "surveyGoal") {
      return copy.options.goals.map((item, index) => ({ label: item, value: item, mode: index === 0 ? "primary" : "default" }));
    }
    if (step === "tone") {
      return copy.options.tones.map((item, index) => ({ label: item, value: item, mode: index === 1 ? "primary" : "default" }));
    }
    if (step === "count") {
      return [50, 120, 300].map((item, index) => ({ label: String(item), value: String(item), mode: index === 1 ? "primary" : "default" }));
    }
    if (step === "config") {
      return [
        { label: copy.noConfig, value: "__default__", mode: "primary" },
        ...(llmConfigsQuery.data ?? []).slice(0, 4).map((item) => ({ label: item.name, value: item.id })),
      ];
    }
    return [];
  }, [copy, llmConfigsQuery.data, step]);

  const summaryTags = [answers.audience, answers.surveyGoal, answers.tone, answers.participantCount ? `${answers.participantCount}` : ""].filter(Boolean);

  return (
    <>
      <div className="quick-start-hero panel">
        <div className="quick-start-hero__badge">{copy.heroBadge}</div>
        <div className="quick-start-hero__grid">
          <div>
            <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 12 }}>
              {copy.heroTitle}
            </Typography.Title>
            <Typography.Paragraph className="quick-start-hero__description">
              {copy.heroDescription}
            </Typography.Paragraph>
            <Input.TextArea
              value={heroInput}
              onChange={(event) => setHeroInput(event.target.value)}
              rows={4}
              placeholder={copy.heroPlaceholder}
              className="quick-start-hero__input"
            />
            <Space wrap size={[10, 10]} style={{ marginTop: 14 }}>
              <Button type="primary" size="large" icon={<RocketOutlined />} onClick={() => openDrawer(heroInput)}>
                {copy.startConversation}
              </Button>
              <Button size="large" icon={<CompassOutlined />} onClick={() => navigate("/templates")}>{copy.openTemplates}</Button>
              <Button size="large" icon={<MessageOutlined />} onClick={() => navigate("/content-tasks/import")}>{copy.openSurveys}</Button>
            </Space>
          </div>
          <div className="quick-start-hero__side">
            <Typography.Text className="topbar-label">{copy.examplesLabel}</Typography.Text>
            <div className="quick-start-example-list">
              {copy.options.intents.map((item) => (
                <button key={item} type="button" className="quick-start-example" onClick={() => setHeroInput(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="quick-start-hero__note">{copy.helperHint}</div>
          </div>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
        title={copy.drawerTitle}
        extra={<Button onClick={resetConversation}>{copy.restart}</Button>}
        styles={{ body: { paddingBottom: 20 } }}
      >
        <div className="assistant-shell">
          <div className="assistant-summary-bar">
            {summaryTags.length ? summaryTags.map((item) => <Tag key={item}>{item}</Tag>) : <Tag>{copy.helperHint}</Tag>}
          </div>
          <div className="assistant-thread">
            {messages.map((item) => (
              <div key={item.id} className={`assistant-thread__row assistant-thread__row--${item.role}`}>
                <div className={`assistant-thread__bubble assistant-thread__bubble--${item.role}${item.tone ? ` assistant-thread__bubble--${item.tone}` : ""}`}>
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                    {item.text}
                  </Typography.Paragraph>
                </div>
              </div>
            ))}
          </div>

          {step !== "done" ? (
            <div className="assistant-composer">
              {step === "confirm" ? (
                <div className="assistant-option-row">
                  <Button
                    type="primary"
                    size="large"
                    loading={createMutation.isPending}
                    onClick={() => {
                      setMessages((current) => [
                        ...current,
                        createMessage("assistant", copy.generatingTemplate, "status"),
                        createMessage("assistant", copy.generatingSurvey, "status"),
                        createMessage("assistant", copy.savingResult, "status"),
                      ]);
                      void createMutation.mutateAsync(answers);
                    }}
                  >
                    {copy.createNow}
                  </Button>
                  <Button size="large" onClick={resetConversation}>{copy.restart}</Button>
                </div>
              ) : (
                <div className="assistant-option-row">
                  {currentOptions.map((option) => (
                    <Button
                      key={option.value}
                      type={option.mode === "primary" ? "primary" : "default"}
                      ghost={option.mode !== "primary"}
                      disabled={createMutation.isPending}
                      onClick={() => submitAnswer(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
              <Input.TextArea
                rows={3}
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                placeholder={copy.composerPlaceholder}
                disabled={createMutation.isPending}
              />
              <div className="assistant-composer__actions">
                <Typography.Text type="secondary">{step === "confirm" ? copy.helperHint : buildAssistantQuestion(step, copy)}</Typography.Text>
                <Button type="primary" disabled={!composerValue.trim() || createMutation.isPending} loading={createMutation.isPending} onClick={() => submitAnswer(composerValue)}>
                  {step === "confirm" ? copy.addDetail : copy.send}
                </Button>
              </div>
            </div>
          ) : (
            <div className="assistant-result-actions">
              <Typography.Text type="secondary">{copy.doneHint}</Typography.Text>
              <Space wrap>
                <Button type="primary" onClick={() => created && navigate(`/content-tasks/${created.survey.id}/preview`)}>{copy.openSurvey}</Button>
                <Button onClick={() => navigate("/templates")}>{copy.openTemplate}</Button>
                <Button onClick={resetConversation}>{copy.restart}</Button>
              </Space>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
