import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { App, Button, Card, Col, Form, Input, Row, Tabs, Typography } from "antd";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  loginInputSchema,
  registerInputSchema,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from "@formagents/shared";
import { apiClient } from "@/api/client";
import { authStore } from "@/stores/auth.store";

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

  const submit = async (mode: "login" | "register", values: LoginInput | RegisterInput) => {
    const result = await apiClient.post<AuthResponse>(`/auth/${mode}`, values);
    setSession(result.token, result.user);
    message.success(mode === "login" ? "Welcome back" : "Account created");
    navigate("/");
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
                  children: (
                    <Form
                      layout="vertical"
                      onFinish={loginForm.handleSubmit((values) => submit("login", values))}
                    >
                      <Form.Item
                        label="Email"
                        validateStatus={loginForm.formState.errors.email ? "error" : ""}
                        help={loginForm.formState.errors.email?.message}
                      >
                        <Input prefix={<MailOutlined />} {...loginForm.register("email")} />
                      </Form.Item>
                      <Form.Item
                        label="Password"
                        validateStatus={loginForm.formState.errors.password ? "error" : ""}
                        help={loginForm.formState.errors.password?.message}
                      >
                        <Input.Password
                          prefix={<LockOutlined />}
                          {...loginForm.register("password")}
                        />
                      </Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={loginForm.formState.isSubmitting}
                      >
                        Login
                      </Button>
                    </Form>
                  ),
                },
                {
                  key: "register",
                  label: "Register",
                  children: (
                    <Form
                      layout="vertical"
                      onFinish={registerForm.handleSubmit((values) => submit("register", values))}
                    >
                      <Form.Item
                        label="Email"
                        validateStatus={registerForm.formState.errors.email ? "error" : ""}
                        help={registerForm.formState.errors.email?.message}
                      >
                        <Input prefix={<MailOutlined />} {...registerForm.register("email")} />
                      </Form.Item>
                      <Form.Item
                        label="Password"
                        validateStatus={registerForm.formState.errors.password ? "error" : ""}
                        help={registerForm.formState.errors.password?.message}
                      >
                        <Input.Password
                          prefix={<LockOutlined />}
                          {...registerForm.register("password")}
                        />
                      </Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={registerForm.formState.isSubmitting}
                      >
                        Create account
                      </Button>
                    </Form>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
