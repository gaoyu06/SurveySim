import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { App, Button, Card, Col, Form, Input, Row, Tabs, Typography } from "antd";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  loginInputSchema,
  registerInputSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from "@formagents/shared";
import { ApiError, apiClient } from "@/api/client";
import { authStore } from "@/stores/auth.store";

type AuthFormValues = LoginInput | RegisterInput;

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = authStore((state) => state.setSession);
  const { message } = App.useApp();

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: "", password: "" },
  });
  const registerForm = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = async (mode: "login" | "register", values: AuthFormValues) => {
    try {
      const result = await apiClient.post<AuthResponse>(`/auth/${mode}`, values);
      setSession(result.token, result.user);
      message.success(mode === "login" ? "Welcome back" : "Account created");
      navigate("/");
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Request failed";
      message.error(errorMessage);
    }
  };

  const renderAuthForm = (mode: "login" | "register", form: UseFormReturn<AuthFormValues>) => {
    return (
      <form onSubmit={form.handleSubmit((values) => submit(mode, values))} noValidate>
        <Form layout="vertical" component={false}>
          <Form.Item
            label="Email"
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
            label="Password"
            validateStatus={form.formState.errors.password ? "error" : ""}
            help={form.formState.errors.password?.message ?? "Use at least 8 characters"}
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
            {mode === "login" ? "Login" : "Create account"}
          </Button>
        </Form>
      </form>
    );
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Row gutter={24} style={{ width: "min(1120px, 100%)" }}>
        <Col xs={24} lg={13}>
          <div style={{ padding: "28px 12px" }}>
            <div className="brand-subtitle">Synthetic survey operating system</div>
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
              Configure people. Structure chaos. Generate answers at scale.
            </Typography.Title>
            <Typography.Paragraph
              style={{ color: "rgba(244,237,225,.72)", fontSize: 17, maxWidth: 640 }}
            >
              Build complex respondent populations, convert messy questionnaire text into
              structured schemas, run AI mock batches, and explore statistically rich reports in
              one local-first workspace.
            </Typography.Paragraph>
          </div>
        </Col>
        <Col xs={24} lg={11}>
          <Card className="panel" style={{ borderRadius: 24, background: "rgba(255,255,255,0.04)" }}>
            <Tabs
              items={[
                {
                  key: "login",
                  label: "Login",
                  children: renderAuthForm("login", loginForm as UseFormReturn<AuthFormValues>),
                },
                {
                  key: "register",
                  label: "Register",
                  children: renderAuthForm("register", registerForm as UseFormReturn<AuthFormValues>),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
