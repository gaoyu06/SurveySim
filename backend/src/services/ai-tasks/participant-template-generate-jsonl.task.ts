import {
  getBuiltinParticipantAttributes,
  participantTemplateAiGenerateJsonlRecordSchema,
  type ParticipantArchetypeProfileDto,
  type ParticipantAttributeDefinitionDto,
  type ParticipantRandomConfigDto,
} from "@surveysim/shared";
import { renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

type BuildParticipantTemplateGenerateJsonlTaskInput = {
  prompt: string;
  archetypeProfile?: ParticipantArchetypeProfileDto;
  attributes: ParticipantAttributeDefinitionDto[];
  randomConfig?: ParticipantRandomConfigDto;
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
        : "no preset values yet; define stable snake_case values with clear labels if the request needs them";
      return `- ${attribute.key}: ${attribute.valueType}-value; displayName=${attribute.displayName}; description=${attribute.description ?? "none"}; builtin=${attribute.builtin ? "yes" : "no"}; presets: ${presetText}`;
    })
    .join("\n");
}

export function buildParticipantTemplateGenerateJsonlTask(input: BuildParticipantTemplateGenerateJsonlTaskInput) {
  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You design structured participant template rules for SurveySim.",
          "Return JSONL only.",
          "Each line must be exactly one valid record.",
          "First emit one template record.",
          "Then emit one rule record per rule.",
          "Optionally emit note records at the end.",
          "No markdown. No prose. No arrays. No wrapper object.",
          "Start streaming as soon as the template record is ready. Do not wait to finish all rules before emitting.",
          "If an archetype profile is provided, encode it into the template record and align the rules with that population.",
          "If randomConfig is provided, preserve it in the template record and keep the generated rules compatible with that randomness target.",
        ].join("\n"),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Generate a reusable participant template draft from the natural language request.",
              "Keep the rule set practical and compact for an MVP editor.",
              "Prefer fewer, high-signal rules over a bloated rule list.",
              "Use the archetype profile to make the target population explicit when available.",
            ],
          },
          {
            title: "Critical Output Contract",
            lines: [
              "Line 1 must be a template record with recordType='template'.",
              "Subsequent lines may be rule records with recordType='rule'.",
              "Optional trailing note records may use recordType='note'.",
              "Every line must independently validate against the schema.",
            ],
          },
          {
            title: "Record Schema",
            lines: [renderSchemaGuide("ParticipantTemplateAiGenerateJsonlRecord", participantTemplateAiGenerateJsonlRecordSchema)],
          },
          {
            title: "Rules",
            lines: [
              "Use only supported attributes from the catalog.",
              "Prefer preset values when possible.",
              "If the request needs a custom attribute, define it inside the template record's attributes array before any rule uses it.",
              "Every rule assignment.attribute and every scope.field must exist in the template record attributes array.",
              "Distribution percentages inside one rule must add up to 100.",
              "Use fixed assignment only when the user clearly wants a fixed value.",
              "Use scope only when the rule applies to a subset; otherwise omit scope.",
              "Use stable snake_case values; labels can remain human-readable.",
              "For multi-value attributes like interests and customTags, a distribution item value may be a string array.",
              "Do not emit invalid or placeholder rules.",
            ],
          },
          {
            title: "Examples",
            lines: [
              '{"recordType":"template","name":"Streaming audience baseline","description":"Audience mix for cross-market entertainment survey","archetypeProfile":{"label":"Streaming entertainment audience","seedTags":["streaming","entertainment"]},"attributes":[{"key":"country","displayName":"国家 / Country","valueType":"single","presetValues":[{"value":"united_states","label":"美国 / United States"},{"value":"japan","label":"日本 / Japan"}],"builtin":true},{"key":"gender","displayName":"性别 / Gender","valueType":"single","presetValues":[{"value":"female","label":"女性 / Female"},{"value":"male","label":"男性 / Male"}],"builtin":true},{"key":"fandomIntensity","displayName":"追剧强度 / Fandom intensity","description":"How intensely the audience follows serialized entertainment","valueType":"single","presetValues":[{"value":"casual","label":"轻度 / Casual"},{"value":"moderate","label":"中度 / Moderate"},{"value":"heavy","label":"重度 / Heavy"}],"builtin":false}],"randomConfig":{"randomnessLevel":"medium","noiseProfile":"balanced"},"sampleSizePreview":300}',
              '{"recordType":"rule","name":"Market split","enabled":true,"priority":100,"assignment":{"attribute":"country","mode":"distribution","distribution":[{"value":"united_states","percentage":55,"label":"United States"},{"value":"japan","percentage":45,"label":"Japan"}]}}',
              '{"recordType":"rule","name":"Female skew among younger respondents","enabled":true,"priority":90,"scope":{"type":"leaf","field":"ageRange","operator":"in","value":["25_34","18_24"]},"assignment":{"attribute":"gender","mode":"distribution","distribution":[{"value":"female","percentage":58,"label":"Female"},{"value":"male","percentage":42,"label":"Male"}]}}',
              '{"recordType":"rule","name":"Heavy fandom among gamers","enabled":true,"priority":88,"scope":{"type":"leaf","field":"interests","operator":"contains","value":["gaming"]},"assignment":{"attribute":"fandomIntensity","mode":"distribution","distribution":[{"value":"heavy","percentage":60,"label":"Heavy"},{"value":"moderate","percentage":30,"label":"Moderate"},{"value":"casual","percentage":10,"label":"Casual"}]}}',
              '{"recordType":"note","text":"Interests are concentrated on streaming, movies, and gaming."}',
            ],
          },
          {
            title: "Available Attributes And Presets",
            lines: [renderAttributeCatalog(input.attributes)],
          },
          {
            title: "Archetype And Randomness Context",
            lines: [
              input.archetypeProfile ? `Archetype profile: ${JSON.stringify(input.archetypeProfile)}` : undefined,
              input.randomConfig ? `Random config: ${JSON.stringify(input.randomConfig)}` : undefined,
            ],
          },
          {
            title: "Request Context",
            lines: [
              input.templateName ? `Preferred template name: ${input.templateName}` : undefined,
              input.templateDescription ? `Current template description: ${input.templateDescription}` : undefined,
              `Natural language request:\n${input.prompt}`,
            ],
          },
        ]),
      },
    ],
  };
}
