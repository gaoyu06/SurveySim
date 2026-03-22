import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  humanizeParticipantAttributeKey,
  resolveParticipantAttributeDefinition,
  type ConditionExpression,
  type ParticipantAttributeDefinitionDto,
  type ParticipantRuleInput,
} from "@surveysim/shared";
import { Button, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { useMemo } from "react";
import { useI18n } from "@/i18n/I18nProvider";

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

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) return value.join(",");
  if (value == null) return "";
  return String(value);
}

function parseTextValue(value: string, multiple: boolean) {
  if (!multiple) return value;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function isListOperator(operator: ConditionExpression["operator"]) {
  return operator === "in" || operator === "not_in" || operator === "contains";
}

function toArrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value)];
}

function toScalarValue(value: unknown) {
  if (Array.isArray(value)) return value[0] == null ? "" : String(value[0]);
  if (value == null) return "";
  return String(value);
}

function normalizeConditionValue(value: unknown, operator: ConditionExpression["operator"]) {
  return isListOperator(operator) ? toArrayValue(value) : toScalarValue(value);
}

function fallbackAttribute(key: string): ParticipantAttributeDefinitionDto {
  return {
    key,
    displayName: humanizeParticipantAttributeKey(key),
    valueType: "single",
    presetValues: [],
    builtin: false,
  };
}

function normalizeAttributeValue(value: unknown, attribute: ParticipantAttributeDefinitionDto | undefined, multipleOverride?: boolean) {
  const multiple = multipleOverride ?? attribute?.valueType === "multi";
  return multiple ? toArrayValue(value) : toScalarValue(value);
}

function createDefaultDistribution(attribute: ParticipantAttributeDefinitionDto | undefined) {
  const presets = attribute?.presetValues ?? [];
  const isMulti = attribute?.valueType === "multi";
  return [
    {
      value: isMulti ? [presets[0]?.value ?? "segment_a"] : presets[0]?.value ?? "segment_a",
      percentage: 50,
      label: presets[0]?.label,
    },
    {
      value: isMulti ? [presets[1]?.value ?? "segment_b"] : presets[1]?.value ?? "segment_b",
      percentage: 50,
      label: presets[1]?.label,
    },
  ];
}

function normalizeDistribution(rule: ParticipantRuleInput, attribute: ParticipantAttributeDefinitionDto | undefined) {
  if (rule.assignment.mode !== "distribution") return undefined;
  const distribution = Array.isArray(rule.assignment.distribution) ? rule.assignment.distribution : [];
  return distribution.length ? distribution : createDefaultDistribution(attribute);
}

export function RuleBuilderV2({
  value,
  onChange,
  attributes,
}: {
  value: ParticipantRuleInput[];
  onChange: (next: ParticipantRuleInput[]) => void;
  attributes?: ParticipantAttributeDefinitionDto[];
}) {
  const { t } = useI18n();

  const resolvedAttributes = useMemo(() => {
    const usable = (attributes ?? []).filter((attribute) => attribute.key !== "noise");
    if (usable.length) return usable;
    return [resolveParticipantAttributeDefinition([], "gender") ?? fallbackAttribute("gender")];
  }, [attributes]);

  const attributeMap = useMemo(
    () => new Map(resolvedAttributes.map((attribute) => [attribute.key, attribute] as const)),
    [resolvedAttributes],
  );

  const defaultAttributeKey = resolvedAttributes[0]?.key ?? "gender";

  const getAttribute = (key: string) =>
    attributeMap.get(key) ?? resolveParticipantAttributeDefinition(resolvedAttributes, key) ?? fallbackAttribute(key);

  const formatAttributeLabel = (attribute: ParticipantAttributeDefinitionDto | undefined) => {
    const resolved = attribute ?? fallbackAttribute(defaultAttributeKey);
    const translationKey = `attributes.${resolved.key}`;
    const translated = t(translationKey);
    return translated === translationKey ? resolved.displayName : translated;
  };

  const updateRule = (index: number, patch: Partial<ParticipantRuleInput>) => {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const updateScopeLeaf = (index: number, conditionIndex: number, patch: Partial<ConditionExpression>) => {
    const next = [...value];
    const scope = toScopeGroup(next[index].scope, defaultAttributeKey);
    const children = [...scope.children];
    children[conditionIndex] = { ...(children[conditionIndex] as ConditionExpression), ...patch } as ConditionExpression;
    next[index] = { ...next[index], scope: { ...scope, children } };
    onChange(next);
  };

  const addCondition = (index: number) => {
    const next = [...value];
    const scope = toScopeGroup(next[index].scope, defaultAttributeKey);
    next[index] = { ...next[index], scope: { ...scope, children: [...scope.children, createLeafCondition(defaultAttributeKey)] } };
    onChange(next);
  };

  const removeCondition = (index: number, conditionIndex: number) => {
    const next = [...value];
    const scope = next[index].scope ? toScopeGroup(next[index].scope, defaultAttributeKey) : undefined;
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
    const attribute = getAttribute(next[ruleIndex].assignment.attribute);
    const firstPreset = attribute.presetValues[0];
    next[ruleIndex] = {
      ...next[ruleIndex],
      assignment: {
        ...next[ruleIndex].assignment,
        distribution: [
          ...(next[ruleIndex].assignment.distribution ?? []),
          {
            value: attribute.valueType === "multi" ? [firstPreset?.value ?? "segment"] : firstPreset?.value ?? "segment",
            percentage: 0,
            label: firstPreset?.label,
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
        const targetAttribute = getAttribute(rule.assignment.attribute || defaultAttributeKey);
        const normalizedRule: ParticipantRuleInput = {
          ...rule,
          assignment: {
            ...rule.assignment,
            attribute: rule.assignment.attribute || defaultAttributeKey,
            distribution: normalizeDistribution(rule, targetAttribute),
          },
        };
        const scope = toScopeGroup(normalizedRule.scope, defaultAttributeKey);

        return (
          <div key={`${normalizedRule.name}-${index}`} className="rule-card">
            <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
              <div>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                  {normalizedRule.name || t("ruleBuilder.rule", { index: index + 1 })}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {formatAttributeLabel(targetAttribute)} · {t("ruleBuilder.priority")}: {normalizedRule.priority}
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
                    style={{ width: 220 }}
                    options={resolvedAttributes.map((attribute) => ({ label: formatAttributeLabel(attribute), value: attribute.key }))}
                    onChange={(attributeKey) => {
                      const nextAttribute = getAttribute(attributeKey);
                      updateRule(index, {
                        assignment:
                          normalizedRule.assignment.mode === "distribution"
                            ? {
                                ...normalizedRule.assignment,
                                attribute: attributeKey,
                                distribution: createDefaultDistribution(nextAttribute),
                              }
                            : {
                                ...normalizedRule.assignment,
                                attribute: attributeKey,
                                fixedValue: normalizeAttributeValue(undefined, nextAttribute),
                              },
                      });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("ruleBuilder.assignmentMode")}>
                  <Select
                    value={normalizedRule.assignment.mode}
                    style={{ width: 180 }}
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
                                fixedValue: normalizeAttributeValue(normalizedRule.assignment.fixedValue, targetAttribute),
                                distribution: undefined,
                              }
                            : {
                                ...normalizedRule.assignment,
                                mode,
                                distribution: createDefaultDistribution(targetAttribute),
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

                {scope.children.map((child: ConditionExpression, conditionIndex: number) => {
                  const leaf = child.type === "leaf" ? child : createLeafCondition(defaultAttributeKey);
                  const conditionAttribute = getAttribute(leaf.field || defaultAttributeKey);
                  const multipleConditionValue = conditionAttribute.valueType === "multi" || isListOperator(leaf.operator);
                  const presetOptions = conditionAttribute.presetValues.map((preset) => ({ label: preset.label, value: preset.value }));

                  return (
                    <div key={conditionIndex} className="condition-row">
                      <Select
                        value={leaf.field}
                        options={resolvedAttributes.map((attribute) => ({ label: formatAttributeLabel(attribute), value: attribute.key }))}
                        onChange={(field) => {
                          const nextAttribute = getAttribute(field);
                          const nextOperator = nextAttribute.valueType === "multi" ? "contains" : "eq";
                          updateScopeLeaf(index, conditionIndex, {
                            field,
                            operator: nextOperator,
                            value: nextAttribute.valueType === "multi" ? [] : "",
                          } as Partial<ConditionExpression>);
                        }}
                      />
                      <Select
                        value={leaf.operator}
                        options={operatorOptions.map((option) => ({ label: option.label, value: option.value }))}
                        onChange={(operator) =>
                          updateScopeLeaf(index, conditionIndex, {
                            operator,
                            value: normalizeConditionValue(leaf.value, operator),
                          } as Partial<ConditionExpression>)
                        }
                      />
                      {presetOptions.length ? (
                        <Select
                          mode={multipleConditionValue ? "multiple" : undefined}
                          value={normalizeAttributeValue(leaf.value, conditionAttribute, multipleConditionValue)}
                          options={presetOptions}
                          placeholder={t("ruleBuilder.valueInput")}
                          onChange={(nextValue) =>
                            updateScopeLeaf(index, conditionIndex, {
                              value: multipleConditionValue ? toArrayValue(nextValue) : toScalarValue(nextValue),
                            } as Partial<ConditionExpression>)
                          }
                        />
                      ) : (
                        <Input
                          value={stringifyValue(normalizeConditionValue(leaf.value, leaf.operator))}
                          placeholder={t("ruleBuilder.valueInput")}
                          onChange={(event) =>
                            updateScopeLeaf(index, conditionIndex, {
                              value: parseTextValue(event.target.value, multipleConditionValue),
                            } as Partial<ConditionExpression>)
                          }
                        />
                      )}
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => removeCondition(index, conditionIndex)}
                        aria-label={t("ruleBuilder.removeCondition")}
                      />
                    </div>
                  );
                })}
              </Space>

              {normalizedRule.assignment.mode === "fixed" ? (
                <Form.Item label={t("ruleBuilder.fixedValue")} style={{ marginTop: 12 }}>
                  {targetAttribute.presetValues.length ? (
                    <Select
                      mode={targetAttribute.valueType === "multi" ? "multiple" : undefined}
                      value={normalizeAttributeValue(normalizedRule.assignment.fixedValue, targetAttribute)}
                      options={targetAttribute.presetValues.map((preset) => ({ label: preset.label, value: preset.value }))}
                      placeholder={t("ruleBuilder.fixedValue")}
                      onChange={(nextValue) =>
                        updateRule(index, {
                          assignment: {
                            ...normalizedRule.assignment,
                            fixedValue: targetAttribute.valueType === "multi" ? toArrayValue(nextValue) : toScalarValue(nextValue),
                          },
                        })
                      }
                    />
                  ) : (
                    <Input
                      value={stringifyValue(normalizedRule.assignment.fixedValue)}
                      placeholder={t("ruleBuilder.fixedValue")}
                      onChange={(event) =>
                        updateRule(index, {
                          assignment: {
                            ...normalizedRule.assignment,
                            fixedValue: parseTextValue(event.target.value, targetAttribute.valueType === "multi"),
                          },
                        })
                      }
                    />
                  )}
                </Form.Item>
              ) : (
                <Form.Item label={t("ruleBuilder.distribution")} style={{ marginTop: 12 }}>
                  <Space direction="vertical" style={{ width: "100%" }} size={10}>
                    {(normalizedRule.assignment.distribution ?? []).map((item, itemIndex) => (
                      <div key={`${normalizedRule.assignment.attribute}_${itemIndex}`} className="condition-row">
                        {targetAttribute.presetValues.length ? (
                          <Select
                            mode={targetAttribute.valueType === "multi" ? "multiple" : undefined}
                            value={normalizeAttributeValue(item.value, targetAttribute)}
                            options={targetAttribute.presetValues.map((preset) => ({ label: preset.label, value: preset.value }))}
                            placeholder={t("ruleBuilder.distributionValue")}
                            onChange={(nextValue) => {
                              const selectedValues = targetAttribute.valueType === "multi" ? toArrayValue(nextValue) : toScalarValue(nextValue);
                              const labels = targetAttribute.presetValues
                                .filter((preset) =>
                                  Array.isArray(selectedValues) ? selectedValues.includes(preset.value) : preset.value === selectedValues,
                                )
                                .map((preset) => preset.label)
                                .join(", ");
                              updateDistributionItem(index, itemIndex, {
                                value: selectedValues,
                                label: labels || item.label,
                              });
                            }}
                          />
                        ) : (
                          <Input
                            value={stringifyValue(item.value)}
                            placeholder={t("ruleBuilder.distributionValue")}
                            onChange={(event) =>
                              updateDistributionItem(index, itemIndex, {
                                value: parseTextValue(event.target.value, targetAttribute.valueType === "multi"),
                              })
                            }
                          />
                        )}
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
              scope: { type: "group", combinator: "AND", children: [createLeafCondition(defaultAttributeKey)] },
              assignment: {
                attribute: defaultAttributeKey,
                mode: "distribution",
                distribution: createDefaultDistribution(getAttribute(defaultAttributeKey)),
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
