import path from "node:path";
import { stringify } from "csv-stringify/sync";
import type { ParticipantIdentity, ReportDto, StructuredAnswer, SurveySchemaDto } from "@surveysim/shared";
import { prisma } from "../lib/db.js";
import { env } from "../config/env.js";
import { fromJson } from "../lib/json.js";
import type { AuthUserContext } from "../types/auth.js";
import { isAdmin } from "../utils/access.js";
import { ensureDir, writeTextFile } from "../utils/fs.js";
import { ReportService } from "./reporting/report.service.js";
import { readStructuredAnswers } from "./survey-response-answer-reader.js";

type RawExportParticipant = {
  participantId: string;
  participantOrdinal: number;
  participantStatus: string;
  responseStatus: string;
  responseCompletedAt: Date | null;
  identity: ParticipantIdentity;
  answers: StructuredAnswer[];
};

type FlattenedQuestion = {
  order: number;
  question: SurveySchemaDto["sections"][number]["questions"][number];
};

type ExportContext = {
  run: {
    id: string;
    name: string;
    status: string;
    surveyTitle: string;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  surveySchema: SurveySchemaDto;
  participants: RawExportParticipant[];
  report: ReportDto;
};

type CsvExportRow = {
  runName: string;
  surveyTitle: string;
  totalResponses: number;
  questionOrder: number;
  questionTitle: string;
  questionType: string;
  responseCount: number;
  responseRate: number;
  statCategory: string;
  metricName: string;
  metricValue: number | string | "";
  optionLabel: string;
  optionCount: number | "";
  populationShare: number | "";
  inQuestionShare: number | "";
  totalSelections: number | "";
  selectionShare: number | "";
  matrixRowLabel: string;
  matrixRowResponses: number | "";
  matrixColumnLabel: string;
};

type OpenTextCsvExportRow = {
  runName: string;
  surveyTitle: string;
  questionOrder: number;
  questionTitle: string;
  questionType: string;
  responseCount: number;
  answerCount: number;
  answerIndex: number | "";
  answerText: string;
};

type DynamicCsvColumn = {
  key: string;
  header: string;
};

type RawResponseCsvRow = Record<string, string | number>;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "-";
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function roundToTwo(value: number) {
  return Number(value.toFixed(2));
}

const EMPTY_CELL = "" as const;

const CSV_COLUMNS = [
  { key: "runName", header: "批次名称" },
  { key: "surveyTitle", header: "问卷标题" },
  { key: "totalResponses", header: "有效答卷数" },
  { key: "questionOrder", header: "题号" },
  { key: "questionTitle", header: "题目" },
  { key: "questionType", header: "题型" },
  { key: "responseCount", header: "回答人数" },
  { key: "responseRate", header: "回答率（%）" },
  { key: "statCategory", header: "统计类别" },
  { key: "metricName", header: "指标名称" },
  { key: "metricValue", header: "指标值" },
  { key: "optionLabel", header: "选项" },
  { key: "optionCount", header: "数量" },
  { key: "populationShare", header: "人群占比（%）" },
  { key: "inQuestionShare", header: "题内占比（%）" },
  { key: "totalSelections", header: "多选总选择次数" },
  { key: "selectionShare", header: "选项占总选择次数比例（%）" },
  { key: "matrixRowLabel", header: "矩阵行" },
  { key: "matrixRowResponses", header: "矩阵行回答数" },
  { key: "matrixColumnLabel", header: "矩阵列" },
] as const;

const OPEN_TEXT_CSV_COLUMNS = [
  { key: "runName", header: "批次名称" },
  { key: "surveyTitle", header: "问卷标题" },
  { key: "questionOrder", header: "题号" },
  { key: "questionTitle", header: "题目" },
  { key: "questionType", header: "题型" },
  { key: "responseCount", header: "回答人数" },
  { key: "answerCount", header: "回答数量" },
  { key: "answerIndex", header: "回答序号" },
  { key: "answerText", header: "回答内容" },
] as const;

const RAW_RESPONSE_BASE_COLUMNS: DynamicCsvColumn[] = [
  { key: "runName", header: "批次名称" },
  { key: "surveyTitle", header: "问卷标题" },
  { key: "participantOrdinal", header: "参与者序号" },
  { key: "participantId", header: "参与者 ID" },
  { key: "participantStatus", header: "参与者状态" },
  { key: "responseStatus", header: "答卷状态" },
  { key: "responseCompletedAt", header: "答卷完成时间" },
];

const IDENTITY_HEADER_LABELS: Record<string, string> = {
  region: "地区",
  country: "国家",
  continent: "洲",
  gender: "性别",
  ageRange: "年龄段",
  educationLevel: "教育程度",
  occupation: "职业",
  incomeRange: "收入范围",
  interests: "兴趣",
  maritalStatus: "婚姻状态",
  customTags: "自定义标签",
  noise: "噪声参数",
  extra: "扩展信息",
};

const PREFERRED_IDENTITY_KEYS = [
  "region",
  "country",
  "continent",
  "gender",
  "ageRange",
  "educationLevel",
  "occupation",
  "incomeRange",
  "interests",
  "maritalStatus",
  "customTags",
  "noise",
  "extra",
] as const;

function formatQuestionType(type: string) {
  const labels: Record<string, string> = {
    single_choice: "单选题",
    multi_choice: "多选题",
    single_choice_other: "单选题（其他）",
    multi_choice_other: "多选题（其他）",
    matrix_single_choice: "矩阵单选题",
    rating: "评分题",
    open_text: "开放题",
  };
  return labels[type] ?? type;
}

function isInteractiveQuestion(type: string) {
  return !["paragraph", "section_title", "respondent_instruction"].includes(type);
}

function flattenSurveyQuestions(schema: SurveySchemaDto): FlattenedQuestion[] {
  const items: FlattenedQuestion[] = [];
  let order = 0;

  for (const section of schema.sections) {
    for (const question of section.questions) {
      if (!isInteractiveQuestion(question.type)) {
        continue;
      }

      order += 1;
      items.push({ order, question });
    }
  }

  return items;
}

function formatIdentityHeader(key: string) {
  return IDENTITY_HEADER_LABELS[key] ?? key;
}

function formatIdentityValue(value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY_CELL;
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(" | ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function collectIdentityKeys(participants: RawExportParticipant[]) {
  const allKeys = new Set<string>();

  for (const participant of participants) {
    for (const key of Object.keys(participant.identity)) {
      allKeys.add(key);
    }
  }

  const preferred = PREFERRED_IDENTITY_KEYS.filter((key) => allKeys.has(key));
  const additional = [...allKeys]
    .filter((key) => !PREFERRED_IDENTITY_KEYS.includes(key as (typeof PREFERRED_IDENTITY_KEYS)[number]))
    .sort((left, right) => left.localeCompare(right));

  return [...preferred, ...additional];
}

function getSkippedMarker(answer?: StructuredAnswer) {
  if (!answer?.isSkipped) {
    return null;
  }

  return answer.skipReason ? `SKIPPED:${answer.skipReason}` : "SKIPPED";
}

function formatOptionSelection(
  optionIds: string[],
  options: Array<{ id: string; label: string }>,
  otherText?: string,
) {
  const optionMap = new Map(options.map((option) => [option.id, option.label]));
  const labels = optionIds.map((optionId) => optionMap.get(optionId) ?? optionId);

  if (otherText) {
    labels.push(`Other: ${otherText}`);
  }

  return labels.join(" | ");
}

function formatQuestionAnswer(
  question: FlattenedQuestion["question"],
  answer: StructuredAnswer | undefined,
) {
  const skipped = getSkippedMarker(answer);
  if (skipped) {
    return skipped;
  }

  if (!answer) {
    return EMPTY_CELL;
  }

  if (question.type === "single_choice" || question.type === "single_choice_other") {
    return formatOptionSelection(answer.selectedOptionIds, question.options, answer.otherText);
  }

  if (question.type === "multi_choice" || question.type === "multi_choice_other") {
    return formatOptionSelection(answer.selectedOptionIds, question.options, answer.otherText);
  }

  if (question.type === "rating") {
    return answer.ratingValue !== undefined ? String(answer.ratingValue) : EMPTY_CELL;
  }

  if (question.type === "open_text") {
    return answer.textAnswer ?? answer.otherText ?? EMPTY_CELL;
  }

  return EMPTY_CELL;
}

function formatMatrixRowAnswer(
  question: FlattenedQuestion["question"],
  rowId: string,
  answer: StructuredAnswer | undefined,
) {
  const skipped = getSkippedMarker(answer);
  if (skipped) {
    return skipped;
  }

  if (!answer || question.type !== "matrix_single_choice") {
    return EMPTY_CELL;
  }

  const rowAnswer = answer.matrixAnswers.find((item) => item.rowId === rowId);
  if (!rowAnswer) {
    return EMPTY_CELL;
  }

  const columns = question.matrix?.columns ?? [];
  return formatOptionSelection(rowAnswer.selectedOptionIds, columns);
}

function buildRawResponseCsv(context: ExportContext) {
  const identityKeys = collectIdentityKeys(context.participants);
  const flattenedQuestions = flattenSurveyQuestions(context.surveySchema);

  const identityColumns: DynamicCsvColumn[] = identityKeys.map((key) => ({
    key: `identity__${key}`,
    header: formatIdentityHeader(key),
  }));

  const questionColumns: DynamicCsvColumn[] = flattenedQuestions.flatMap(({ order, question }) => {
    if (question.type === "matrix_single_choice") {
      return (question.matrix?.rows ?? []).map((row, rowIndex) => ({
        key: `question__${question.id}__${row.id}`,
        header: `Q${order}.${rowIndex + 1} ${question.title} / ${row.label}`,
      }));
    }

    return [
      {
        key: `question__${question.id}`,
        header: `Q${order} ${question.title}`,
      },
    ];
  });

  const columns = [...RAW_RESPONSE_BASE_COLUMNS, ...identityColumns, ...questionColumns];
  const rows: RawResponseCsvRow[] = context.participants.map((participant) => {
    const row: RawResponseCsvRow = {
      runName: context.run.name,
      surveyTitle: context.run.surveyTitle,
      participantOrdinal: participant.participantOrdinal,
      participantId: participant.participantId,
      participantStatus: participant.participantStatus,
      responseStatus: participant.responseStatus,
      responseCompletedAt: participant.responseCompletedAt?.toISOString() ?? EMPTY_CELL,
    };

    for (const key of identityKeys) {
      row[`identity__${key}`] = formatIdentityValue((participant.identity as Record<string, unknown>)[key]);
    }

    const answerMap = new Map(participant.answers.map((answer) => [answer.questionId, answer]));

    for (const { question } of flattenedQuestions) {
      const answer = answerMap.get(question.id);
      if (question.type === "matrix_single_choice") {
        for (const matrixRow of question.matrix?.rows ?? []) {
          row[`question__${question.id}__${matrixRow.id}`] = formatMatrixRowAnswer(question, matrixRow.id, answer);
        }
        continue;
      }

      row[`question__${question.id}`] = formatQuestionAnswer(question, answer);
    }

    return row;
  });

  return { columns, rows };
}

function buildSanitizedJson(context: ExportContext) {
  return {
    exportType: "report_summary",
    run: {
      id: context.run.id,
      name: context.run.name,
      status: context.run.status,
      surveyTitle: context.run.surveyTitle,
      createdAt: context.run.createdAt.toISOString(),
      startedAt: context.run.startedAt?.toISOString() ?? null,
      completedAt: context.run.completedAt?.toISOString() ?? null,
    },
    summary: {
      totalResponses: context.report.totalResponses,
      questionCount: context.report.questions.length,
    },
    questions: context.report.questions.map((question, index) => {
      const base = {
        order: index + 1,
        title: question.title,
        type: formatQuestionType(question.type),
        responseCount: question.responseCount,
        responseRate: question.responseRate,
        diagnostics: question.diagnostics
          ? {
              skippedCount: question.diagnostics.skippedCount,
              skippedRate: question.diagnostics.skippedRate,
              meanConfidence: question.diagnostics.meanConfidence,
            }
          : undefined,
      };

      if (question.singleChoice) {
        return {
          ...base,
          stats: {
            options: question.singleChoice,
          },
        };
      }

      if (question.multiChoice) {
        return {
          ...base,
          stats: {
            options: question.multiChoice,
          },
        };
      }

      if (question.rating) {
        return {
          ...base,
          stats: {
            mean: question.rating.mean,
            median: question.rating.median,
            stdDev: question.rating.stdDev,
            distribution: question.rating.distribution,
          },
        };
      }

      if (question.matrixSingleChoice) {
        return {
          ...base,
          stats: {
            rows: question.matrixSingleChoice.rows.map((row) => ({
              rowLabel: row.rowLabel,
              responses: row.responses,
              columns: row.columns,
            })),
          },
        };
      }

      return {
        ...base,
        stats: {
          answerCount: question.openText?.answers.length ?? 0,
        },
      };
    }),
  };
}

function buildCsvRows(context: ExportContext): CsvExportRow[] {
  const rows: CsvExportRow[] = [];

  context.report.questions.forEach((question, index) => {
    const shared: Omit<
      CsvExportRow,
      "statCategory" | "metricName" | "metricValue" | "optionLabel" | "optionCount" | "populationShare" | "inQuestionShare" | "totalSelections" | "selectionShare" | "matrixRowLabel" | "matrixRowResponses" | "matrixColumnLabel"
    > = {
      runName: context.run.name,
      surveyTitle: context.run.surveyTitle,
      totalResponses: context.report.totalResponses,
      questionOrder: index + 1,
      questionTitle: question.title,
      questionType: formatQuestionType(question.type),
      responseCount: question.responseCount,
      responseRate: question.responseRate,
    };

    if (question.singleChoice) {
      rows.push(...question.singleChoice.map((item) => ({
        ...shared,
        statCategory: "选项统计",
        metricName: EMPTY_CELL,
        metricValue: EMPTY_CELL,
        optionLabel: item.label,
        optionCount: item.count,
        populationShare: item.percentage,
        inQuestionShare: question.responseCount ? roundToTwo((item.count / question.responseCount) * 100) : 0,
        totalSelections: EMPTY_CELL,
        selectionShare: EMPTY_CELL,
        matrixRowLabel: EMPTY_CELL,
        matrixRowResponses: EMPTY_CELL,
        matrixColumnLabel: EMPTY_CELL,
      })));
      return;
    }

    if (question.multiChoice) {
      const totalSelections = question.multiChoice.reduce((sum, item) => sum + item.count, 0);
      rows.push(
        {
          ...shared,
          statCategory: "多选题汇总",
          metricName: "总选择次数",
          metricValue: totalSelections,
          optionLabel: EMPTY_CELL,
          optionCount: EMPTY_CELL,
          populationShare: EMPTY_CELL,
          inQuestionShare: EMPTY_CELL,
          totalSelections,
          selectionShare: EMPTY_CELL,
          matrixRowLabel: EMPTY_CELL,
          matrixRowResponses: EMPTY_CELL,
          matrixColumnLabel: EMPTY_CELL,
        },
        {
          ...shared,
          statCategory: "多选题汇总",
          metricName: "人均选择项数",
          metricValue: question.responseCount ? roundToTwo(totalSelections / question.responseCount) : 0,
          optionLabel: EMPTY_CELL,
          optionCount: EMPTY_CELL,
          populationShare: EMPTY_CELL,
          inQuestionShare: EMPTY_CELL,
          totalSelections,
          selectionShare: EMPTY_CELL,
          matrixRowLabel: EMPTY_CELL,
          matrixRowResponses: EMPTY_CELL,
          matrixColumnLabel: EMPTY_CELL,
        },
      );
      rows.push(...question.multiChoice.map((item) => ({
        ...shared,
        statCategory: "选项统计",
        metricName: EMPTY_CELL,
        metricValue: EMPTY_CELL,
        optionLabel: item.label,
        optionCount: item.count,
        populationShare: item.percentage,
        inQuestionShare: question.responseCount ? roundToTwo((item.count / question.responseCount) * 100) : 0,
        totalSelections,
        selectionShare: totalSelections ? roundToTwo((item.count / totalSelections) * 100) : 0,
        matrixRowLabel: EMPTY_CELL,
        matrixRowResponses: EMPTY_CELL,
        matrixColumnLabel: EMPTY_CELL,
      })));
      return;
    }

    if (question.rating) {
      rows.push(
        {
          ...shared,
          statCategory: "评分汇总",
          metricName: "均值",
          metricValue: question.rating.mean,
          optionLabel: EMPTY_CELL,
          optionCount: EMPTY_CELL,
          populationShare: EMPTY_CELL,
          inQuestionShare: EMPTY_CELL,
          totalSelections: EMPTY_CELL,
          selectionShare: EMPTY_CELL,
          matrixRowLabel: EMPTY_CELL,
          matrixRowResponses: EMPTY_CELL,
          matrixColumnLabel: EMPTY_CELL,
        },
        {
          ...shared,
          statCategory: "评分汇总",
          metricName: "中位数",
          metricValue: question.rating.median,
          optionLabel: EMPTY_CELL,
          optionCount: EMPTY_CELL,
          populationShare: EMPTY_CELL,
          inQuestionShare: EMPTY_CELL,
          totalSelections: EMPTY_CELL,
          selectionShare: EMPTY_CELL,
          matrixRowLabel: EMPTY_CELL,
          matrixRowResponses: EMPTY_CELL,
          matrixColumnLabel: EMPTY_CELL,
        },
        {
          ...shared,
          statCategory: "评分汇总",
          metricName: "标准差",
          metricValue: question.rating.stdDev,
          optionLabel: EMPTY_CELL,
          optionCount: EMPTY_CELL,
          populationShare: EMPTY_CELL,
          inQuestionShare: EMPTY_CELL,
          totalSelections: EMPTY_CELL,
          selectionShare: EMPTY_CELL,
          matrixRowLabel: EMPTY_CELL,
          matrixRowResponses: EMPTY_CELL,
          matrixColumnLabel: EMPTY_CELL,
        },
        ...question.rating.distribution.map((item): CsvExportRow => ({
          ...shared,
          statCategory: "评分分布",
          metricName: EMPTY_CELL,
          metricValue: EMPTY_CELL,
          optionLabel: item.label,
          optionCount: item.count,
          populationShare: context.report.totalResponses ? roundToTwo((item.count / context.report.totalResponses) * 100) : 0,
          inQuestionShare: question.responseCount ? roundToTwo((item.count / question.responseCount) * 100) : 0,
          totalSelections: EMPTY_CELL,
          selectionShare: EMPTY_CELL,
          matrixRowLabel: EMPTY_CELL,
          matrixRowResponses: EMPTY_CELL,
          matrixColumnLabel: EMPTY_CELL,
        })),
      );
      return;
    }

    if (question.matrixSingleChoice) {
      rows.push(
        ...question.matrixSingleChoice.rows.flatMap((row) =>
          row.columns.map((column): CsvExportRow => ({
            ...shared,
            statCategory: "矩阵统计",
            metricName: EMPTY_CELL,
            metricValue: EMPTY_CELL,
            optionLabel: EMPTY_CELL,
            optionCount: column.count,
            populationShare: context.report.totalResponses ? roundToTwo((column.count / context.report.totalResponses) * 100) : 0,
            inQuestionShare: column.percentage,
            totalSelections: EMPTY_CELL,
            selectionShare: EMPTY_CELL,
            matrixRowLabel: row.rowLabel,
            matrixRowResponses: row.responses,
            matrixColumnLabel: column.label,
          })),
        ),
      );
      return;
    }

    rows.push({
      ...shared,
      statCategory: "开放题汇总",
      metricName: "回答数量",
      metricValue: question.openText?.answers.length ?? 0,
      optionLabel: EMPTY_CELL,
      optionCount: question.openText?.answers.length ?? 0,
      populationShare: context.report.totalResponses ? roundToTwo(((question.openText?.answers.length ?? 0) / context.report.totalResponses) * 100) : 0,
      inQuestionShare: question.responseCount ? roundToTwo(((question.openText?.answers.length ?? 0) / question.responseCount) * 100) : 0,
      totalSelections: EMPTY_CELL,
      selectionShare: EMPTY_CELL,
      matrixRowLabel: EMPTY_CELL,
      matrixRowResponses: EMPTY_CELL,
      matrixColumnLabel: EMPTY_CELL,
    });
  });

  return rows;
}

function buildOpenTextCsvRows(context: ExportContext): OpenTextCsvExportRow[] {
  const rows: OpenTextCsvExportRow[] = [];

  context.report.questions.forEach((question, index) => {
    if (!question.openText) {
      return;
    }

    const shared = {
      runName: context.run.name,
      surveyTitle: context.run.surveyTitle,
      questionOrder: index + 1,
      questionTitle: question.title,
      questionType: formatQuestionType(question.type),
      responseCount: question.responseCount,
      answerCount: question.openText.answers.length,
    };

    if (!question.openText.answers.length) {
      rows.push({
        ...shared,
        answerIndex: EMPTY_CELL,
        answerText: EMPTY_CELL,
      });
      return;
    }

    rows.push(
      ...question.openText.answers.map((answer, answerIndex) => ({
        ...shared,
        answerIndex: answerIndex + 1,
        answerText: answer,
      })),
    );
  });

  return rows;
}

function renderMetricCards(context: ExportContext) {
  const totalQuestions = context.report.questions.length;
  const avgResponseRate =
    totalQuestions > 0
      ? context.report.questions.reduce((sum, question) => sum + question.responseRate, 0) / totalQuestions
      : 0;
  const totalSkipped = context.report.questions.reduce((sum, question) => sum + (question.diagnostics?.skippedCount ?? 0), 0);

  const cards = [
    { label: "有效答卷", value: String(context.report.totalResponses) },
    { label: "题目数量", value: String(totalQuestions) },
    { label: "平均回答率", value: formatPercent(avgResponseRate) },
    { label: "累计跳答", value: String(totalSkipped) },
  ];

  return cards
    .map(
      (card) => `
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${escapeHtml(card.value)}</div>
        </div>
      `,
    )
    .join("\n");
}

function renderBarRows(items: Array<{ label: string; count: number; percentage: number }>) {
  return items
    .map(
      (item) => `
        <div class="bar-row">
          <div class="bar-head">
            <span class="bar-label">${escapeHtml(item.label)}</span>
            <span class="bar-meta">${item.count} · ${formatPercent(item.percentage)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.max(2, Math.min(100, item.percentage))}%"></div>
          </div>
        </div>
      `,
    )
    .join("\n");
}

function renderMatrixTable(rows: NonNullable<ReportDto["questions"][number]["matrixSingleChoice"]>["rows"]) {
  const columns = rows[0]?.columns ?? [];
  return `
    <table class="matrix-table">
      <thead>
        <tr>
          <th>题项</th>
          ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
          <th>回答数</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.rowLabel)}</td>
                ${columns
                  .map((column) => {
                    const cell = row.columns.find((item) => item.columnId === column.columnId);
                    return `<td>${cell ? `${cell.count} / ${formatPercent(cell.percentage)}` : "-"}</td>`;
                  })
                  .join("")}
                <td>${row.responses}</td>
              </tr>
            `,
          )
          .join("\n")}
      </tbody>
    </table>
  `;
}

function renderQuestionBlock(question: ReportDto["questions"][number], order: number) {
  const isOpenText = Boolean(question.openText) && !question.singleChoice && !question.multiChoice && !question.rating && !question.matrixSingleChoice;
  const diagnostics = isOpenText
    ? ""
    : question.diagnostics
    ? `
      <div class="question-tags">
        <span class="tag">回答数 ${question.responseCount}</span>
        <span class="tag">回答率 ${formatPercent(question.responseRate)}</span>
        <span class="tag">跳答 ${question.diagnostics.skippedCount} / ${formatPercent(question.diagnostics.skippedRate)}</span>
        <span class="tag">平均置信度 ${question.diagnostics.meanConfidence.toFixed(2)}</span>
      </div>
    `
    : `
      <div class="question-tags">
        <span class="tag">回答数 ${question.responseCount}</span>
        <span class="tag">回答率 ${formatPercent(question.responseRate)}</span>
      </div>
    `;

  let body = "";
  if (question.singleChoice) {
    body = `<div class="chart-block">${renderBarRows(question.singleChoice)}</div>`;
  } else if (question.multiChoice) {
    body = `<div class="chart-block">${renderBarRows(question.multiChoice)}</div>`;
  } else if (question.rating) {
    body = `
      <div class="rating-summary">
        <div class="mini-card"><span>均值</span><strong>${question.rating.mean.toFixed(2)}</strong></div>
        <div class="mini-card"><span>中位数</span><strong>${question.rating.median.toFixed(2)}</strong></div>
        <div class="mini-card"><span>标准差</span><strong>${question.rating.stdDev.toFixed(2)}</strong></div>
      </div>
      <div class="chart-block">${renderBarRows(question.rating.distribution.map((item) => ({ ...item, percentage: question.responseCount ? (item.count / question.responseCount) * 100 : 0 })))}</div>
    `;
  } else if (question.matrixSingleChoice) {
    body = renderMatrixTable(question.matrixSingleChoice.rows);
  } else {
    body = `
      <div class="open-count-line">回答数量：${question.openText?.answers.length ?? 0}</div>
    `;
  }

  return `
    <section class="question-card">
      <div class="question-header">
        <div class="question-order">Q${order}</div>
        <div>
          <h2>${escapeHtml(question.title)}</h2>
          <div class="question-type">${escapeHtml(formatQuestionType(question.type))}</div>
        </div>
      </div>
      ${diagnostics}
      ${body}
    </section>
  `;
}

function buildPrintableHtml(context: ExportContext) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(context.run.name)} 统计报表</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #eef3f8;
      color: #142033;
    }
    .snapshot {
      width: 1120px;
      margin: 24px auto;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      border: 1px solid #d8e3f0;
      border-radius: 28px;
      padding: 28px;
      box-shadow: 0 24px 80px rgba(20, 32, 51, 0.12);
    }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .hero-main, .hero-side, .metric-card, .question-card {
      background: #ffffff;
      border: 1px solid #dce6f2;
      border-radius: 20px;
      box-shadow: 0 10px 30px rgba(25, 42, 70, 0.06);
    }
    .hero-main {
      padding: 24px;
      background: radial-gradient(circle at top left, #eff7ff 0%, #ffffff 58%);
    }
    .hero-side {
      padding: 20px;
    }
    .eyebrow {
      display: inline-flex;
      padding: 6px 10px;
      border-radius: 999px;
      background: #e8f1ff;
      color: #2e5fa7;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    h1 {
      margin: 14px 0 10px;
      font-size: 34px;
      line-height: 1.15;
    }
    .hero-meta, .meta-list {
      display: grid;
      gap: 8px;
      color: #50627d;
      font-size: 14px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      padding: 18px 20px;
    }
    .metric-label {
      color: #65809d;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 28px;
      font-weight: 700;
      color: #16335c;
    }
    .question-grid {
      display: grid;
      gap: 16px;
    }
    .question-card {
      padding: 20px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .question-header {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .question-order {
      min-width: 54px;
      height: 54px;
      border-radius: 16px;
      background: #1f4d86;
      color: white;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 18px;
    }
    h2 {
      margin: 0 0 6px;
      font-size: 20px;
      line-height: 1.35;
    }
    .question-type {
      color: #5e748f;
      font-size: 14px;
    }
    .question-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: #eef5ff;
      color: #355b8c;
      font-size: 12px;
      font-weight: 600;
    }
    .chart-block {
      display: grid;
      gap: 10px;
    }
    .bar-row {
      display: grid;
      gap: 6px;
    }
    .bar-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 14px;
    }
    .bar-label {
      font-weight: 600;
      color: #22354f;
    }
    .bar-meta {
      color: #68809a;
      white-space: nowrap;
    }
    .bar-track {
      height: 11px;
      border-radius: 999px;
      background: #eaf0f7;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #4c86d6 0%, #71b2ff 100%);
    }
    .rating-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .open-count-line {
      padding: 14px 16px;
      border-radius: 16px;
      background: #f5f9ff;
      border: 1px solid #dce8f5;
      color: #143a63;
      font-size: 15px;
      font-weight: 600;
    }
    .mini-card {
      background: #f5f9ff;
      border: 1px solid #dce8f5;
      border-radius: 16px;
      padding: 14px;
      display: grid;
      gap: 6px;
    }
    .mini-card span {
      color: #6a7d97;
      font-size: 13px;
    }
    .mini-card strong {
      font-size: 24px;
      color: #143a63;
    }
    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid #d9e4ef;
    }
    .matrix-table th, .matrix-table td {
      border-bottom: 1px solid #e2ebf4;
      padding: 10px 12px;
      text-align: left;
      font-size: 13px;
    }
    .matrix-table th {
      background: #f4f8fc;
      color: #39536f;
    }
    .muted {
      color: #74879f;
      font-size: 13px;
    }
    @media print {
      body {
        background: white;
      }
      .snapshot {
        width: auto;
        margin: 0;
        box-shadow: none;
        border: none;
        border-radius: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="snapshot">
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">Report Snapshot</div>
        <h1>${escapeHtml(context.run.surveyTitle)}</h1>
        <div class="hero-meta">
          <div><strong>批次名称：</strong>${escapeHtml(context.run.name)}</div>
          <div><strong>运行状态：</strong>${escapeHtml(context.run.status)}</div>
          <div><strong>开始时间：</strong>${escapeHtml(formatDate(context.run.startedAt))}</div>
          <div><strong>完成时间：</strong>${escapeHtml(formatDate(context.run.completedAt))}</div>
        </div>
      </div>
      <div class="hero-side">
        <div class="meta-list">
          <div><strong>导出类型：</strong>统计报表快照</div>
          <div><strong>问卷批次 ID：</strong>${escapeHtml(context.run.id)}</div>
          <div><strong>创建时间：</strong>${escapeHtml(formatDate(context.run.createdAt))}</div>
          <div><strong>题目总数：</strong>${context.report.questions.length}</div>
          <div><strong>有效答卷：</strong>${context.report.totalResponses}</div>
        </div>
      </div>
    </section>

    <section class="metric-grid">
      ${renderMetricCards(context)}
    </section>

    <section class="question-grid">
      ${context.report.questions.map((question, index) => renderQuestionBlock(question, index + 1)).join("\n")}
    </section>
  </div>
</body>
</html>`;
}

export class ExportService {
  private readonly reportService = new ReportService();

  async exportJson(user: AuthUserContext, runId: string) {
    const context = await this.loadContext(user, runId);
    const payload = buildSanitizedJson(context);
    const filePath = path.resolve(env.STORAGE_DIR, "exports", `${runId}.json`);
    await writeTextFile(filePath, JSON.stringify(payload, null, 2));
    return { filePath, payload };
  }

  async exportCsv(user: AuthUserContext, runId: string) {
    const context = await this.loadContext(user, runId);
    const rows = buildCsvRows(context);
    const csv = stringify(rows, { header: true, columns: CSV_COLUMNS as any });
    const filePath = path.resolve(env.STORAGE_DIR, "exports", `${runId}.csv`);
    await writeTextFile(filePath, csv);
    return { filePath, csv };
  }

  async exportOpenTextCsv(user: AuthUserContext, runId: string) {
    const context = await this.loadContext(user, runId);
    const rows = buildOpenTextCsvRows(context);
    const csv = stringify(rows, { header: true, columns: OPEN_TEXT_CSV_COLUMNS as any });
    const filePath = path.resolve(env.STORAGE_DIR, "exports", `${runId}-open-text.csv`);
    await writeTextFile(filePath, csv);
    return { filePath, csv };
  }

  async exportRawResponseCsv(user: AuthUserContext, runId: string) {
    const context = await this.loadContext(user, runId);
    const { rows, columns } = buildRawResponseCsv(context);
    const csv = stringify(rows, { header: true, columns: columns as any });
    const filePath = path.resolve(env.STORAGE_DIR, "exports", `${runId}-raw-responses.csv`);
    await writeTextFile(filePath, csv);
    return { filePath, csv };
  }

  async exportHtml(user: AuthUserContext, runId: string) {
    const context = await this.loadContext(user, runId);
    const html = buildPrintableHtml(context);
    const filePath = path.resolve(env.STORAGE_DIR, "reports", `${runId}.html`);
    await ensureDir(path.dirname(filePath));
    await writeTextFile(filePath, html);
    return { filePath, html };
  }

  private async loadContext(user: AuthUserContext, runId: string): Promise<ExportContext> {
    const run = await prisma.mockRun.findFirst({
      where: isAdmin(user) ? { id: runId } : { id: runId, userId: user.id },
      include: {
        survey: true,
        participantInstances: {
          include: {
            surveyResponse: {
              include: {
                answers: true,
              },
            },
          },
          orderBy: {
            ordinal: "asc",
          },
        },
      },
    });

    if (!run) {
      throw new Error("Mock run not found");
    }

    const surveySchema = fromJson<SurveySchemaDto>(run.survey.schema);
    const report = await this.reportService.getReport(user, runId, {});

    return {
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
        surveyTitle: run.survey.title,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
      surveySchema,
      participants: run.participantInstances.map((participant) => ({
        participantId: participant.id,
        participantOrdinal: participant.ordinal,
        participantStatus: participant.status,
        responseStatus: participant.surveyResponse?.status ?? EMPTY_CELL,
        responseCompletedAt: participant.surveyResponse?.completedAt ?? null,
        identity: fromJson<ParticipantIdentity>(participant.identity),
        answers: readStructuredAnswers(participant.surveyResponse),
      })),
      report,
    };
  }
}
