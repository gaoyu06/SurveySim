import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, InputNumber, Result } from "antd";
import { useEffect, useState } from "react";
import type { SystemSettingsDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { HelpCallout } from "@/components/Help";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";

export function SystemSettingsPage() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const currentUser = authStore((state) => state.user);
  const [defaultDailyUsageLimit, setDefaultDailyUsageLimit] = useState(20);

  const settingsQuery = useQuery({
    queryKey: ["admin-system-settings"],
    queryFn: () => apiClient.get<SystemSettingsDto>("/admin/system-settings"),
    enabled: currentUser?.role === "admin",
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDefaultDailyUsageLimit(settingsQuery.data.defaultDailyUsageLimit);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put<SystemSettingsDto>("/admin/system-settings", {
        defaultDailyUsageLimit,
      }),
    onSuccess: () => {
      message.success(t("admin.settings.saved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-system-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  if (currentUser?.role !== "admin") {
    return <Result status="403" title="403" subTitle={t("admin.forbidden")} />;
  }

  return (
    <>
      <PageHeader title={t("admin.settings.title")} subtitle={t("admin.settings.subtitle")} />
      <HelpCallout
        title={t("admin.settings.guideTitle")}
        description={t("admin.settings.guideDescription")}
        items={[t("admin.settings.guideStep1"), t("admin.settings.guideStep2"), t("admin.settings.guideStep3")]}
      />
      <Panel>
        <Form layout="vertical">
          <Form.Item label={t("admin.settings.defaultDailyUsageLimit")} extra={t("admin.settings.defaultDailyUsageLimitHint")}>
            <InputNumber
              min={0}
              max={100000}
              style={{ width: "100%" }}
              value={defaultDailyUsageLimit}
              onChange={(value) => setDefaultDailyUsageLimit(value ?? 0)}
            />
          </Form.Item>
          <Button type="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {t("common.save")}
          </Button>
        </Form>
      </Panel>
    </>
  );
}
