import { responseGenerationPayloadSchema, structuredAnswerSchema } from "@surveysim/shared";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";
import { renderStructuredAnswerExamples, renderSurveyQuestionContracts } from "./prompt-support/survey-response-format.js";

function buildBehaviorAnchors(identity: Record<string, unknown>) {
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const languageStyle = typeof noise.languageStyle === "string" ? noise.languageStyle : undefined;
  const decisiveness = typeof noise.decisiveness === "number" ? noise.decisiveness : undefined;
  const lifeMoment = typeof noise.lifeMoment === "string" ? noise.lifeMoment : undefined;
  const centralTendency = typeof noise.centralTendency === "number" ? noise.centralTendency : undefined;
  const fatigue = typeof noise.fatigue === "number" ? noise.fatigue : undefined;
  const topicFamiliarity = typeof noise.topicFamiliarity === "number" ? noise.topicFamiliarity : undefined;
  const openTextVerbosity = typeof noise.openTextVerbosity === "number" ? noise.openTextVerbosity : undefined;

  return [
    languageStyle ? `Language style tendency: ${languageStyle}.` : undefined,
    decisiveness !== undefined
      ? decisiveness >= 0.72
        ? "This respondent decides quickly and tends to commit to one clear option."
        : decisiveness <= 0.45
          ? "This respondent can hesitate and may choose a middling or softer option on close calls."
          : "This respondent has moderate decisiveness."
      : undefined,
    centralTendency !== undefined
      ? centralTendency >= 0.68
        ? "This respondent often prefers middle or softer answers on close calls."
        : centralTendency <= 0.35
          ? "This respondent does not strongly gravitate toward middle answers."
          : undefined
      : undefined,
    fatigue !== undefined && fatigue >= 0.65 ? "This respondent may skip optional items or answer more tersely when tired." : undefined,
    topicFamiliarity !== undefined && topicFamiliarity <= 0.35 ? "This respondent may show uncertainty on unfamiliar topics." : undefined,
    openTextVerbosity !== undefined ? `Open-text verbosity tendency: ${openTextVerbosity.toFixed(2)}.` : undefined,
    lifeMoment ? `Background life detail: ${lifeMoment}.` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSurveyResponseSingleAnswerTask(input: {
  survey: unknown;
  identity: unknown;
  personaPrompt: string;
  questionId: string;
  respondentInstructions?: string;
  extraSystemPrompt?: string;
  extraRespondentPrompt?: string;
}) {
  const payload = responseGenerationPayloadSchema.parse({
    survey: input.survey,
    identity: input.identity,
    personaPrompt: input.personaPrompt,
    extraSystemPrompt: input.extraSystemPrompt,
    extraRespondentPrompt: input.extraRespondentPrompt,
  });

  const question = payload.survey.sections
    .flatMap((section) => section.questions)
    .find((item) => item.id === input.questionId);

  if (!question) {
    throw new Error(`Question ${input.questionId} not found in survey payload`);
  }

  const behaviorAnchors = buildBehaviorAnchors(payload.identity as Record<string, unknown>);

  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You simulate one survey respondent for SurveySim.",
          "Return exactly one StructuredAnswer JSON object only.",
          "No markdown. No prose. No wrapper object. No arrays.",
          "Use the exact questionId and valid option ids for the target question.",
          input.extraSystemPrompt?.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Answer exactly one survey question as the provided respondent persona.",
              `Return one StructuredAnswer object for questionId=${input.questionId}.`,
              "Answer as a subjective respondent, not as an assistant trying to pick the objectively correct or most professional option.",
              "If the target question is optional and the respondent would realistically skip it, you may set isSkipped=true with a skipReason instead of forcing an answer.",
            ],
          },
          {
            title: "StructuredAnswer Schema",
            lines: [renderSchemaGuide("StructuredAnswer", structuredAnswerSchema)],
          },
          {
            title: "Target Question Contract",
            lines: renderSurveyQuestionContracts([question]),
          },
          {
            title: "Answer Rules",
            lines: [
              "Use only the fields that belong to the answer type.",
              "For matrix_single_choice, required questions must answer every matrix row exactly once.",
              "Do not include type, title, optionLabel, rowLabel, or any extra metadata.",
              "confidence should be a number between 0 and 1.",
              "If the question is about wording, translation, interpretation, naming, or acceptability, choose what this respondent would personally find clearer, more natural, or more appealing, not what is objectively most correct.",
              "When multiple answers are plausible, let the persona's taste and mild inconsistency drive the choice.",
              input.respondentInstructions ? `Survey-wide respondent instructions: ${input.respondentInstructions}` : undefined,
            ],
          },
          {
            title: "Persona Anchor",
            lines: [
              payload.personaPrompt,
              behaviorAnchors || "No extra behavior anchor available.",
            ],
          },
          {
            title: "Example",
            lines: renderStructuredAnswerExamples([question]),
          },
          {
            title: "Payload",
            lines: [JSON.stringify(payload)],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("StructuredAnswer", structuredAnswerSchema),
  };
}
