import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import type { ConditionExpression, ParticipantRuleInput } from "@formagents/shared";

const attributeOptions = [
  "region",
  "country",
  "continent",
  "gender",
  "ageRange",
  "educationLevel",
  "occupation",
  "incomeRange",
  "interests",
  "maritalStatus",
  "customTags",
];

function createLeafCondition(): ConditionExpression {
  return { type: "leaf", field: "gender", operator: "eq", value: "female" };
}

function parseDistribution(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, percentage] = line.split(":").map((item) => item.trim());
      return { value, percentage: Number(percentage) };
    });
}

function distributionToText(rule: ParticipantRuleInput) {
  return (rule.assignment.distribution ?? [])
    .map((item) => `${Array.isArray(item.value) ? item.value.join("|") : item.value}: ${item.percentage}`)
    .join("\n");
}

export function RuleBuilder({ value, onChange }: { value: ParticipantRuleInput[]; onChange: (next: ParticipantRuleInput[]) => void }) {
  const updateRule = (index: number, patch: Partial<ParticipantRuleInput>) => {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const updateScopeLeaf = (index: number, conditionIndex: number, patch: Partial<ConditionExpression>) => {
    const next = [...value];
    const scope = (next[index].scope as Extract<ConditionExpression, { type: "group" }>) ?? { type: "group", combinator: "AND", children: [] };
    const children = [...scope.children];
    children[conditionIndex] = { ...(children[conditionIndex] as ConditionExpression), ...patch } as ConditionExpression;
    next[index] = { ...next[index], scope: { ...scope, children } };
    onChange(next);
  };

  const addCondition = (index: number) => {
    const next = [...value];
    const scope = (next[index].scope as Extract<ConditionExpression, { type: "group" }>) ?? { type: "group", combinator: "AND", children: [] };
    next[index] = { ...next[index], scope: { ...scope, children: [...scope.children, createLeafCondition()] } };
    onChange(next);
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={14}>
      {value.map((rule, index) => {
        const scope = (rule.scope as Extract<ConditionExpression, { type: "group" }>) ?? { type: "group", combinator: "AND", children: [] };
        return (
          <div key={`${rule.name}-${index}`} className="rule-card">
            <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
              <div>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                  {rule.name || `Rule ${index + 1}`}
                </Typography.Title>
                <Typography.Text type="secondary">Priority {rule.priority}</Typography.Text>
              </div>
              <Button danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} />
            </Space>

            <Form layout="vertical" style={{ marginTop: 16 }}>
              <Form.Item label="Rule name">
                <Input value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} />
              </Form.Item>
              <Space style={{ width: "100%" }} align="start">
                <Form.Item label="Enabled">
                  <Switch checked={rule.enabled} onChange={(checked) => updateRule(index, { enabled: checked })} />
                </Form.Item>
                <Form.Item label="Priority">
                  <InputNumber min={0} max={1000} value={rule.priority} onChange={(value) => updateRule(index, { priority: value ?? 0 })} />
                </Form.Item>
                <Form.Item label="Target attribute">
                  <Select value={rule.assignment.attribute} style={{ width: 180 }} options={attributeOptions.map((option) => ({ label: option, value: option }))} onChange={(attribute) => updateRule(index, { assignment: { ...rule.assignment, attribute } })} />
                </Form.Item>
                <Form.Item label="Assignment mode">
                  <Select value={rule.assignment.mode} style={{ width: 160 }} options={[{ label: "Distribution", value: "distribution" }, { label: "Fixed", value: "fixed" }]} onChange={(mode) => updateRule(index, { assignment: { ...rule.assignment, mode } })} />
                </Form.Item>
              </Space>
              <Form.Item label="Scope combinator">
                <Select value={scope.combinator} style={{ width: 160 }} options={[{ label: "AND", value: "AND" }, { label: "OR", value: "OR" }]} onChange={(combinator) => updateRule(index, { scope: { ...scope, combinator, children: scope.children } })} />
              </Form.Item>
              <Space direction="vertical" style={{ width: "100%" }}>
                {scope.children.map((child: any, conditionIndex: number) => (
                  <Space key={conditionIndex} align="start" wrap>
                    <Select value={child.field} style={{ width: 150 }} options={attributeOptions.map((option) => ({ label: option, value: option }))} onChange={(field) => updateScopeLeaf(index, conditionIndex, { field } as Partial<ConditionExpression>)} />
                    <Select value={child.operator} style={{ width: 120 }} options={["eq", "neq", "in", "not_in", "contains"].map((option) => ({ label: option, value: option }))} onChange={(operator) => updateScopeLeaf(index, conditionIndex, { operator } as Partial<ConditionExpression>)} />
                    <Input value={Array.isArray(child.value) ? child.value.join(",") : String(child.value)} placeholder="value or comma list" onChange={(event) => updateScopeLeaf(index, conditionIndex, { value: event.target.value.includes(",") ? event.target.value.split(",").map((item) => item.trim()) : event.target.value } as Partial<ConditionExpression>)} />
                  </Space>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => addCondition(index)}>
                  Add condition
                </Button>
              </Space>
              {rule.assignment.mode === "fixed" ? (
                <Form.Item label="Fixed value" style={{ marginTop: 12 }}>
                  <Input value={typeof rule.assignment.fixedValue === "string" ? rule.assignment.fixedValue : Array.isArray(rule.assignment.fixedValue) ? rule.assignment.fixedValue.join(",") : String(rule.assignment.fixedValue ?? "")} onChange={(event) => updateRule(index, { assignment: { ...rule.assignment, fixedValue: event.target.value.includes(",") ? event.target.value.split(",").map((item) => item.trim()) : event.target.value } })} />
                </Form.Item>
              ) : (
                <Form.Item label="Distribution (one per line: value: percentage)" style={{ marginTop: 12 }}>
                  <Input.TextArea rows={5} value={distributionToText(rule)} onChange={(event) => updateRule(index, { assignment: { ...rule.assignment, distribution: parseDistribution(event.target.value) } })} />
                </Form.Item>
              )}
            </Form>
          </div>
        );
      })}

      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={() =>
          onChange([
            ...value,
            {
              name: `Rule ${value.length + 1}`,
              enabled: true,
              priority: 100,
              scope: { type: "group", combinator: "AND", children: [createLeafCondition()] },
              assignment: {
                attribute: "gender",
                mode: "distribution",
                distribution: [
                  { value: "female", percentage: 50 },
                  { value: "male", percentage: 50 },
                ],
              },
            },
          ])
        }
      >
        Add rule
      </Button>
    </Space>
  );
}
