import { SettingOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, InputNumber, Result, Select, Space, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import type { AdminUserDto, AdminUserUpdateInput, SystemSettingsDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { HelpCallout } from "@/components/Help";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";

export function UserManagementPage() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const currentUser = authStore((state) => state.user);
  const [editingUser, setEditingUser] = useState<AdminUserDto | null>(null);
  const [draftRole, setDraftRole] = useState<"admin" | "user">("user");
  const [useSystemDefault, setUseSystemDefault] = useState(true);
  const [draftLimit, setDraftLimit] = useState<number>(0);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiClient.get<AdminUserDto[]>("/admin/users"),
    enabled: currentUser?.role === "admin",
  });

  const settingsQuery = useQuery({
    queryKey: ["admin-system-settings"],
    queryFn: () => apiClient.get<SystemSettingsDto>("/admin/system-settings"),
    enabled: currentUser?.role === "admin",
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; body: AdminUserUpdateInput }) =>
      apiClient.put<AdminUserDto>(`/admin/users/${payload.id}`, payload.body),
    onSuccess: () => {
      message.success(t("admin.users.updated"));
      setEditingUser(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const limitPlaceholder = useMemo(() => settingsQuery.data?.defaultDailyUsageLimit ?? 0, [settingsQuery.data]);

  if (currentUser?.role !== "admin") {
    return <Result status="403" title="403" subTitle={t("admin.forbidden")} />;
  }

  return (
    <>
      <PageHeader title={t("admin.users.title")} subtitle={t("admin.users.subtitle")} />
      <HelpCallout
        title={t("admin.users.guideTitle")}
        description={t("admin.users.guideDescription")}
        items={[t("admin.users.guideStep1"), t("admin.users.guideStep2"), t("admin.users.guideStep3")]}
      />
      <Panel>
        <Table
          rowKey="id"
          loading={usersQuery.isLoading}
          dataSource={usersQuery.data ?? []}
          pagination={false}
          columns={[
            { title: t("admin.users.email"), dataIndex: "email" },
            {
              title: t("admin.users.role"),
              dataIndex: "role",
              render: (value: "admin" | "user") => (
                <Tag color={value === "admin" ? "gold" : "blue"}>{t(`admin.role.${value}`)}</Tag>
              ),
            },
            {
              title: t("admin.users.todayUsage"),
              render: (_, item) => `${item.todayUsage.usageCount} / ${item.todayUsage.limit ?? "∞"}`,
            },
            {
              title: t("admin.users.customLimit"),
              render: (_, item) =>
                item.dailyUsageLimit == null ? (
                  <Typography.Text type="secondary">{t("admin.users.useSystemDefault")}</Typography.Text>
                ) : (
                  item.dailyUsageLimit
                ),
            },
            {
              title: t("common.actions"),
              render: (_, item) => (
                <Button
                  icon={<SettingOutlined />}
                  onClick={() => {
                    setEditingUser(item);
                    setDraftRole(item.role);
                    setUseSystemDefault(item.dailyUsageLimit == null);
                    setDraftLimit(item.dailyUsageLimit ?? limitPlaceholder);
                  }}
                >
                  {t("common.edit")}
                </Button>
              ),
            },
          ]}
        />
      </Panel>

      <Drawer
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        width={420}
        title={t("admin.users.editTitle")}
      >
        {editingUser ? (
          <Form layout="vertical">
            <Form.Item label={t("admin.users.email")}>
              <Typography.Text>{editingUser.email}</Typography.Text>
            </Form.Item>
            <Form.Item label={t("admin.users.role")}>
              <Select
                value={draftRole}
                options={[
                  { label: t("admin.role.user"), value: "user" },
                  { label: t("admin.role.admin"), value: "admin" },
                ]}
                onChange={setDraftRole}
              />
            </Form.Item>
            <Form.Item label={t("admin.users.limitMode")}>
              <Select
                value={useSystemDefault ? "system" : "custom"}
                options={[
                  { label: t("admin.users.useSystemDefault"), value: "system" },
                  { label: t("admin.users.useCustomLimit"), value: "custom" },
                ]}
                onChange={(value) => setUseSystemDefault(value === "system")}
              />
            </Form.Item>
            {!useSystemDefault ? (
              <Form.Item label={t("admin.users.customLimit")}>
                <InputNumber min={0} max={100000} style={{ width: "100%" }} value={draftLimit} onChange={(value) => setDraftLimit(value ?? 0)} />
              </Form.Item>
            ) : null}
            <Space>
              <Button
                type="primary"
                loading={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    id: editingUser.id,
                    body: {
                      role: draftRole,
                      dailyUsageLimit: useSystemDefault ? null : draftLimit,
                    },
                  })
                }
              >
                {t("common.save")}
              </Button>
            </Space>
          </Form>
        ) : null}
      </Drawer>
    </>
  );
}
