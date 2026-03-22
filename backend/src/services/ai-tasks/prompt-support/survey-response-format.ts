import { type SurveyQuestionDto, type SurveySchemaDto } from "@surveysim/shared";

const NON_INTERACTIVE_TYPES = new Set(["paragraph", "section_title", "respondent_instruction"]);

function formatOptionList(question: SurveyQuestionDto) {
  if (!question.options.length) return undefined;
  return question.options.map((option) => `${option.id}=${option.label}`).join(", ");
}

function formatMatrixRows(question: SurveyQuestionDto) {
  if (!question.matrix?.rows.length) return undefined;
  return question.matrix.rows.map((row) => `${row.id}=${row.label}`).join(", ");
}

function formatMatrixColumns(question: SurveyQuestionDto) {
  if (!question.matrix?.columns.length) return undefined;
  return question.matrix.columns.map((column) => `${column.id}=${column.label}`).join(", ");
}

function buildQuestionExample(question: SurveyQuestionDto) {
  const lastOptionId = question.options[question.options.length - 1]?.id;
  const reversedOptionIds = question.options
    .slice()
    .reverse()
    .slice(0, Math.min(2, question.options.length))
    .map((option) => option.id);
  const midRating = (() => {
    const min = question.validation?.minRating ?? 1;
    const max = question.validation?.maxRating ?? 5;
    return Math.round((min + max) / 2);
  })();

  switch (question.type) {
    case "single_choice":
      return {
        questionId: question.id,
        selectedOptionIds: lastOptionId ? [lastOptionId] : [],
      };
    case "single_choice_other": {
      const otherOption = question.options.find((option) => option.allowOther);
      return {
        questionId: question.id,
        selectedOptionIds: otherOption ? [otherOption.id] : [],
        otherText: otherOption ? "A short custom detail." : undefined,
      };
    }
    case "multi_choice":
      return {
        questionId: question.id,
        selectedOptionIds: reversedOptionIds,
      };
    case "multi_choice_other": {
      const picks = question.options
        .slice()
        .reverse()
        .slice(0, Math.min(2, question.options.length));
      const otherOption = question.options.find((option) => option.allowOther);
      return {
        questionId: question.id,
        selectedOptionIds: otherOption
          ? Array.from(new Set([...picks.map((option) => option.id), otherOption.id]))
          : picks.map((option) => option.id),
        otherText: otherOption ? "A short custom detail." : undefined,
      };
    }
    case "rating":
      return {
        questionId: question.id,
        ratingValue: midRating,
      };
    case "open_text":
      return {
        questionId: question.id,
        textAnswer: "A concise, persona-consistent answer.",
        confidence: 0.64,
      };
    case "matrix_single_choice":
      return {
        questionId: question.id,
        matrixAnswers: (question.matrix?.rows ?? []).map((row) => ({
          rowId: row.id,
          selectedOptionIds: lastOptionId && question.matrix?.columns.some((column) => column.id === lastOptionId)
            ? [lastOptionId]
            : question.matrix?.columns[question.matrix.columns.length - 1]
              ? [question.matrix.columns[question.matrix.columns.length - 1].id]
              : [],
        })),
        confidence: 0.58,
      };
    default:
      return undefined;
  }
}

export function getInteractiveSurveyQuestions(survey: SurveySchemaDto) {
  return survey.sections
    .flatMap((section) => section.questions)
    .filter((question) => !NON_INTERACTIVE_TYPES.has(question.type));
}

export function renderSurveyQuestionContracts(questions: SurveyQuestionDto[]) {
  return questions.map((question, index) => {
    const lines = [
      `${index + 1}. ${question.id} | type=${question.type} | required=${question.required ? "true" : "false"}`,
      `title=${question.title}`,
    ];

    if (question.description) {
      lines.push(`description=${question.description}`);
    }

    if (question.respondentInstructions) {
      lines.push(`respondentInstructions=${question.respondentInstructions}`);
    }

    const options = formatOptionList(question);
    if (options) {
      lines.push(`options=${options}`);
    }

    if (question.type === "rating") {
      const min = question.validation?.minRating ?? 1;
      const max = question.validation?.maxRating ?? 5;
      const step = question.validation?.step ?? 1;
      lines.push(`ratingRange=${min}..${max} step=${step}`);
    }

    if (question.type === "matrix_single_choice") {
      const rows = formatMatrixRows(question);
      const columns = formatMatrixColumns(question);
      if (rows) lines.push(`matrixRows=${rows}`);
      if (columns) lines.push(`matrixColumns=${columns}`);
    }

    if (question.validation?.minSelections !== undefined) {
      lines.push(`minSelections=${question.validation.minSelections}`);
    }

    if (question.validation?.maxSelections !== undefined) {
      lines.push(`maxSelections=${question.validation.maxSelections}`);
    }

    return lines.join("\n");
  });
}

export function renderStructuredAnswerExamples(questions: SurveyQuestionDto[]) {
  const seen = new Set<string>();
  const examples: string[] = [];

  for (const question of questions) {
    if (seen.has(question.type)) continue;
    const example = buildQuestionExample(question);
    if (!example) continue;
    examples.push(`${question.type} => ${JSON.stringify(example)}`);
    seen.add(question.type);
  }

  return examples;
}
