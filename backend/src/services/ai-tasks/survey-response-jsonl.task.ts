import { responseGenerationPayloadSchema, structuredAnswerSchema } from "@surveysim/shared";
import { renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";
import {
  getInteractiveSurveyQuestions,
  renderStructuredAnswerExamples,
  renderSurveyQuestionContracts,
} from "./prompt-support/survey-response-format.js";

function buildBehaviorAnchors(identity: Record<string, unknown>) {
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const languageStyle = typeof noise.languageStyle === "string" ? noise.languageStyle : undefined;
  const decisiveness = typeof noise.decisiveness === "number" ? noise.decisiveness : undefined;
  const lifeMoment = typeof noise.lifeMoment === "string" ? noise.lifeMoment : undefined;
  const extremityBias = typeof noise.extremityBias === "number" ? noise.extremityBias : undefined;
  const centralTendency = typeof noise.centralTendency === "number" ? noise.centralTendency : undefined;
  const fatigue = typeof noise.fatigue === "number" ? noise.fatigue : undefined;
  const topicFamiliarity = typeof noise.topicFamiliarity === "number" ? noise.topicFamiliarity : undefined;
  const skipOptionalRate = typeof noise.skipOptionalRate === "number" ? noise.skipOptionalRate : undefined;
  const openTextVerbosity = typeof noise.openTextVerbosity === "number" ? noise.openTextVerbosity : undefined;

  return [
    languageStyle ? `Language style tendency: ${languageStyle}.` : undefined,
    decisiveness !== undefined
      ? decisiveness >= 0.72
        ? "This respondent forms quick, confident preferences and rarely hedges."
        : decisiveness <= 0.45
          ? "This respondent is somewhat ambivalent, can hesitate between close options, and does not always choose the strongest claim."
          : "This respondent has moderate confidence and can go either way on close calls."
      : undefined,
    extremityBias !== undefined
      ? extremityBias >= 0.68
        ? "When using scales, this respondent is somewhat comfortable with stronger positive or negative endpoints."
        : extremityBias <= 0.35
          ? "When using scales, this respondent rarely jumps to strong endpoints unless something feels obvious."
          : "This respondent can use either endpoints or middle values depending on the question."
      : undefined,
    centralTendency !== undefined
      ? centralTendency >= 0.68
        ? "On close calls, this respondent often lands near the middle rather than taking the strongest stance."
        : centralTendency <= 0.35
          ? "On close calls, this respondent does not strongly prefer middle options."
          : undefined
      : undefined,
    fatigue !== undefined
      ? fatigue >= 0.65
        ? "As the survey progresses, this respondent may become shorter, less patient, and more likely to skip optional items."
        : fatigue <= 0.3
          ? "This respondent stays fairly steady through the survey."
          : "This respondent has mild survey fatigue on longer questionnaires."
      : undefined,
    topicFamiliarity !== undefined
      ? topicFamiliarity >= 0.7
        ? "This respondent feels fairly familiar with the general topic."
        : topicFamiliarity <= 0.35
          ? "This respondent has limited familiarity with the topic and should sometimes show uncertainty."
          : "This respondent has partial topic familiarity."
      : undefined,
    skipOptionalRate !== undefined ? `Optional-question skip tendency: ${skipOptionalRate.toFixed(2)}.` : undefined,
    openTextVerbosity !== undefined ? `Open-text verbosity tendency: ${openTextVerbosity.toFixed(2)}.` : undefined,
    lifeMoment ? `Background life detail: ${lifeMoment}.` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSurveyResponseJsonlTask(input: {
  contentTask: unknown;
  identity: unknown;
  personaPrompt: string;
  respondentInstructions?: string;
  extraSystemPrompt?: string;
  extraRespondentPrompt?: string;
}) {
  const payload = responseGenerationPayloadSchema.parse({
    contentTask: input.contentTask,
    identity: input.identity,
    personaPrompt: input.personaPrompt,
    extraSystemPrompt: input.extraSystemPrompt,
    extraRespondentPrompt: input.extraRespondentPrompt,
  });

  const questions = getInteractiveSurveyQuestions(payload.contentTask);
  const questionIds = questions.map((question) => question.id);
  const examples = renderStructuredAnswerExamples(questions);
  const behaviorAnchors = buildBehaviorAnchors(payload.identity as Record<string, unknown>);

  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You simulate one participant completing a content task for SurveySim.",
          "Return answer records as JSONL only.",
          "Each line must be exactly one StructuredAnswer JSON object.",
          "No markdown. No prose. No wrapper object. No arrays.",
          "Start emitting as soon as the first question is answered. Do not wait to finish the whole survey before streaming.",
          "Output records in the exact survey order.",
          "Before emitting each line, verify it uses the exact questionId and valid option ids for that question.",
          "Every interactive question must appear exactly once.",
          "Do not emit paragraph, section_title, or respondent_instruction blocks.",
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
              "Complete the content task as the provided participant persona.",
              `Emit exactly ${questionIds.length} JSON lines, one answer per interactive question, and nothing else.`,
              "Required questions must receive valid answers. Optional questions may be skipped when that fits the respondent's fatigue, uncertainty, or relevance.",
              "Stream line-by-line in order. After finishing question 1, emit its JSON object immediately, then continue to question 2.",
              "Stay faithful to the persona and identity while remaining valid under the content-task schema.",
              "Answer as a subjective consumer or respondent, not as a translator, analyst, teacher, or evaluator trying to find the objectively correct option.",
            ],
          },
          {
            title: "Critical Output Contract",
            lines: [
              "Every line must independently parse as one StructuredAnswer object.",
              "The top-level object keys are limited to: questionId, selectedOptionIds, matrixAnswers, otherText, ratingValue, textAnswer, isSkipped, skipReason, confidence.",
              "Do not output answers, responses, result, question, prompt, type, optionLabel, rowLabel, or any alias fields.",
              "Return JSONL only. One object per line. No blank lines.",
            ],
          },
          {
            title: "StructuredAnswer Schema",
            lines: [renderSchemaGuide("StructuredAnswer", structuredAnswerSchema)],
          },
          {
            title: "Question Contracts",
            lines: renderSurveyQuestionContracts(questions),
          },
          {
            title: "Answering Rules",
            lines: [
              "For required single_choice and single_choice_other questions, selectedOptionIds must contain exactly one option id. Optional single-choice questions may instead set isSkipped=true with a skipReason.",
              "For multi_choice and multi_choice_other, selectedOptionIds must satisfy the question's minSelections and maxSelections when provided. If no explicit min is provided, optional questions may choose zero selections or skip entirely.",
              "Use otherText only when the chosen option supports an extra free-text input.",
              "For rating questions, use ratingValue only and keep it inside the stated numeric range. Optional rating questions may be skipped.",
              "For open_text questions, provide textAnswer with concise but believable respondent language. Optional open_text may be skipped. Low-verbosity respondents should answer briefly.",
              "For matrix_single_choice questions, use matrixAnswers only. Required matrix questions must answer every row exactly once, but optional matrix questions may be skipped as a whole.",
              "Do not place matrix column ids in selectedOptionIds at the question root level.",
              "When skipping an optional question, set isSkipped=true, leave answer content empty, and provide skipReason.",
              "confidence should be a number between 0 and 1 reflecting how certain the respondent feels about this answer.",
              "Examples below demonstrate valid JSON shape only. They are not preferred answers.",
              "Do not default to the first option, the same score, or the same opinion pattern unless the persona clearly supports it.",
              "When multiple answers are all plausible, use persona-specific nuance, habits, and minor inconsistency to choose among them.",
              "If a question looks like a wording, translation, naming, concept explanation, or market-localization question, answer with the option this respondent would personally find clearer, more natural, more appealing, or more usable. Do not optimize for academic correctness.",
              "Avoid uniform positivity. Some respondents should be lukewarm, skeptical, confused, or mildly opposed when that is plausible.",
              "Avoid over-optimizing for the most polished, strongest, or most professional-sounding option. People often pick the option that simply feels familiar or easy to understand.",
              "Two respondents with similar identities should still differ sometimes because of taste, wording sensitivity, mood, and personal bias.",
              "Use middle ratings when the respondent is uncertain, fatigued, or only mildly opinionated. Use endpoints only when the respondent truly feels strongly.",
              input.respondentInstructions ? `Task-wide participant instructions: ${input.respondentInstructions}` : undefined,
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
            title: "Examples",
            lines: examples,
          },
          {
            title: "Required Answer Order",
            lines: [JSON.stringify(questionIds)],
          },
          {
            title: "Payload",
            lines: [JSON.stringify(payload)],
          },
        ]),
      },
    ],
  };
}
