import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp, theme } from "antd";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#3b82f6",
          colorInfo: "#3b82f6",
          colorSuccess: "#22c55e",
          colorWarning: "#f59e0b",
          colorError: "#ef4444",
          colorBgBase: "#09090b",
          colorTextBase: "#f8fafc",
          colorBorder: "rgba(148, 163, 184, 0.18)",
          borderRadius: 12,
          fontFamily: '"IBM Plex Sans", sans-serif',
        },
      }}
    >
      <AntApp>
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </QueryClientProvider>
        </I18nProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
