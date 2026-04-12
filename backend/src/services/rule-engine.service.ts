import { resolveParticipantAttributeDefinition, SIMULATED_NAME_POOLS } from "@surveysim/shared";
import type {
  ConditionExpression,
  ParticipantIdentity,
  ParticipantRandomConfigDto,
  ParticipantRuleInput,
  ParticipantTemplateDto,
  TemplatePreview,
} from "@surveysim/shared";

interface GeneratedIdentity extends ParticipantIdentity {
  _meta?: {
    appliedRuleIds: string[];
  };
}

function normalizeArray(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seedSource?: string) {
  let seed = hashSeed(seedSource && seedSource.trim() ? seedSource : `${Date.now()}_${Math.random()}`) || 1;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getNoiseAmplitude(config: ParticipantRandomConfigDto | undefined) {
  const randomnessMap = { low: 0.55, medium: 1, high: 1.3 } as const;
  const profileMap = { conservative: 0.85, balanced: 1, expressive: 1.2 } as const;
  return randomnessMap[config?.randomnessLevel ?? "medium"] * profileMap[config?.noiseProfile ?? "balanced"];
}

function boundedValue(rng: () => number, min: number, max: number, amplitude: number) {
  const midpoint = (min + max) / 2;
  const halfRange = ((max - min) / 2) * amplitude;
  const sampled = midpoint - halfRange + rng() * halfRange * 2;
  const clamped = Math.min(max, Math.max(min, sampled));
  return Number(clamped.toFixed(2));
}

function randomNoise(rng: () => number, config?: ParticipantRandomConfigDto) {
  const languageStyles = ["concise", "chatty", "hesitant", "direct", "detail-oriented"];
  const lifeMoments = ["recently changed jobs", "commutes long distance", "shops online at night", "often discusses products with friends", "usually answers tasks on mobile"];
  const amplitude = getNoiseAmplitude(config);
  return {
    languageStyle: languageStyles[Math.floor(rng() * languageStyles.length)],
    decisiveness: boundedValue(rng, 0.25, 0.9, amplitude),
    lifeMoment: lifeMoments[Math.floor(rng() * lifeMoments.length)],
    extremityBias: boundedValue(rng, 0.1, 0.85, amplitude),
    centralTendency: boundedValue(rng, 0.1, 0.85, amplitude),
    acquiescence: boundedValue(rng, 0.15, 0.8, amplitude),
    fatigue: boundedValue(rng, 0.05, 0.75, amplitude),
    attention: boundedValue(rng, 0.35, 0.95, amplitude),
    topicFamiliarity: boundedValue(rng, 0.1, 0.9, amplitude),
    socialDesirability: boundedValue(rng, 0.1, 0.8, amplitude),
    straightlining: boundedValue(rng, 0.05, 0.65, amplitude),
    noveltySeeking: boundedValue(rng, 0.1, 0.85, amplitude),
    skipOptionalRate: boundedValue(rng, 0.02, 0.3, amplitude),
    openTextVerbosity: boundedValue(rng, 0.15, 0.85, amplitude),
  };
}

function randomPick<T>(items: T[], rng: () => number) {
  return items[Math.floor(rng() * items.length)];
}

function hasScope(scope?: ConditionExpression) {
  return Boolean(scope);
}

function createSyntheticId(rng: () => number) {
  return Array.from({ length: 8 }, () => Math.floor(rng() * 16).toString(16)).join("");
}

function isChineseLocaleIdentity(identity: Partial<ParticipantIdentity>) {
  const hints = [identity.country, identity.region, identity.continent, ...(identity.customTags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return ["china", "chinese", "cn", "east_asia", "东亚", "中国", "中文"].some((token) => hints.includes(token));
}

function isFemaleIdentity(identity: Partial<ParticipantIdentity>) {
  return (identity.gender ?? "").toLowerCase().includes("female") || identity.gender === "女";
}

function isMaleIdentity(identity: Partial<ParticipantIdentity>) {
  return (identity.gender ?? "").toLowerCase().includes("male") || identity.gender === "男";
}

function generateSimulatedName(identity: Partial<ParticipantIdentity>, rng: () => number) {
  const zh = isChineseLocaleIdentity(identity);
  const female = isFemaleIdentity(identity);
  const male = isMaleIdentity(identity);

  if (zh) {
    const surname = randomPick([...SIMULATED_NAME_POOLS.zh.surnames], rng);
    const givenPool = female
      ? SIMULATED_NAME_POOLS.zh.givenFemale
      : male
        ? SIMULATED_NAME_POOLS.zh.givenMale
        : SIMULATED_NAME_POOLS.zh.givenNeutral;
    const given = randomPick([...givenPool], rng);
    return `${surname}${given}`;
  }

  const firstPool = female
    ? SIMULATED_NAME_POOLS.en.firstFemale
    : male
      ? SIMULATED_NAME_POOLS.en.firstMale
      : SIMULATED_NAME_POOLS.en.firstNeutral;
  const first = randomPick([...firstPool], rng);
  const last = randomPick([...SIMULATED_NAME_POOLS.en.last], rng);
  return `${first} ${last}`;
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
    const globallyAssignedAttributes = new Set(rules.filter((rule) => !hasScope(rule.scope)).map((rule) => rule.assignment.attribute));
    const identities: GeneratedIdentity[] = [];
    const baseSeed = template.randomConfig?.seed?.trim() || `${template.id}:${count}`;
    const archetypeTags = [template.archetypeProfile?.label, ...(template.archetypeProfile?.seedTags ?? [])].filter(Boolean) as string[];

    for (let index = 0; index < count; index += 1) {
      const rng = createRng(`${baseSeed}:${index + 1}`);
      const identity: GeneratedIdentity = {
        interests: [],
        customTags: [],
        noise: randomNoise(rng, template.randomConfig),
        extra: {
          syntheticId: createSyntheticId(rng),
          archetypeLabel: template.archetypeProfile?.label,
          archetypeSeedTags: archetypeTags,
          randomnessLevel: template.randomConfig?.randomnessLevel,
        },
        _meta: { appliedRuleIds: [] },
      };
      const lockedAttributes = new Set<string>();

      if (archetypeTags.length) {
        identity.customTags = Array.from(new Set([...(identity.customTags ?? []), ...archetypeTags]));
      }

      for (const rule of rules) {
        if (!this.matchesScope(identity, rule.scope)) continue;
        const attribute = rule.assignment.attribute;
        if (lockedAttributes.has(attribute)) continue;
        const value = this.resolveAssignment(rule, rng);
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

        if (!globallyAssignedAttributes.has(attribute.key) && attribute.key !== "customTags") {
          continue;
        }

        const presets = attribute.presetValues ?? [];
        if (!presets.length) {
          (identity as Record<string, unknown>)[attribute.key] = attribute.valueType === "multi" ? [] : "unspecified";
          continue;
        }

        if (attribute.valueType === "multi") {
          const primary = randomPick(presets, rng).value;
          const nextValues = new Set<string>(attribute.key === "customTags" ? [...(identity.customTags ?? []), primary] : [primary]);
          const addSecond = template.randomConfig?.randomnessLevel === "high" && presets.length > 1 && rng() > 0.55;
          if (addSecond) {
            nextValues.add(randomPick(presets, rng).value);
          }
          (identity as Record<string, unknown>)[attribute.key] = Array.from(nextValues);
          continue;
        }

        (identity as Record<string, unknown>)[attribute.key] = randomPick(presets, rng).value;
      }

      if (!(identity as Record<string, unknown>).name) {
        (identity as Record<string, unknown>).name = generateSimulatedName(identity, rng);
      }

      identities.push(identity);
    }

    return identities.map((identity) => {
      const { _meta, ...rest } = identity;
      return rest;
    });
  }

  private resolveAssignment(rule: ParticipantRuleInput | ParticipantTemplateDto["rules"][number], rng: () => number) {
    if (rule.assignment.mode === "fixed") {
      return rule.assignment.fixedValue;
    }

    const distribution = rule.assignment.distribution ?? [];
    if (distribution.length === 0) return undefined;
    const point = rng() * 100;
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
