export type ParticipantAttributeValueType = "single" | "multi";

export type ParticipantAttributePresetValue = {
  value: string;
  label: string;
};

export type ParticipantAttributeDefinition = {
  key: string;
  displayName: string;
  description?: string;
  valueType: ParticipantAttributeValueType;
  presetValues: ParticipantAttributePresetValue[];
  builtin?: boolean;
};

const BUILTIN_PARTICIPANT_ATTRIBUTE_DEFINITIONS: ParticipantAttributeDefinition[] = [
  {
    key: "region",
    displayName: "地区 / Region",
    description: "Broad regional market grouping.",
    valueType: "single",
    presetValues: [
      { value: "east_asia", label: "东亚 / East Asia" },
      { value: "southeast_asia", label: "东南亚 / Southeast Asia" },
      { value: "north_america", label: "北美 / North America" },
      { value: "western_europe", label: "西欧 / Western Europe" },
      { value: "latin_america", label: "拉丁美洲 / Latin America" },
      { value: "middle_east", label: "中东 / Middle East" },
    ],
    builtin: true,
  },
  {
    key: "country",
    displayName: "国家 / Country",
    description: "Respondent country or market.",
    valueType: "single",
    presetValues: [
      { value: "china", label: "中国 / China" },
      { value: "united_states", label: "美国 / United States" },
      { value: "japan", label: "日本 / Japan" },
      { value: "south_korea", label: "韩国 / South Korea" },
      { value: "singapore", label: "新加坡 / Singapore" },
      { value: "united_kingdom", label: "英国 / United Kingdom" },
      { value: "germany", label: "德国 / Germany" },
      { value: "france", label: "法国 / France" },
      { value: "india", label: "印度 / India" },
      { value: "canada", label: "加拿大 / Canada" },
      { value: "australia", label: "澳大利亚 / Australia" },
      { value: "brazil", label: "巴西 / Brazil" },
    ],
    builtin: true,
  },
  {
    key: "continent",
    displayName: "大洲 / Continent",
    description: "High-level geographic continent.",
    valueType: "single",
    presetValues: [
      { value: "asia", label: "亚洲 / Asia" },
      { value: "europe", label: "欧洲 / Europe" },
      { value: "north_america", label: "北美洲 / North America" },
      { value: "south_america", label: "南美洲 / South America" },
      { value: "africa", label: "非洲 / Africa" },
      { value: "oceania", label: "大洋洲 / Oceania" },
    ],
    builtin: true,
  },
  {
    key: "gender",
    displayName: "性别 / Gender",
    description: "Gender identity segment.",
    valueType: "single",
    presetValues: [
      { value: "female", label: "女性 / Female" },
      { value: "male", label: "男性 / Male" },
      { value: "non_binary", label: "非二元 / Non-binary" },
    ],
    builtin: true,
  },
  {
    key: "ageRange",
    displayName: "年龄段 / Age range",
    description: "Respondent age bucket.",
    valueType: "single",
    presetValues: [
      { value: "18_24", label: "18-24 岁" },
      { value: "25_34", label: "25-34 岁" },
      { value: "35_44", label: "35-44 岁" },
      { value: "45_54", label: "45-54 岁" },
      { value: "55_plus", label: "55 岁以上" },
    ],
    builtin: true,
  },
  {
    key: "educationLevel",
    displayName: "教育水平 / Education level",
    description: "Highest education attainment.",
    valueType: "single",
    presetValues: [
      { value: "high_school", label: "高中及以下 / High school or below" },
      { value: "college", label: "大专 / College" },
      { value: "bachelor", label: "本科 / Bachelor" },
      { value: "master", label: "硕士 / Master" },
      { value: "doctorate", label: "博士 / Doctorate" },
    ],
    builtin: true,
  },
  {
    key: "occupation",
    displayName: "职业 / Occupation",
    description: "Primary occupation segment.",
    valueType: "single",
    presetValues: [
      { value: "student", label: "学生 / Student" },
      { value: "office_worker", label: "办公室职员 / Office worker" },
      { value: "freelancer", label: "自由职业 / Freelancer" },
      { value: "manager", label: "管理者 / Manager" },
      { value: "entrepreneur", label: "创业者 / Entrepreneur" },
      { value: "teacher", label: "教师 / Teacher" },
      { value: "engineer", label: "工程师 / Engineer" },
      { value: "healthcare", label: "医疗从业者 / Healthcare" },
    ],
    builtin: true,
  },
  {
    key: "incomeRange",
    displayName: "收入区间 / Income range",
    description: "Respondent income band.",
    valueType: "single",
    presetValues: [
      { value: "low", label: "低收入 / Low" },
      { value: "lower_middle", label: "中低收入 / Lower middle" },
      { value: "middle", label: "中等收入 / Middle" },
      { value: "upper_middle", label: "中高收入 / Upper middle" },
      { value: "high", label: "高收入 / High" },
    ],
    builtin: true,
  },
  {
    key: "interests",
    displayName: "兴趣偏好 / Interests",
    description: "Interests or hobbies. Supports multiple selections.",
    valueType: "multi",
    presetValues: [
      { value: "movies", label: "电影 / Movies" },
      { value: "gaming", label: "游戏 / Gaming" },
      { value: "travel", label: "旅行 / Travel" },
      { value: "fitness", label: "健身 / Fitness" },
      { value: "technology", label: "科技 / Technology" },
      { value: "fashion", label: "时尚 / Fashion" },
      { value: "music", label: "音乐 / Music" },
      { value: "food", label: "美食 / Food" },
    ],
    builtin: true,
  },
  {
    key: "maritalStatus",
    displayName: "婚姻状态 / Marital status",
    description: "Relationship or marital state.",
    valueType: "single",
    presetValues: [
      { value: "single", label: "未婚 / Single" },
      { value: "married", label: "已婚 / Married" },
      { value: "partnered", label: "伴侣同居 / Partnered" },
      { value: "divorced", label: "离异 / Divorced" },
      { value: "widowed", label: "丧偶 / Widowed" },
    ],
    builtin: true,
  },
  {
    key: "customTags",
    displayName: "自定义标签 / Custom tags",
    description: "Reusable behavioral tags. Supports multiple selections.",
    valueType: "multi",
    presetValues: [
      { value: "premium_user", label: "高价值用户 / Premium user" },
      { value: "price_sensitive", label: "价格敏感 / Price sensitive" },
      { value: "early_adopter", label: "尝鲜用户 / Early adopter" },
      { value: "brand_loyal", label: "品牌忠诚 / Brand loyal" },
    ],
    builtin: true,
  },
  {
    key: "noise",
    displayName: "随机噪声 / Noise",
    description: "Synthetic randomness metadata used internally.",
    valueType: "single",
    presetValues: [],
    builtin: true,
  },
];

const builtinAttributeMap = new Map(
  BUILTIN_PARTICIPANT_ATTRIBUTE_DEFINITIONS.map((attribute) => [attribute.key, attribute] as const),
);

function clonePresetValue(value: ParticipantAttributePresetValue): ParticipantAttributePresetValue {
  return {
    value: value.value,
    label: value.label,
  };
}

export function cloneParticipantAttributeDefinition(
  definition: ParticipantAttributeDefinition,
): ParticipantAttributeDefinition {
  return {
    ...definition,
    presetValues: definition.presetValues.map(clonePresetValue),
  };
}

function normalizePresetValues(
  values: ParticipantAttributePresetValue[] | undefined,
  fallbackValues: ParticipantAttributePresetValue[] = [],
) {
  const source = Array.isArray(values) && values.length ? values : fallbackValues;
  const seen = new Set<string>();
  const normalized: ParticipantAttributePresetValue[] = [];

  for (const item of source) {
    const value = String(item.value ?? "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push({
      value,
      label: String(item.label ?? "").trim() || humanizeParticipantAttributeKey(value),
    });
  }

  return normalized;
}

export function humanizeParticipantAttributeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeParticipantAttributeKey(key: string) {
  return key.trim().replace(/\s+/g, "_").replace(/-/g, "_");
}

export function getBuiltinParticipantAttributeDefinition(key: string) {
  const definition = builtinAttributeMap.get(key);
  return definition ? cloneParticipantAttributeDefinition(definition) : undefined;
}

export function getBuiltinParticipantAttributes(options?: { includeNoise?: boolean }) {
  return BUILTIN_PARTICIPANT_ATTRIBUTE_DEFINITIONS.filter(
    (attribute) => options?.includeNoise || attribute.key !== "noise",
  ).map(cloneParticipantAttributeDefinition);
}

export function resolveParticipantAttributeDefinition(
  attributes: ParticipantAttributeDefinition[] | undefined,
  key: string,
) {
  const current = (attributes ?? []).find((attribute) => attribute.key === key);
  if (current) {
    return cloneParticipantAttributeDefinition(current);
  }
  return getBuiltinParticipantAttributeDefinition(key);
}

export function normalizeParticipantAttributeDefinitions(
  values: Array<string | Partial<ParticipantAttributeDefinition>> | undefined,
) {
  const normalized: ParticipantAttributeDefinition[] = [];
  const seen = new Set<string>();

  for (const item of values ?? []) {
    const rawKey =
      typeof item === "string"
        ? item
        : typeof item?.key === "string"
          ? item.key
          : "";
    const key = normalizeParticipantAttributeKey(rawKey);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const builtin = getBuiltinParticipantAttributeDefinition(key);
    const custom = typeof item === "string" ? undefined : item;
    normalized.push({
      key,
      displayName:
        String(custom?.displayName ?? "").trim() ||
        builtin?.displayName ||
        humanizeParticipantAttributeKey(key),
      description: String(custom?.description ?? "").trim() || builtin?.description,
      valueType:
        custom?.valueType === "multi" || custom?.valueType === "single"
          ? custom.valueType
          : builtin?.valueType ?? "single",
      presetValues: normalizePresetValues(custom?.presetValues, builtin?.presetValues),
      builtin: builtin?.builtin ?? Boolean(custom?.builtin),
    });
  }

  return normalized;
}

export const ATTRIBUTE_KEYS = BUILTIN_PARTICIPANT_ATTRIBUTE_DEFINITIONS.map(
  (attribute) => attribute.key,
) as readonly string[];

export const MULTI_VALUE_ATTRIBUTES = BUILTIN_PARTICIPANT_ATTRIBUTE_DEFINITIONS.filter(
  (attribute) => attribute.valueType === "multi",
).map((attribute) => attribute.key) as readonly string[];

export const ATTRIBUTE_VALUE_PRESETS: Record<string, Array<{ value: string; label: string }>> = Object.fromEntries(
  BUILTIN_PARTICIPANT_ATTRIBUTE_DEFINITIONS.map((attribute) => [
    attribute.key,
    attribute.presetValues.map(clonePresetValue),
  ]),
);

export const RUN_STAGES = ["identity", "persona", "response"] as const;

export const QUESTION_TYPES = [
  "single_choice",
  "multi_choice",
  "single_choice_other",
  "multi_choice_other",
  "matrix_single_choice",
  "rating",
  "open_text",
  "paragraph",
  "section_title",
  "respondent_instruction",
] as const;
