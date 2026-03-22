import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { ATTRIBUTE_KEYS, ATTRIBUTE_VALUE_PRESETS, MULTI_VALUE_ATTRIBUTES, type ConditionExpression, type ParticipantRuleInput } from "@surveysim/shared";
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

function parseConditionValue(value: string) {
  return value.includes(",") ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
}

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) return value.join(",");
  if (value == null) return "";
  return String(value);
}

function toScopeGroup(scope: ConditionExpression | undefined, defaultField: string): Extract<ConditionExpression, { type: "group" }> {
  if (!scope) {
    return { type: "group", combinator: "AND", children: [] };
  }

  if (scope.type === "group") {
    return {
      type: "group",
      combinator: scope.combinator ?? "AND",
      children: Array.isArray(scope.children) ? scope.children : [],
    };
  }

  return {
    type: "group",
    combinator: "AND",
    children: [scope.field ? scope : createLeafCondition(defaultField)],
  };
}

function normalizeDistribution(rule: ParticipantRuleInput, attribute: string) {
  if (rule.assignment.mode !== "distribution") {
    return undefined;
  }

  const distribution = Array.isArray(rule.assignment.distribution) ? rule.assignment.distribution : [];
  if (distribution.length) {
    return distribution;
  }

  const presets = ATTRIBUTE_VALUE_PRESETS[attribute] ?? [];
  return [
    {
      value: presets[0]?.value ?? "segment_a",
      percentage: 50,
      label: presets[0]?.label,
    },
    {
      value: presets[1]?.value ?? "segment_b",
      percentage: 50,
      label: presets[1]?.label,
    },
  ];
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

  const getValueOptions = (attribute: string) => ATTRIBUTE_VALUE_PRESETS[attribute] ?? [];
  const isMultiValueAttribute = (attribute: string) => MULTI_VALUE_ATTRIBUTES.includes(attribute as (typeof MULTI_VALUE_ATTRIBUTES)[number]);

  const updateRule = (index: number, patch: Partial<ParticipantRuleInput>) => {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const updateScopeLeaf = (index: number, conditionIndex: number, patch: Partial<ConditionExpression>) => {
    const next = [...value];
    const scope = toScopeGroup(next[index].scope, defaultAttribute);
    const children = [...scope.children];
    children[conditionIndex] = { ...(children[conditionIndex] as ConditionExpression), ...patch } as ConditionExpression;
    next[index] = { ...next[index], scope: { ...scope, children } };
    onChange(next);
  };

  const addCondition = (index: number) => {
    const next = [...value];
    const scope = toScopeGroup(next[index].scope, defaultAttribute);
    next[index] = { ...next[index], scope: { ...scope, children: [...scope.children, createLeafCondition(defaultAttribute)] } };
    onChange(next);
  };

  const removeCondition = (index: number, conditionIndex: number) => {
    const next = [...value];
    const scope = next[index].scope ? toScopeGroup(next[index].scope, defaultAttribute) : undefined;
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

  const updateDistributionItem = (
    ruleIndex: number,
    itemIndex: number,
    patch: Partial<NonNullable<ParticipantRuleInput["assignment"]["distribution"]>[number]>,
  ) => {
    const next = [...value];
    const distribution = [...(next[ruleIndex].assignment.distribution ?? [])];
    distribution[itemIndex] = { ...distribution[itemIndex], ...patch };
    next[ruleIndex] = {
      ...next[ruleIndex],
      assignment: {
        ...next[ruleIndex].assignment,
        distribution,
      },
    };
    onChange(next);
  };

  const addDistributionItem = (ruleIndex: number) => {
    const next = [...value];
    const attribute = next[ruleIndex].assignment.attribute;
    const presets = getValueOptions(attribute);
    const fallback = presets[0]?.value ?? "segment";
    next[ruleIndex] = {
      ...next[ruleIndex],
      assignment: {
        ...next[ruleIndex].assignment,
        distribution: [
          ...(next[ruleIndex].assignment.distribution ?? []),
          {
            value: isMultiValueAttribute(attribute) ? [fallback] : fallback,
            percentage: 0,
            label: presets[0]?.label,
          },
        ],
      },
    };
    onChange(next);
  };

  const removeDistributionItem = (ruleIndex: number, itemIndex: number) => {
    const next = [...value];
    next[ruleIndex] = {
      ...next[ruleIndex],
      assignment: {
        ...next[ruleIndex].assignment,
        distribution: (next[ruleIndex].assignment.distribution ?? []).filter((_, index) => index !== itemIndex),
      },
    };
    onChange(next);
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={14}>
      {value.map((rule, index) => {
        const normalizedRule: ParticipantRuleInput = {
          ...rule,
          scope: rule.scope,
          assignment: {
            ...rule.assignment,
            attribute: rule.assignment.attribute || defaultAttribute,
            distribution: normalizeDistribution(rule, rule.assignment.attribute || defaultAttribute),
          },
        };
        const scope = toScopeGroup(normalizedRule.scope, defaultAttribute);
        return (
          <div key={`${normalizedRule.name}-${index}`} className="rule-card">
            <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
              <div>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                  {normalizedRule.name || t("ruleBuilder.rule", { index: index + 1 })}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {t("ruleBuilder.priority")}: {normalizedRule.priority}
                </Typography.Text>
              </div>
              <Button danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} />
            </Space>

            <Form layout="vertical" style={{ marginTop: 16 }}>
              <Form.Item label={t("ruleBuilder.ruleName")}>
                <Input value={normalizedRule.name} onChange={(event) => updateRule(index, { name: event.target.value })} />
              </Form.Item>
              <Space style={{ width: "100%" }} align="start" wrap>
                <Form.Item label={t("ruleBuilder.enabled")}>
                  <Switch checked={normalizedRule.enabled} onChange={(checked) => updateRule(index, { enabled: checked })} />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.priority")}>
                  <InputNumber min={0} max={1000} value={normalizedRule.priority} onChange={(nextValue) => updateRule(index, { priority: nextValue ?? 0 })} />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.targetAttribute")}>
                  <Select
                    value={normalizedRule.assignment.attribute}
                    style={{ width: 180 }}
                    options={resolvedAttributeOptions.map((option) => ({ label: t(`attributes.${option}`), value: option }))}
                    onChange={(attribute) =>
                      updateRule(index, {
                        assignment: {
                          ...normalizedRule.assignment,
                          attribute,
                          distribution:
                            normalizedRule.assignment.mode === "distribution"
                              ? (normalizedRule.assignment.distribution ?? []).map((item, itemIndex) => ({
                                  ...item,
                                  value: isMultiValueAttribute(attribute)
                                    ? Array.isArray(item.value)
                                      ? item.value
                                      : [String(item.value)]
                                    : Array.isArray(item.value)
                                      ? item.value[0] ?? getValueOptions(attribute)[0]?.value ?? `segment_${itemIndex + 1}`
                                      : item.value,
                                }))
                              : normalizedRule.assignment.distribution,
                        },
                      })
                    }
                  />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.assignmentMode")}>
                  <Select
                    value={normalizedRule.assignment.mode}
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
                                ...normalizedRule.assignment,
                                mode,
                                fixedValue: stringifyValue(normalizedRule.assignment.fixedValue) || "",
                                distribution: undefined,
                              }
                            : {
                                ...normalizedRule.assignment,
                                mode,
                                distribution:
                                  normalizedRule.assignment.distribution?.length
                                    ? normalizedRule.assignment.distribution
                                    : [
                                        { value: getValueOptions(normalizedRule.assignment.attribute)[0]?.value ?? "segment_a", percentage: 50, label: getValueOptions(normalizedRule.assignment.attribute)[0]?.label },
                                        { value: getValueOptions(normalizedRule.assignment.attribute)[1]?.value ?? "segment_b", percentage: 50, label: getValueOptions(normalizedRule.assignment.attribute)[1]?.label },
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

              {normalizedRule.assignment.mode === "fixed" ? (
                <Form.Item label={t("ruleBuilder.fixedValue")} style={{ marginTop: 12 }}>
                  <Input
                    value={stringifyValue(normalizedRule.assignment.fixedValue)}
                    onChange={(event) =>
                      updateRule(index, {
                        assignment: { ...normalizedRule.assignment, fixedValue: parseConditionValue(event.target.value) },
                      })
                    }
                  />
                </Form.Item>
              ) : (
                <Form.Item label={t("ruleBuilder.distribution")} style={{ marginTop: 12 }}>
                  <Space direction="vertical" style={{ width: "100%" }} size={10}>
                    {(normalizedRule.assignment.distribution ?? []).map((item, itemIndex) => (
                      <div key={`${normalizedRule.assignment.attribute}_${itemIndex}`} className="condition-row">
                        <Select
                          mode={isMultiValueAttribute(normalizedRule.assignment.attribute) ? "multiple" : undefined}
                          value={item.value}
                          options={getValueOptions(normalizedRule.assignment.attribute)}
                          placeholder={t("ruleBuilder.distributionValue")}
                          onChange={(nextValue, selectedOptions) =>
                            updateDistributionItem(index, itemIndex, {
                              value: nextValue as string | string[],
                              label: Array.isArray(selectedOptions)
                                ? selectedOptions.map((option) => ("label" in option ? String(option.label) : "")).filter(Boolean).join(", ")
                                : "label" in (selectedOptions ?? {}) ? String((selectedOptions as { label?: string }).label) : undefined,
                            })
                          }
                        />
                        <InputNumber
                          min={0}
                          max={100}
                          value={item.percentage}
                          style={{ width: "100%" }}
                          placeholder={t("ruleBuilder.distributionPercentage")}
                          onChange={(percentage) => updateDistributionItem(index, itemIndex, { percentage: percentage ?? 0 })}
                        />
                        <Input
                          value={item.label}
                          placeholder={t("ruleBuilder.distributionLabel")}
                          onChange={(event) => updateDistributionItem(index, itemIndex, { label: event.target.value || undefined })}
                        />
                        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeDistributionItem(index, itemIndex)} />
                      </div>
                    ))}
                    <div className="subtle-help">{t("ruleBuilder.distributionHint")}</div>
                    <Button icon={<PlusOutlined />} onClick={() => addDistributionItem(index)}>
                      {t("ruleBuilder.addDistributionItem")}
                    </Button>
                  </Space>
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
                  { value: getValueOptions(defaultAttribute)[0]?.value ?? "segment_a", percentage: 50, label: getValueOptions(defaultAttribute)[0]?.label },
                  { value: getValueOptions(defaultAttribute)[1]?.value ?? "segment_b", percentage: 50, label: getValueOptions(defaultAttribute)[1]?.label },
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
