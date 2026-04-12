import { SendOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Button, Input, Space, Typography, Alert, Spin, Tag } from "antd";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useI18n } from "@/i18n/I18nProvider";

const { TextArea } = Input;

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

type Phase = "chat" | "text-input" | "creating";

export function TranslationModeChat() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: t("translation.chat.welcome") },
  ]);
  const [input, setInput] = useState("");
  const [collectedFields, setCollectedFields] = useState<Record<string, string>>({});

  // Phase B: text input
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message to AI chat endpoint
  const sendChat = useMutation({
    mutationFn: (userMessage: string) =>
      apiClient.post<{
        message: string;
        collectedFields: Record<string, string>;
        missingFields: string[];
        ready: boolean;
      }>("/translations/chat", {
        messages: [...messages, { role: "user" as const, content: userMessage }],
      }),
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: input },
        { role: "assistant", content: result.message },
      ]);
      setInput("");

      // Merge collected fields
      const newFields = { ...collectedFields };
      for (const [key, val] of Object.entries(result.collectedFields)) {
        if (val) newFields[key] = val;
      }
      setCollectedFields(newFields);

      // Transition to text input phase when ready
      if (result.ready) {
        setPhase("text-input");
      }
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: input },
        { role: "assistant", content: t("translation.chat.error") + ": " + error.message },
      ]);
      setInput("");
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendChat.isPending) return;
    sendChat.mutate(trimmed);
  };

  // Create project + first version
  const createProject = useMutation({
    mutationFn: async () => {
      const project = await apiClient.post<{ id: string }>("/translations/projects", collectedFields);
      return project;
    },
    onSuccess: (project) => {
      // Create first version
      return apiClient
        .post(`/translations/projects/${project.id}/versions`, {
          sourceText: sourceText || undefined,
          translatedText,
        })
        .then((version) => {
          navigate(`/translation/projects/${project.id}`, { state: { autoOpenAddVersion: false } });
        });
    },
    onError: (error: Error) => {
      setPhase("text-input"); // go back to text input
    },
  });

  const fieldLabels: Record<string, string> = {
    title: t("translation.chat.fieldTitle"),
    dramaTheme: t("translation.chat.fieldTheme"),
    targetMarket: t("translation.chat.fieldMarket"),
    targetCulture: t("translation.chat.fieldCulture"),
    sourceLanguage: t("translation.chat.fieldSourceLang"),
    targetLanguage: t("translation.chat.fieldTargetLang"),
  };

  return (
    <div style={{ width: "100%", maxWidth: 680 }}>
      <Typography.Title level={2} className="dashboard-hero__title">
        {t("translation.chat.title")}
      </Typography.Title>
      <Typography.Text className="dashboard-hero__subtitle">
        {t("translation.chat.subtitle")}
      </Typography.Text>

      {/* ── Phase A: AI Chat ── */}
      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          marginTop: 20,
          marginBottom: 16,
          paddingRight: 4,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.14)",
                background:
                  msg.role === "user"
                    ? "rgba(59,130,246,0.16)"
                    : "rgba(255,255,255,0.04)",
                whiteSpace: "pre-wrap",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Collected fields indicator */}
        {Object.keys(collectedFields).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {Object.entries(collectedFields).map(([key, val]) => (
              val ? <Tag key={key} color="blue" style={{ fontSize: 11 }}>{fieldLabels[key] || key}: {val}</Tag> : null
            ))}
          </div>
        )}

        {sendChat.isPending && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <Spin size="small" /> <Typography.Text type="secondary" style={{ marginLeft: 8 }}>{t("translation.chat.thinking")}</Typography.Text>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {phase === "chat" && (
        <div className="dashboard-hero-input">
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("translation.chat.inputPlaceholder")}
            autoSize={{ minRows: 2, maxRows: 4 }}
            disabled={sendChat.isPending}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!input.trim() || sendChat.isPending}
          />
        </div>
      )}

      {/* ── Phase B: Text Input ── */}
      {phase === "text-input" && (
        <div style={{ marginTop: 16 }}>
          <Typography.Title level={4}>{t("translation.chat.phaseBTitle")}</Typography.Title>

          {/* Summary of collected info */}
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.12)",
              background: "rgba(59,130,246,0.06)",
              marginBottom: 16,
            }}
          >
            {Object.entries(collectedFields).map(
              ([key, val]) =>
                val ? (
                  <div key={key} style={{ marginBottom: 4 }}>
                    <Typography.Text type="secondary">{fieldLabels[key] || key}:</Typography.Text>{" "}
                    <Typography.Text strong>{val}</Typography.Text>
                  </div>
                ) : null,
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary">{t("translation.sourceText")}</Typography.Text>
            <TextArea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={5}
              placeholder={t("translation.sourceTextPlaceholder")}
              style={{ marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">{t("translation.translatedText")}</Typography.Text>
            <TextArea
              value={translatedText}
              onChange={(e) => setTranslatedText(e.target.value)}
              rows={7}
              placeholder={t("translation.translatedTextPlaceholder")}
              style={{ marginTop: 4 }}
            />
          </div>

          <Space>
            <Button
              type="primary"
              size="large"
              loading={createProject.isPending}
              disabled={!translatedText.trim()}
              onClick={() => {
                setPhase("creating");
                createProject.mutate();
              }}
            >
              {t("translation.chat.submitProject")}
            </Button>
            <Button onClick={() => setPhase("chat")}>{t("translation.chat.backToChat")}</Button>
          </Space>

          {createProject.isError && (
            <Alert
              type="error"
              message={createProject.error instanceof Error ? createProject.error.message : String(createProject.error)}
              style={{ marginTop: 12 }}
              closable
              onClose={() => createProject.reset()}
            />
          )}
        </div>
      )}

      {/* ── Creating phase ── */}
      {phase === "creating" && (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            {t("translation.chat.creating")}
          </Typography.Paragraph>
        </div>
      )}
    </div>
  );
}
