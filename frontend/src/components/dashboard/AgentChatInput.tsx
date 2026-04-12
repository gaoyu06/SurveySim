import { SendOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Button, Input, Space, Spin, Typography, Alert } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useI18n } from "@/i18n/I18nProvider";

const { TextArea } = Input;

export function AgentChatInput() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");

  const quickCreate = useMutation({
    mutationFn: (brief: string) =>
      apiClient.post("/workspace-assistant/quick-create", { brief }),
    onSuccess: () => {
      setPrompt("");
    },
  });

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    quickCreate.mutate(trimmed);
  };

  const examples = [
    t("dashboard.heroExample1"),
    t("dashboard.heroExample2"),
    t("dashboard.heroExample3"),
  ];

  return (
    <div className="dashboard-hero">
      <Typography.Title level={2} className="dashboard-hero__title">
        {t("dashboard.heroTitle")}
      </Typography.Title>
      <Typography.Text className="dashboard-hero__subtitle">
        {t("dashboard.heroSubtitle")}
      </Typography.Text>

      <div className="dashboard-hero-input">
        <TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("dashboard.heroPlaceholder")}
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={quickCreate.isPending}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          type="primary"
          size="large"
          icon={quickCreate.isPending ? <Spin size="small" /> : <SendOutlined />}
          onClick={handleSubmit}
          disabled={!prompt.trim() || quickCreate.isPending}
        />
      </div>

      <div className="dashboard-hero-examples">
        {examples.map((ex, i) => (
          <Button key={i} type="dashed" size="small" onClick={() => setPrompt(ex)}>
            {ex}
          </Button>
        ))}
      </div>

      {quickCreate.isError && (
        <Alert
          type="error"
          message={quickCreate.error instanceof Error ? quickCreate.error.message : String(quickCreate.error)}
          closable
          onClose={() => quickCreate.reset()}
        />
      )}

      {quickCreate.isSuccess && Boolean(quickCreate.data) && (
        <Alert
          type="success"
          message={t("dashboard.heroCreated")}
          description={
            <Space direction="vertical" size={4}>
              <Typography.Text>
                {t("dashboard.heroCreatedSurvey")}: <Typography.Text strong>{(quickCreate.data as any).survey?.title}</Typography.Text>
              </Typography.Text>
              <Space>
                <Button size="small" type="primary" onClick={() => navigate("/content-tasks")}>
                  {t("dashboard.heroViewSurveys")}
                </Button>
                <Button size="small" onClick={() => navigate("/mock-runs")}>
                  {t("dashboard.heroGoTest")}
                </Button>
              </Space>
            </Space>
          }
          closable
          onClose={() => quickCreate.reset()}
        />
      )}
    </div>
  );
}
