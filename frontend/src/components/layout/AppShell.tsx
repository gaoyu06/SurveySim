import { DatabaseOutlined, ExperimentOutlined, FileTextOutlined, MenuOutlined, RadarChartOutlined, SettingOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Drawer, Grid, Layout, Menu, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";
import type { AppLocale } from "@/stores/locale.store";

const { Header, Sider, Content } = Layout;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, setLocale, t } = useI18n();
  const user = authStore((state) => state.user);
  const clearSession = authStore((state) => state.clearSession);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("app-shell-body");
    return () => document.body.classList.remove("app-shell-body");
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const items = useMemo(() => {
    const grouped: any[] = [
      {
        type: "group",
        label: t("nav.groupWork"),
        children: [
          { key: "/", icon: <RadarChartOutlined />, label: t("nav.dashboard") },
          { key: "/content-tasks", icon: <FileTextOutlined />, label: t("nav.surveys") },
          { key: "/mock-runs", icon: <ExperimentOutlined />, label: t("nav.mockRuns") },
          { key: "/reports", icon: <DatabaseOutlined />, label: t("nav.reports") },
        ],
      },
      {
        type: "group",
        label: t("nav.groupConfig"),
        children: [
          { key: "/llm-configs", icon: <SettingOutlined />, label: t("nav.llmConfigs") },
          { key: "/templates", icon: <TeamOutlined />, label: t("nav.templates") },
        ],
      },
    ];

    if (user?.role === "admin") {
      grouped.push({
        type: "group",
        label: t("nav.groupAdmin"),
        children: [
          { key: "/admin/users", icon: <UserOutlined />, label: t("nav.userManagement") },
          { key: "/admin/settings", icon: <SettingOutlined />, label: t("nav.systemSettings") },
        ],
      });
    }

    return grouped;
  }, [t, user?.role]);

  const flatItems = useMemo(
    () => items.flatMap((group: any) => ("children" in group ? group.children : [group])),
    [items],
  );

  const currentKey = location.pathname === "/" ? "/" : `/${location.pathname.split("/").slice(1, 3).join("/")}`.replace(/\/$/, "");
  const fallbackKey = location.pathname === "/" ? "/" : `/${location.pathname.split("/")[1]}`;
  const currentPage = flatItems.find((item: any) => item.key === currentKey) ?? flatItems.find((item: any) => item.key === fallbackKey);
  const navigationMenu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[currentPage?.key ?? fallbackKey]}
      items={items}
      onClick={({ key }) => {
        navigate(key);
        setMobileNavOpen(false);
      }}
      style={{ background: "transparent", borderInlineEnd: "none", marginTop: 12 }}
    />
  );

  return (
    <Layout className="app-shell">
      {isMobile ? (
        <Drawer
          open={mobileNavOpen}
          placement="left"
          width={280}
          closable={false}
          className="mobile-nav-drawer"
          onClose={() => setMobileNavOpen(false)}
          styles={{ body: { padding: 0, background: "rgba(3, 7, 18, 0.96)" } }}
        >
          <div className="sider-brand">
            <div className="brand-title">{t("common.appName")}</div>
            <div className="brand-subtitle">{t("shell.subtitle")}</div>
          </div>
          <div className="sider-menu-scroll">{navigationMenu}</div>
        </Drawer>
      ) : (
        <Sider width={260} theme="dark" className="app-sider">
          <div className="sider-brand">
            <div className="brand-title">{t("common.appName")}</div>
            <div className="brand-subtitle">{t("shell.subtitle")}</div>
          </div>
          <div className="sider-menu-scroll">{navigationMenu}</div>
        </Sider>
      )}
      <Layout className="app-main-shell">
        <Header className="app-topbar">
          <div className="topbar-main">
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                className="mobile-nav-trigger"
                onClick={() => setMobileNavOpen(true)}
                aria-label={t("common.navigation")}
              />
            ) : null}
            <Space direction="vertical" size={0} style={{ minWidth: 0, flex: 1 }}>
              <Typography.Text className="topbar-label">
                {t("shell.workspace")}
              </Typography.Text>
              <Typography.Text className="topbar-title" ellipsis>
                {currentPage?.label ?? t("common.appName")}
              </Typography.Text>
            </Space>
          </div>
          <Space className="topbar-actions" size={12} wrap>
            <Space direction="vertical" size={0} style={{ minWidth: 0, maxWidth: 280 }}>
              <Typography.Text className="topbar-label">
                {t("shell.account")}
              </Typography.Text>
              <Typography.Text className="topbar-email" ellipsis>
                {user?.email}
              </Typography.Text>
            </Space>
            <Select<AppLocale>
              value={locale}
              style={{ width: 120 }}
              options={[
                { label: "中文", value: "zh-CN" },
                { label: "English", value: "en-US" },
              ]}
              onChange={setLocale}
              aria-label={t("common.language")}
            />
            <Button
              onClick={() => {
                clearSession();
                navigate("/login");
              }}
            >
              {t("common.signOut")}
            </Button>
          </Space>
        </Header>
        <Content className="page-wrap">
          <div className="page-scroll-body">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
