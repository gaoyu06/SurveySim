import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Card, Col, Form, Input, Row, Tabs, Typography } from "antd";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  loginInputSchema,
  registerInputSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from "@surveysim/shared";
import { ApiError, apiClient } from "@/api/client";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";

type AuthFormValues = LoginInput | RegisterInput;
type AuthMode = "login" | "register" | "bootstrap";

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const setSession = authStore((state) => state.setSession);
  const { message } = App.useApp();
  const bootstrapQuery = useQuery({
    queryKey: ["auth-bootstrap"],
    queryFn: () => apiClient.get<{ canBootstrap: boolean }>("/auth/bootstrap"),
  });

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: "", password: "" },
  });
  const registerForm = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = async (mode: AuthMode, values: AuthFormValues) => {
    try {
      const path = mode === "bootstrap" ? "/auth/bootstrap" : `/auth/${mode}`;
      const result = await apiClient.post<AuthResponse>(path, values);
      setSession(result.token, result.user);
      if (mode === "login") {
        message.success(t("login.successLogin"));
      } else if (mode === "bootstrap") {
        message.success(t("login.successBootstrap"));
      } else {
        message.success(t("login.successRegister"));
      }
      navigate("/");
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : t("login.requestFailed");
      message.error(errorMessage);
    }
  };

  const renderAuthForm = (mode: AuthMode, form: UseFormReturn<AuthFormValues>) => {
    return (
      <form onSubmit={form.handleSubmit((values) => submit(mode, values))} noValidate>
        <Form layout="vertical" component={false}>
          <Form.Item
            label={t("login.email")}
            validateStatus={form.formState.errors.email ? "error" : ""}
            help={form.formState.errors.email?.message}
          >
            <Controller
              name="email"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  value={field.value ?? ""}
                  autoComplete="email"
                  prefix={<MailOutlined />}
                />
              )}
            />
          </Form.Item>
          <Form.Item
            label={t("login.password")}
            validateStatus={form.formState.errors.password ? "error" : ""}
            help={form.formState.errors.password?.message ?? t("login.passwordHint")}
          >
            <Controller
              name="password"
              control={form.control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  value={field.value ?? ""}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  prefix={<LockOutlined />}
                />
              )}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={form.formState.isSubmitting}
          >
            {mode === "login" ? t("login.submitLogin") : mode === "bootstrap" ? t("login.submitBootstrap") : t("login.submitRegister")}
          </Button>
        </Form>
      </form>
    );
  };

  const canBootstrap = bootstrapQuery.data?.canBootstrap ?? false;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Row gutter={24} style={{ width: "min(1120px, 100%)" }}>
        <Col xs={24} lg={13}>
          <div style={{ padding: "28px 12px" }}>
            <div className="brand-subtitle">{t("login.heroBadge")}</div>
            <Typography.Title
              style={{
                fontSize: 64,
                lineHeight: 0.92,
                color: "#f4ede1",
                marginTop: 18,
                marginBottom: 18,
                fontFamily: '"Fraunces", serif',
              }}
            >
              {t("login.heroTitle")}
            </Typography.Title>
            <Typography.Paragraph
              style={{ color: "rgba(226,232,240,.72)", fontSize: 17, maxWidth: 640 }}
            >
              {t("login.heroSubtitle")}
            </Typography.Paragraph>
          </div>
        </Col>
        <Col xs={24} lg={11}>
          <Card className="panel" style={{ borderRadius: 24, background: "rgba(15,23,42,0.55)" }}>
            {canBootstrap ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                {t("login.bootstrapHint")}
              </Typography.Paragraph>
            ) : null}
            <Tabs
              items={[
                {
                  key: "login",
                  label: t("login.tabLogin"),
                  children: renderAuthForm("login", loginForm as UseFormReturn<AuthFormValues>),
                },
                ...(canBootstrap
                  ? [
                      {
                        key: "bootstrap",
                        label: t("login.tabBootstrap"),
                        children: renderAuthForm("bootstrap", registerForm as UseFormReturn<AuthFormValues>),
                      },
                    ]
                  : [
                      {
                        key: "register",
                        label: t("login.tabRegister"),
                        children: renderAuthForm("register", registerForm as UseFormReturn<AuthFormValues>),
                      },
                    ]),
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
