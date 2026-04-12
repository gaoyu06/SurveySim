import { Segmented } from "antd";
import { useState } from "react";
import { Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { AgentChatInput } from "@/components/dashboard/AgentChatInput";
import { TranslationModeChat } from "@/components/dashboard/TranslationModeChat";

type DashboardMode = "survey" | "translation";

export function DashboardPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<DashboardMode>("survey");

  return (
    <div className="dashboard-page-center">
      <Panel>
        <div className="dashboard-hero">
          <div style={{ marginBottom: 20 }}>
            <Segmented
              value={mode}
              onChange={(val) => setMode(val as DashboardMode)}
              options={[
                { label: t("dashboard.modeSurvey"), value: "survey" },
                { label: t("dashboard.modeTranslation"), value: "translation" },
              ]}
            />
          </div>
          {mode === "survey" ? <AgentChatInput /> : <TranslationModeChat />}
        </div>
      </Panel>
    </div>
  );
}
