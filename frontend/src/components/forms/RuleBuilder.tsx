import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { ATTRIBUTE_KEYS, type ConditionExpression, type ParticipantRuleInput } from "@formagents/shared";
import { Button, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { useMemo } from "react";
import { useI18n } from "@/i18n/I18nProvider";

const builtinAttributeOptions = ATTRIBUTE_KEYS.filter((key) => key !== "noise");
const operatorOptions = [
  { label: "=", value: "eq" },
  { label: "!=", value: "neq" },
  { label: "in", value: "in" },
  { label: "not in", value: "not_in" },
  { label: "contains", value: "contains" },
  { label: ">", value: "gt" },
  { label: ">=", value: "gte" },
  { label: "<", value: "lt" },
  { label: "<=", value: "lte" },
] as const;

function createLeafCondition(defaultField: string): ConditionExpression {
  return { type: "leaf", field: defaultField, operator: "eq", value: "" };
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

function parseConditionValue(value: string) {
  return value.includes(",") ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
}

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) return value.join(",");
  if (value == null) return "";
  return String(value);
}

export function RuleBuilder({
  value,
  onChange,
  attributeOptions,
}: {
  value: ParticipantRuleInput[];
  onChange: (next: ParticipantRuleInput[]) => void;
  attributeOptions?: string[];
}) {
  const { t } = useI18n();
  const resolvedAttributeOptions = useMemo(() => {
    const merged = [...builtinAttributeOptions, ...(attributeOptions ?? [])]
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(merged));
  }, [attributeOptions]);
  const defaultAttribute = resolvedAttributeOptions[0] ?? "gender";

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
    next[index] = { ...next[index], scope: { ...scope, children: [...scope.children, createLeafCondition(defaultAttribute)] } };
    onChange(next);
  };

  const removeCondition = (index: number, conditionIndex: number) => {
    const next = [...value];
    const scope = next[index].scope as Extract<ConditionExpression, { type: "group" }> | undefined;
    if (!scope) return;
    const children = scope.children.filter((_: ConditionExpression, itemIndex: number) => itemIndex !== conditionIndex);
    next[index] = { ...next[index], scope: children.length ? { ...scope, children } : undefined };
    onChange(next);
  };

  const clearConditions = (index: number) => {
    const next = [...value];
    next[index] = { ...next[index], scope: undefined };
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
                  {rule.name || t("ruleBuilder.rule", { index: index + 1 })}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {t("ruleBuilder.priority")}: {rule.priority}
                </Typography.Text>
              </div>
              <Button danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} />
            </Space>

            <Form layout="vertical" style={{ marginTop: 16 }}>
              <Form.Item label={t("ruleBuilder.ruleName")}>
                <Input value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} />
              </Form.Item>
              <Space style={{ width: "100%" }} align="start" wrap>
                <Form.Item label={t("ruleBuilder.enabled")}>
                  <Switch checked={rule.enabled} onChange={(checked) => updateRule(index, { enabled: checked })} />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.priority")}>
                  <InputNumber min={0} max={1000} value={rule.priority} onChange={(nextValue) => updateRule(index, { priority: nextValue ?? 0 })} />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.targetAttribute")}>
                  <Select
                    value={rule.assignment.attribute}
                    style={{ width: 180 }}
                    options={resolvedAttributeOptions.map((option) => ({ label: t(`attributes.${option}`), value: option }))}
                    onChange={(attribute) => updateRule(index, { assignment: { ...rule.assignment, attribute } })}
                  />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.assignmentMode")}>
                  <Select
                    value={rule.assignment.mode}
                    style={{ width: 160 }}
                    options={[
                      { label: t("ruleBuilder.distributionMode"), value: "distribution" },
                      { label: t("ruleBuilder.fixedMode"), value: "fixed" },
                    ]}
                    onChange={(mode) =>
                      updateRule(index, {
                        assignment:
                          mode === "fixed"
                            ? {
                                ...rule.assignment,
                                mode,
                                fixedValue: stringifyValue(rule.assignment.fixedValue) || "",
                                distribution: undefined,
                              }
                            : {
                                ...rule.assignment,
                                mode,
                                distribution:
                                  rule.assignment.distribution?.length
                                    ? rule.assignment.distribution
                                    : [
                                        { value: "segment_a", percentage: 50 },
                                        { value: "segment_b", percentage: 50 },
                                      ],
                                fixedValue: undefined,
                              },
                      })
                    }
                  />
                </Form.Item>
              </Space>

              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                <Space align="center" style={{ justifyContent: "space-between", width: "100%" }} wrap>
                  <div>
                    <Typography.Text strong>{t("ruleBuilder.scopeCombinator")}</Typography.Text>
                    <div className="subtle-help">
                      {scope.children.length ? t("ruleBuilder.scopeHint") : t("ruleBuilder.appliesToAll")}
                    </div>
                  </div>
                  <Space wrap>
                    {scope.children.length ? (
                      <>
                        <Select
                          value={scope.combinator}
                          style={{ width: 160 }}
                          options={[
                            { label: "AND", value: "AND" },
                            { label: "OR", value: "OR" },
                          ]}
                          onChange={(combinator) => updateRule(index, { scope: { ...scope, combinator, children: scope.children } })}
                        />
                        <Button onClick={() => clearConditions(index)}>{t("ruleBuilder.clearConditions")}</Button>
                      </>
                    ) : null}
                    <Button icon={<PlusOutlined />} onClick={() => addCondition(index)}>
                      {t("ruleBuilder.addCondition")}
                    </Button>
                  </Space>
                </Space>

                {scope.children.map((child: ConditionExpression, conditionIndex: number) => (
                  <div key={conditionIndex} className="condition-row">
                    <Select
                      value={child.field}
                      options={resolvedAttributeOptions.map((option) => ({ label: t(`attributes.${option}`), value: option }))}
                      onChange={(field) => updateScopeLeaf(index, conditionIndex, { field } as Partial<ConditionExpression>)}
                    />
                    <Select
                      value={child.operator}
                      options={operatorOptions.map((option) => ({ label: option.label, value: option.value }))}
                      onChange={(operator) => updateScopeLeaf(index, conditionIndex, { operator } as Partial<ConditionExpression>)}
                    />
                    <Input
                      value={stringifyValue(child.value)}
                      placeholder={t("ruleBuilder.valueInput")}
                      onChange={(event) => updateScopeLeaf(index, conditionIndex, { value: parseConditionValue(event.target.value) } as Partial<ConditionExpression>)}
                    />
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => removeCondition(index, conditionIndex)}
                      aria-label={t("ruleBuilder.removeCondition")}
                    />
                  </div>
                ))}
              </Space>

              {rule.assignment.mode === "fixed" ? (
                <Form.Item label={t("ruleBuilder.fixedValue")} style={{ marginTop: 12 }}>
                  <Input
                    value={stringifyValue(rule.assignment.fixedValue)}
                    onChange={(event) =>
                      updateRule(index, {
                        assignment: { ...rule.assignment, fixedValue: parseConditionValue(event.target.value) },
                      })
                    }
                  />
                </Form.Item>
              ) : (
                <Form.Item label={t("ruleBuilder.distribution")} style={{ marginTop: 12 }}>
                  <Input.TextArea
                    rows={5}
                    value={distributionToText(rule)}
                    onChange={(event) => updateRule(index, { assignment: { ...rule.assignment, distribution: parseDistribution(event.target.value) } })}
                  />
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
              name: t("ruleBuilder.rule", { index: value.length + 1 }),
              enabled: true,
              priority: 100,
              scope: { type: "group", combinator: "AND", children: [createLeafCondition(defaultAttribute)] },
              assignment: {
                attribute: defaultAttribute,
                mode: "distribution",
                distribution: [
                  { value: "segment_a", percentage: 50 },
                  { value: "segment_b", percentage: 50 },
                ],
              },
            },
          ])
        }
      >
        {t("ruleBuilder.addRule")}
      </Button>
    </Space>
  );
}
