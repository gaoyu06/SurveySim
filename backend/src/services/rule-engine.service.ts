import { randomUUID } from "node:crypto";
import { resolveParticipantAttributeDefinition } from "@formagents/shared";
import type {
  ConditionExpression,
  ParticipantIdentity,
  ParticipantRuleInput,
  ParticipantTemplateDto,
  TemplatePreview,
} from "@formagents/shared";

interface GeneratedIdentity extends ParticipantIdentity {
  _meta?: {
    appliedRuleIds: string[];
  };
}

function normalizeArray(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

function randomNoise() {
  const languageStyles = ["concise", "chatty", "hesitant", "direct", "detail-oriented"];
  const lifeMoments = ["recently changed jobs", "commutes long distance", "shops online at night", "often discusses products with friends", "usually answers surveys on mobile"];
  return {
    languageStyle: languageStyles[Math.floor(Math.random() * languageStyles.length)],
    decisiveness: Number((0.35 + Math.random() * 0.6).toFixed(2)),
    lifeMoment: lifeMoments[Math.floor(Math.random() * lifeMoments.length)],
  };
}

function randomPick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function hasScope(scope?: ConditionExpression) {
  return Boolean(scope);
}

export class RuleEngineService {
  detectConflictsForRules(rules: Array<Pick<ParticipantTemplateDto["rules"][number], "id" | "name" | "enabled" | "priority" | "scope" | "assignment">>) {
    const conflicts: TemplatePreview["conflicts"] = [];
    const enabledRules = rules.filter((rule) => rule.enabled);

    for (const rule of enabledRules) {
      if (rule.assignment.mode === "distribution" && rule.assignment.distribution) {
        const total = rule.assignment.distribution.reduce((sum, item) => sum + item.percentage, 0);
        if (Math.abs(total - 100) > 0.01) {
          conflicts.push({ ruleIds: [rule.id], message: `${rule.name} distribution total is ${total}% instead of 100%`, severity: "error" });
        }
      }
    }

    for (let index = 0; index < enabledRules.length; index += 1) {
      for (let next = index + 1; next < enabledRules.length; next += 1) {
        const current = enabledRules[index];
        const candidate = enabledRules[next];
        if (current.priority !== candidate.priority) continue;
        if (current.assignment.attribute !== candidate.assignment.attribute) continue;
        const currentScope = JSON.stringify(current.scope ?? null);
        const candidateScope = JSON.stringify(candidate.scope ?? null);
        if (currentScope === candidateScope || !current.scope || !candidate.scope) {
          conflicts.push({
            ruleIds: [current.id, candidate.id],
            message: `${current.name} and ${candidate.name} target the same attribute at the same priority`,
            severity: "warning",
          });
        }
      }
    }

    return conflicts;
  }

  preview(template: ParticipantTemplateDto, sampleSize?: number): TemplatePreview {
    const generated = this.generateIdentities(template, sampleSize ?? template.sampleSizePreview);
    const attributeDistributions: Record<string, Array<{ label: string; count: number; percentage: number }>> = {};

    for (const identity of generated) {
      for (const [key, rawValue] of Object.entries(identity)) {
        if (key === "noise" || key === "extra" || key === "_meta" || rawValue === undefined || rawValue === null) continue;
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        attributeDistributions[key] ??= [];
        for (const value of values) {
          const item = attributeDistributions[key].find((entry) => entry.label === String(value));
          if (item) item.count += 1;
          else attributeDistributions[key].push({ label: String(value), count: 1, percentage: 0 });
        }
      }
    }

    for (const items of Object.values(attributeDistributions)) {
      for (const item of items) {
        item.percentage = Number(((item.count / generated.length) * 100).toFixed(2));
      }
      items.sort((a, b) => b.count - a.count);
    }

    return {
      sampleSize: generated.length,
      attributeDistributions,
      conflicts: this.detectConflicts(template),
    };
  }

  detectConflicts(template: ParticipantTemplateDto) {
    return this.detectConflictsForRules(template.rules);
  }

  generateIdentities(template: ParticipantTemplateDto, count: number) {
    const rules = [...template.rules].filter((rule) => rule.enabled).sort((a, b) => b.priority - a.priority);
    const templateAttributes = template.attributes ?? [];
    const globallyAssignedAttributes = new Set(
      rules.filter((rule) => !hasScope(rule.scope)).map((rule) => rule.assignment.attribute),
    );
    const identities: GeneratedIdentity[] = [];

    for (let index = 0; index < count; index += 1) {
      const identity: GeneratedIdentity = {
        interests: [],
        customTags: [],
        noise: randomNoise(),
        extra: { syntheticId: randomUUID().slice(0, 8) },
        _meta: { appliedRuleIds: [] },
      };
      const lockedAttributes = new Set<string>();

      for (const rule of rules) {
        if (!this.matchesScope(identity, rule.scope)) continue;
        const attribute = rule.assignment.attribute;
        if (lockedAttributes.has(attribute)) continue;
        const value = this.resolveAssignment(rule);
        if (value === undefined) continue;
        (identity as unknown as Record<string, unknown>)[attribute] = value;
        lockedAttributes.add(attribute);
        identity._meta?.appliedRuleIds.push(rule.id);
      }

      for (const attribute of templateAttributes) {
        if (attribute.key === "noise") continue;
        const currentValue = (identity as Record<string, unknown>)[attribute.key];
        if (currentValue !== undefined && currentValue !== null && (!Array.isArray(currentValue) || currentValue.length > 0)) {
          continue;
        }

        if (!globallyAssignedAttributes.has(attribute.key)) {
          continue;
        }

        const presets = attribute.presetValues ?? [];
        if (!presets.length) {
          (identity as Record<string, unknown>)[attribute.key] = attribute.valueType === "multi"
            ? []
            : "unspecified";
          continue;
        }

        if (attribute.valueType === "multi") {
          (identity as Record<string, unknown>)[attribute.key] = [randomPick(presets).value];
          continue;
        }

        (identity as Record<string, unknown>)[attribute.key] = randomPick(presets).value;
      }

      identities.push(identity);
    }

    return identities.map((identity) => {
      const { _meta, ...rest } = identity;
      return rest;
    });
  }

  private resolveAssignment(rule: ParticipantRuleInput | ParticipantTemplateDto["rules"][number]) {
    if (rule.assignment.mode === "fixed") {
      return rule.assignment.fixedValue;
    }

    const distribution = rule.assignment.distribution ?? [];
    if (distribution.length === 0) return undefined;
    const point = Math.random() * 100;
    let cursor = 0;
    for (const item of distribution) {
      cursor += item.percentage;
      if (point <= cursor) {
        return Array.isArray(item.value) ? [...item.value] : item.value;
      }
    }
    return Array.isArray(distribution.at(-1)?.value) ? [...normalizeArray(distribution.at(-1)!.value)] : distribution.at(-1)?.value;
  }

  private matchesScope(identity: ParticipantIdentity, scope?: ConditionExpression) {
    if (!scope) return true;
    if (scope.type === "leaf") {
      const fieldValue = (identity as Record<string, unknown>)[scope.field];
      const values = Array.isArray(fieldValue) ? fieldValue.map(String) : fieldValue !== undefined ? [String(fieldValue)] : [];
      const targetValues = Array.isArray(scope.value) ? scope.value.map(String) : [String(scope.value)];

      switch (scope.operator) {
        case "eq":
          return values[0] === targetValues[0];
        case "neq":
          return values[0] !== targetValues[0];
        case "in":
          return values.some((value) => targetValues.includes(value));
        case "not_in":
          return values.every((value) => !targetValues.includes(value));
        case "contains":
          return targetValues.every((value) => values.includes(value));
        case "gt":
          return Number(values[0]) > Number(targetValues[0]);
        case "gte":
          return Number(values[0]) >= Number(targetValues[0]);
        case "lt":
          return Number(values[0]) < Number(targetValues[0]);
        case "lte":
          return Number(values[0]) <= Number(targetValues[0]);
        default:
          return false;
      }
    }

    if (scope.combinator === "AND") {
      return scope.children.every((child) => this.matchesScope(identity, child));
    }
    return scope.children.some((child) => this.matchesScope(identity, child));
  }

  resolveAttribute(template: Pick<ParticipantTemplateDto, "attributes">, key: string) {
    return resolveParticipantAttributeDefinition(template.attributes, key);
  }
}
