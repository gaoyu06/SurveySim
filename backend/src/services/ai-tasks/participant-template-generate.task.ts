import { getBuiltinParticipantAttributes, type ParticipantAttributeDefinitionDto } from "@surveysim/shared";

type BuildParticipantTemplateGenerateTaskInput = {
  prompt: string;
  attributes: ParticipantAttributeDefinitionDto[];
  templateName?: string;
  templateDescription?: string;
};

function renderAttributeCatalog(attributes: ParticipantAttributeDefinitionDto[]) {
  const merged = [...getBuiltinParticipantAttributes(), ...attributes].reduce<ParticipantAttributeDefinitionDto[]>(
    (accumulator, attribute) => {
      if (accumulator.some((item) => item.key === attribute.key)) {
        return accumulator;
      }
      accumulator.push(attribute);
      return accumulator;
    },
    [],
  );

  return merged
    .filter((attribute) => attribute.key !== "noise")
    .map((attribute) => {
      const presetText = attribute.presetValues.length
        ? attribute.presetValues.map((item) => `${item.value} (${item.label})`).join(", ")
        : "no preset values yet; if needed, define stable snake_case values and clear human-readable labels";
      return `- ${attribute.key}: ${attribute.valueType}-value; displayName=${attribute.displayName}; description=${attribute.description ?? "none"}; builtin=${attribute.builtin ? "yes" : "no"}; presets: ${presetText}`;
    })
    .join("\n");
}

export function buildParticipantTemplateGenerateTask(input: BuildParticipantTemplateGenerateTaskInput): {
  messages: Array<{ role: "system" | "user"; content: string }>;
  fixerPrompt: string;
} {
  const schemaSpec = `
Return JSON with this structure only:
{
  "template": {
    "name": "string",
    "description": "string",
    "attributes": [
      {
        "key": "country",
        "displayName": "国家 / Country",
        "description": "Respondent country or market",
        "valueType": "single",
        "presetValues": [{ "value": "united_states", "label": "美国 / United States" }],
        "builtin": true
      }
    ],
    "sampleSizePreview": 300
  },
  "rules": [
    {
      "name": "string",
      "enabled": true,
      "priority": 100,
      "scope": {
        "type": "group",
        "combinator": "AND",
        "children": [
          {
            "type": "leaf",
            "field": "country",
            "operator": "in",
            "value": ["united_states", "japan"]
          }
        ]
      },
      "assignment": {
        "attribute": "gender",
        "mode": "distribution",
        "distribution": [
          { "value": "female", "percentage": 55, "label": "女性 / Female" },
          { "value": "male", "percentage": 45, "label": "男性 / Male" }
        ]
      },
      "note": "string"
    }
  ],
  "notes": ["string"]
}
`.trim();

  const rules = `
Rules:
1. Use only supported attributes from the catalog.
2. Prefer preset values when possible.
3. Distribution percentages for one rule must add up to 100.
4. Use "fixed" assignment only when the user clearly wants one fixed value.
5. Use "distribution" assignment for proportions and audience mixes.
6. Use "scope" only when the rule applies to a subset; otherwise omit scope.
7. Keep rule count compact and practical for an MVP editor.
8. Use stable snake_case values; labels can be human-readable bilingual text.
9. For multi-value attributes like interests/customTags, distribution item value may be an array of strings.
10. If the request requires a custom attribute that is not in the builtin catalog, define it first inside template.attributes with key/displayName/valueType/presetValues, then reference that same key in rules.
11. Every rule assignment.attribute and every scope.field must exist in template.attributes.
12. Return valid JSON only, no markdown.
`.trim();

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: [
        "You design structured participant template rules for an audience simulation system.",
        "You must return strict JSON that matches the requested schema.",
        schemaSpec,
        rules,
        `Available attributes and preset values:\n${renderAttributeCatalog(input.attributes)}`,
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        input.templateName ? `Preferred template name: ${input.templateName}` : "",
        input.templateDescription ? `Current template description: ${input.templateDescription}` : "",
        `Natural language request:\n${input.prompt}`,
        "Generate a participant template and a practical rule set from this request.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  const fixerPrompt = [
    "Repair the JSON so it matches the participant template generation schema.",
    "Keep only supported attributes and valid condition operators.",
    "Make every distribution total 100.",
    "Return JSON only.",
  ].join("\n");

  return { messages, fixerPrompt };
}
