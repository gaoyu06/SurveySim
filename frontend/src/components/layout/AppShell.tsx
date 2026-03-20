import { DatabaseOutlined, ExperimentOutlined, FileTextOutlined, RadarChartOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography } from "antd";
import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { authStore } from "@/stores/auth.store";

const { Header, Sider, Content } = Layout;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = authStore((state) => state.user);
  const clearSession = authStore((state) => state.clearSession);

  const items = useMemo(
    () => [
      { key: "/", icon: <RadarChartOutlined />, label: "Dashboard" },
      { key: "/llm-configs", icon: <SettingOutlined />, label: "LLM Configs" },
      { key: "/templates", icon: <TeamOutlined />, label: "Participants" },
      { key: "/surveys", icon: <FileTextOutlined />, label: "Surveys" },
      { key: "/mock-runs", icon: <ExperimentOutlined />, label: "Mock Runs" },
      { key: "/reports", icon: <DatabaseOutlined />, label: "Reports & Exports" },
    ],
    [],
  );

  return (
    <Layout className="app-shell">
      <Sider width={260} theme="dark" style={{ background: "rgba(8,8,8,.72)", borderRight: "1px solid rgba(215,185,143,.12)" }}>
        <div className="sider-brand">
          <div className="brand-title">FormAgents</div>
          <div className="brand-subtitle">Synthetic survey studio</div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname === "/" ? "/" : `/${location.pathname.split("/")[1]}`]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ background: "transparent", borderInlineEnd: "none", marginTop: 12 }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: "transparent", borderBottom: "1px solid rgba(215,185,143,.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Space direction="vertical" size={0}>
            <Typography.Text style={{ color: "rgba(244,237,225,.68)", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase" }}>
              Local AI Survey Lab
            </Typography.Text>
            <Typography.Text style={{ color: "#f4ede1", fontSize: 16 }}>{user?.email}</Typography.Text>
          </Space>
          <Button
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </Header>
        <Content className="page-wrap">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
