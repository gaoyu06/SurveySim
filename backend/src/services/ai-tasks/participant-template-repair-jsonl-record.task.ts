import { participantTemplateAiGenerateJsonlRecordSchema } from "@surveysim/shared";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

export function buildParticipantTemplateRepairJsonlRecordTask(input: {
  invalidLine: string;
  errorMessage: string;
  requestPrompt: string;
}) {
  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You repair one invalid participant-template JSONL record for SurveySim.",
          "Return exactly one corrected JSON object only.",
          "Do not explain the fix. Do not use markdown fences.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Repair the invalid JSONL record so it matches the schema.",
              "Prefer the smallest valid correction.",
              "Keep the meaning faithful to the original request.",
            ],
          },
          {
            title: "Record Schema",
            lines: [renderSchemaGuide("ParticipantTemplateAiGenerateJsonlRecord", participantTemplateAiGenerateJsonlRecordSchema)],
          },
          {
            title: "Repair Rules",
            lines: [
              "If recordType is template, ensure name and attributes exist.",
              "Every template attribute must include key, displayName, valueType, and presetValues.",
              "If recordType is rule, ensure assignment.attribute and assignment.mode exist.",
              "Every rule assignment.attribute and every scope.field must exist in the template attributes array.",
              "If assignment.mode is distribution, ensure distribution exists and percentages add to 100.",
              "If assignment.mode is fixed, ensure fixedValue exists.",
              "If recordType is note, return only recordType and text.",
            ],
          },
          {
            title: "Validation Error",
            lines: [input.errorMessage],
          },
          {
            title: "Invalid Record",
            lines: [input.invalidLine],
          },
          {
            title: "Original Request",
            lines: [input.requestPrompt],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("ParticipantTemplateAiGenerateJsonlRecord", participantTemplateAiGenerateJsonlRecordSchema),
  };
}
