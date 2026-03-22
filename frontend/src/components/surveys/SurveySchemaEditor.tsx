import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography } from "antd";
import type { SurveyQuestionDto, SurveySchemaDto } from "@surveysim/shared";
import { useI18n } from "@/i18n/I18nProvider";

const questionTypeOptions = [
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
].map((value) => ({ label: value, value }));

const languageOptions = [
  { label: "auto", value: "auto" },
  { label: "中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
];

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function reorderByIndex<T extends { displayOrder: number }>(items: T[], fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item, index) => ({ ...item, displayOrder: index }));
}

function isChoiceQuestion(type: SurveySchemaDto["sections"][number]["questions"][number]["type"]) {
  return ["single_choice", "multi_choice", "single_choice_other", "multi_choice_other"].includes(type);
}

function isMatrixQuestion(type: SurveySchemaDto["sections"][number]["questions"][number]["type"]) {
  return type === "matrix_single_choice";
}

function isInstructionalQuestion(type: SurveyQuestionDto["type"]) {
  return ["paragraph", "section_title", "respondent_instruction"].includes(type);
}

function createDefaultOptions(t: (key: string) => string) {
  return [
    { id: uid("option"), label: `${t("surveyEditor.optionPrefix")} A`, value: `${t("surveyEditor.optionPrefix")} A`, displayOrder: 0 },
    { id: uid("option"), label: `${t("surveyEditor.optionPrefix")} B`, value: `${t("surveyEditor.optionPrefix")} B`, displayOrder: 1 },
  ];
}

function createDefaultQuestion(t: (key: string) => string): SurveyQuestionDto {
  return {
    id: uid("question"),
    code: undefined,
    title: t("surveyEditor.newQuestion"),
    description: undefined,
    type: "single_choice",
    required: false,
    displayOrder: 0,
    respondentInstructions: undefined,
    options: createDefaultOptions(t),
    matrix: undefined,
    validation: undefined,
  };
}

function getQuestionIntentLabel(question: SurveyQuestionDto, t: (key: string) => string) {
  if (isInstructionalQuestion(question.type)) return t("surveyEditor.intentInstruction");
  if (isMatrixQuestion(question.type)) return t("surveyEditor.intentMatrix");
  if (isChoiceQuestion(question.type)) return t("surveyEditor.intentChoice");
  if (question.type === "rating") return t("surveyEditor.intentRating");
  if (question.type === "open_text") return t("surveyEditor.intentOpenText");
  return t("surveyEditor.intentQuestion");
}

function getQuestionHelper(question: SurveyQuestionDto, t: (key: string) => string) {
  if (question.type === "paragraph") return t("surveyEditor.helperParagraph");
  if (question.type === "section_title") return t("surveyEditor.helperSectionTitle");
  if (question.type === "respondent_instruction") return t("surveyEditor.helperRespondentInstruction");
  if (question.type === "rating") return t("surveyEditor.helperRating");
  if (question.type === "open_text") return t("surveyEditor.helperOpenText");
  if (isChoiceQuestion(question.type)) return t("surveyEditor.helperChoice");
  if (isMatrixQuestion(question.type)) return t("surveyEditor.helperMatrix");
  return t("surveyEditor.helperQuestion");
}

function createDefaultMatrix(t: (key: string) => string) {
  return {
    selectionMode: "single_per_row" as const,
    rows: [
      { id: uid("row"), label: `${t("surveyEditor.matrixRowPrefix")} 1`, description: undefined, displayOrder: 0 },
      { id: uid("row"), label: `${t("surveyEditor.matrixRowPrefix")} 2`, description: undefined, displayOrder: 1 },
    ],
    columns: [
      { id: uid("col"), label: `${t("surveyEditor.matrixColumnPrefix")} 1`, value: `${t("surveyEditor.matrixColumnPrefix")} 1`, displayOrder: 0 },
      { id: uid("col"), label: `${t("surveyEditor.matrixColumnPrefix")} 2`, value: `${t("surveyEditor.matrixColumnPrefix")} 2`, displayOrder: 1 },
    ],
  };
}

function normalizeQuestionForType(
  question: SurveySchemaDto["sections"][number]["questions"][number],
  type: SurveySchemaDto["sections"][number]["questions"][number]["type"],
  t: (key: string) => string,
) {
  if (isInstructionalQuestion(type)) {
    return {
      ...question,
      type,
      code: undefined,
      required: false,
      respondentInstructions: undefined,
      options: [],
      matrix: undefined,
      validation: undefined,
    };
  }

  if (isChoiceQuestion(type)) {
    return {
      ...question,
      type,
      options: question.options.length > 0 ? question.options : createDefaultOptions(t),
      matrix: undefined,
      validation: {
        ...question.validation,
        minRating: undefined,
        maxRating: undefined,
        minLength: undefined,
        maxLength: undefined,
      },
    };
  }

  if (isMatrixQuestion(type)) {
    return {
      ...question,
      type,
      required: question.required ?? false,
      options: [],
      matrix: question.matrix ?? createDefaultMatrix(t),
      validation: undefined,
    };
  }

  if (type === "rating") {
    return {
      ...question,
      type,
      options: [],
      matrix: undefined,
      validation: {
        ...question.validation,
        minSelections: undefined,
        maxSelections: undefined,
        minLength: undefined,
        maxLength: undefined,
      },
    };
  }

  if (type === "open_text") {
    return {
      ...question,
      type,
      options: [],
      matrix: undefined,
      validation: {
        ...question.validation,
        minSelections: undefined,
        maxSelections: undefined,
        minRating: undefined,
        maxRating: undefined,
      },
    };
  }

  return {
    ...question,
    type,
    options: [],
    matrix: undefined,
    validation: undefined,
  };
}

export function SurveySchemaEditor({ value, onChange }: { value: SurveySchemaDto; onChange: (next: SurveySchemaDto) => void }) {
  const { t } = useI18n();
  const questionCount = value.sections.reduce((sum, section) => sum + section.questions.length, 0);
  const updateSection = (sectionId: string, updater: (section: SurveySchemaDto["sections"][number]) => SurveySchemaDto["sections"][number]) => {
    onChange({ ...value, sections: value.sections.map((section) => (section.id === sectionId ? updater(section) : section)) });
  };

  const updateQuestion = (
    sectionId: string,
    questionId: string,
    updater: (question: SurveySchemaDto["sections"][number]["questions"][number]) => SurveySchemaDto["sections"][number]["questions"][number],
  ) => {
    updateSection(sectionId, (current) => ({
      ...current,
      questions: current.questions.map((item) => (item.id === questionId ? updater(item) : item)),
    }));
  };

  return (
    <div className="survey-editor-shell">
      <div className="survey-editor-summary">
        <div className="survey-editor-summary-card">
          <div className="metric-label">{t("surveyEditor.surveySummaryTitle")}</div>
          <div className="metric-value" style={{ fontSize: 28 }}>{value.survey.title}</div>
        </div>
        <div className="survey-editor-summary-card">
          <div className="metric-label">{t("surveyEditor.sectionCount")}</div>
          <div className="metric-value" style={{ fontSize: 28 }}>{value.sections.length}</div>
        </div>
        <div className="survey-editor-summary-card">
          <div className="metric-label">{t("surveyEditor.questionCount")}</div>
          <div className="metric-value" style={{ fontSize: 28 }}>{questionCount}</div>
        </div>
      </div>

      <Card className="survey-editor-section-card">
        <Form layout="vertical">
          <Form.Item label={t("surveyEditor.surveyTitle")}>
            <Input value={value.survey.title} onChange={(event) => onChange({ ...value, survey: { ...value.survey, title: event.target.value } })} />
          </Form.Item>
          <Form.Item label={t("surveyEditor.surveyDescription")}>
            <Input.TextArea rows={2} value={value.survey.description} onChange={(event) => onChange({ ...value, survey: { ...value.survey, description: event.target.value } })} />
          </Form.Item>
          <div className="survey-editor-inline-grid">
            <Form.Item label={t("surveyEditor.language")}>
              <Select
                value={value.survey.language}
                options={languageOptions}
                onChange={(language) => onChange({ ...value, survey: { ...value.survey, language } })}
              />
            </Form.Item>
          </div>
          <Form.Item label={t("surveyEditor.respondentInstructions")}>
            <Input.TextArea rows={3} value={value.survey.respondentInstructions} onChange={(event) => onChange({ ...value, survey: { ...value.survey, respondentInstructions: event.target.value } })} />
          </Form.Item>
        </Form>
      </Card>

      {value.sections.map((section, sectionIndex) => (
        <Card
          key={section.id}
          className="survey-editor-section-card"
          title={section.title}
          extra={
            <Space>
              <Button
                icon={<ArrowUpOutlined />}
                disabled={sectionIndex === 0}
                onClick={() => onChange({ ...value, sections: reorderByIndex(value.sections, sectionIndex, sectionIndex - 1) })}
              />
              <Button
                icon={<ArrowDownOutlined />}
                disabled={sectionIndex === value.sections.length - 1}
                onClick={() => onChange({ ...value, sections: reorderByIndex(value.sections, sectionIndex, sectionIndex + 1) })}
              />
              <Button danger icon={<DeleteOutlined />} onClick={() => onChange({ ...value, sections: value.sections.filter((item) => item.id !== section.id).map((item, index) => ({ ...item, displayOrder: index })) })} />
            </Space>
          }
        >
          <div className="survey-editor-section-meta">
            <Tag>{t("surveyEditor.sectionTag", { index: sectionIndex + 1 })}</Tag>
            <Tag>{t("surveyEditor.sectionQuestionCount", { count: section.questions.length })}</Tag>
          </div>
          <Form layout="vertical">
            <Form.Item label={t("surveyEditor.sectionTitle")}>
              <Input value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
            </Form.Item>
            <Form.Item label={t("surveyEditor.sectionDescription")}>
              <Input.TextArea rows={2} value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} />
            </Form.Item>
          </Form>
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            {section.questions.map((question, questionIndex) => (
              <div key={question.id} className="survey-editor-question-card">
                <div className="survey-editor-question-head">
                  <div className="survey-editor-question-head-main">
                    <div className="survey-editor-question-meta">
                      <Tag color="blue">{t(`questionType.${question.type}`)}</Tag>
                      <Tag>{getQuestionIntentLabel(question, t)}</Tag>
                      {question.required && !isInstructionalQuestion(question.type) ? <Tag color="gold">{t("surveyEditor.requiredTag")}</Tag> : null}
                    </div>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 0 }}>
                      {question.title || question.id}
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                      {getQuestionHelper(question, t)}
                    </Typography.Paragraph>
                  </div>
                  <div className="survey-editor-compact-actions">
                    <Button
                      icon={<ArrowUpOutlined />}
                      disabled={questionIndex === 0}
                      onClick={() =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          questions: reorderByIndex(current.questions, questionIndex, questionIndex - 1),
                        }))
                      }
                    />
                    <Button
                      icon={<ArrowDownOutlined />}
                      disabled={questionIndex === section.questions.length - 1}
                      onClick={() =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          questions: reorderByIndex(current.questions, questionIndex, questionIndex + 1),
                        }))
                      }
                    />
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          questions: current.questions.filter((item) => item.id !== question.id).map((item, index) => ({ ...item, displayOrder: index })),
                        }))
                      }
                    />
                  </div>
                </div>
                <Form layout="vertical">
                  <div className="survey-editor-inline-grid">
                    <Form.Item label={t("surveyEditor.type")}>
                      <Select
                        value={question.type}
                        style={{ width: "100%" }}
                        options={questionTypeOptions.map((option) => ({ ...option, label: t(`questionType.${option.value}`) }))}
                        onChange={(type) => updateQuestion(section.id, question.id, (current) => normalizeQuestionForType(current, type, t))}
                      />
                    </Form.Item>
                    {!isInstructionalQuestion(question.type) ? (
                      <Form.Item label={t("surveyEditor.required")}>
                        <Switch checked={question.required} onChange={(required) => updateQuestion(section.id, question.id, (current) => ({ ...current, required }))} />
                      </Form.Item>
                    ) : null}
                    {!isInstructionalQuestion(question.type) ? (
                      <Form.Item label={t("surveyEditor.questionCode")}>
                        <Input value={question.code} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, code: event.target.value || undefined }))} />
                      </Form.Item>
                    ) : null}
                  </div>
                  <Form.Item label={t("surveyEditor.title")}>
                    <Input value={question.title} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, title: event.target.value }))} />
                  </Form.Item>
                  {isInstructionalQuestion(question.type) ? (
                    <Form.Item label={t("surveyEditor.content")}>
                      <Input.TextArea rows={question.type === "section_title" ? 2 : 4} value={question.description} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, description: event.target.value || undefined }))} />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item label={t("surveyEditor.description")}>
                        <Input.TextArea rows={2} value={question.description} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, description: event.target.value || undefined }))} />
                      </Form.Item>
                      <Form.Item label={t("surveyEditor.respondentInstructions")}>
                        <Input.TextArea rows={2} value={question.respondentInstructions} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, respondentInstructions: event.target.value || undefined }))} />
                      </Form.Item>
                    </>
                  )}
                  {question.type === "rating" ? (
                    <div className="survey-editor-inline-grid">
                      <Form.Item label={t("surveyEditor.minRating")}>
                        <InputNumber style={{ width: "100%" }} value={question.validation?.minRating ?? 1} onChange={(minRating) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minRating: minRating ?? 1, maxRating: current.validation?.maxRating ?? 5 } }))} />
                      </Form.Item>
                      <Form.Item label={t("surveyEditor.maxRating")}>
                        <InputNumber style={{ width: "100%" }} value={question.validation?.maxRating ?? 5} onChange={(maxRating) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minRating: current.validation?.minRating ?? 1, maxRating: maxRating ?? 5 } }))} />
                      </Form.Item>
                    </div>
                  ) : null}
                  {isChoiceQuestion(question.type) ? (
                    <div className="survey-editor-inline-grid">
                      <Form.Item label={t("surveyEditor.minSelections")}>
                        <InputNumber
                          min={0}
                          style={{ width: "100%" }}
                          value={question.validation?.minSelections}
                          onChange={(minSelections) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minSelections: minSelections ?? undefined } }))}
                        />
                      </Form.Item>
                      <Form.Item label={t("surveyEditor.maxSelections")}>
                        <InputNumber
                          min={0}
                          style={{ width: "100%" }}
                          value={question.validation?.maxSelections}
                          onChange={(maxSelections) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, maxSelections: maxSelections ?? undefined } }))}
                        />
                      </Form.Item>
                    </div>
                  ) : null}
                  {question.type === "open_text" ? (
                    <div className="survey-editor-inline-grid">
                      <Form.Item label={t("surveyEditor.minLength")}>
                        <InputNumber
                          min={0}
                          style={{ width: "100%" }}
                          value={question.validation?.minLength}
                          onChange={(minLength) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minLength: minLength ?? undefined } }))}
                        />
                      </Form.Item>
                      <Form.Item label={t("surveyEditor.maxLength")}>
                        <InputNumber
                          min={0}
                          style={{ width: "100%" }}
                          value={question.validation?.maxLength}
                          onChange={(maxLength) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, maxLength: maxLength ?? undefined } }))}
                        />
                      </Form.Item>
                    </div>
                  ) : null}
                  {isChoiceQuestion(question.type) ? (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Typography.Text strong>{t("surveyEditor.optionsTitle")}</Typography.Text>
                      {question.options.map((option, optionIndex) => (
                        <div key={option.id} className="survey-editor-option-row">
                          <Input
                            value={option.label}
                            placeholder={t("surveyEditor.optionLabel")}
                            onChange={(event) =>
                              updateQuestion(section.id, question.id, (current) => ({
                                ...current,
                                options: current.options.map((candidate) => (candidate.id === option.id ? { ...candidate, label: event.target.value, value: event.target.value } : candidate)),
                              }))
                            }
                          />
                          <Switch
                            checked={Boolean(option.allowOther)}
                            onChange={(allowOther) =>
                              updateQuestion(section.id, question.id, (current) => ({
                                ...current,
                                options: current.options.map((candidate) => (candidate.id === option.id ? { ...candidate, allowOther } : candidate)),
                              }))
                            }
                          />
                          <Button
                            icon={<ArrowUpOutlined />}
                            disabled={optionIndex === 0}
                            onClick={() =>
                              updateQuestion(section.id, question.id, (current) => ({
                                ...current,
                                options: reorderByIndex(current.options, optionIndex, optionIndex - 1),
                              }))
                            }
                          />
                          <Button
                            icon={<ArrowDownOutlined />}
                            disabled={optionIndex === question.options.length - 1}
                            onClick={() =>
                              updateQuestion(section.id, question.id, (current) => ({
                                ...current,
                                options: reorderByIndex(current.options, optionIndex, optionIndex + 1),
                              }))
                            }
                          />
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() =>
                              updateQuestion(section.id, question.id, (current) => ({
                                ...current,
                                options: current.options.filter((candidate) => candidate.id !== option.id).map((candidate, index) => ({ ...candidate, displayOrder: index })),
                              }))
                            }
                          />
                        </div>
                      ))}
                      <Typography.Text type="secondary">{t("surveyEditor.optionOtherHint")}</Typography.Text>
                      <Button
                        icon={<PlusOutlined />}
                        onClick={() =>
                          updateQuestion(section.id, question.id, (current) => ({
                            ...current,
                            options: [...current.options, { id: uid("option"), label: t("surveyEditor.newOption"), value: t("surveyEditor.newOption"), displayOrder: current.options.length }],
                          }))
                        }
                      >
                        {t("surveyEditor.addOption")}
                      </Button>
                    </Space>
                  ) : null}
                  {(() => {
                    if (!isMatrixQuestion(question.type) || !question.matrix) return null;
                    const matrix = question.matrix;

                    return (
                    <Space direction="vertical" style={{ width: "100%" }} size={16}>
                      <Typography.Text type="secondary">{t("surveyEditor.matrixHint")}</Typography.Text>
                      <div className="rule-card">
                        <Space direction="vertical" style={{ width: "100%" }} size={12}>
                          <Space style={{ width: "100%", justifyContent: "space-between" }}>
                            <Typography.Title level={5} style={{ margin: 0 }}>
                              {t("surveyEditor.matrixRows")}
                            </Typography.Title>
                            <Button
                              icon={<PlusOutlined />}
                              onClick={() =>
                                updateQuestion(section.id, question.id, (current) => ({
                                  ...current,
                                  matrix: current.matrix
                                    ? {
                                        ...current.matrix,
                                        rows: [
                                          ...current.matrix.rows,
                                          {
                                            id: uid("row"),
                                            label: `${t("surveyEditor.matrixRowPrefix")} ${current.matrix.rows.length + 1}`,
                                            description: undefined,
                                            displayOrder: current.matrix.rows.length,
                                          },
                                        ],
                                      }
                                    : createDefaultMatrix(t),
                                }))
                              }
                            >
                              {t("surveyEditor.addMatrixRow")}
                            </Button>
                          </Space>
                          {matrix.rows.map((row, rowIndex) => (
                            <div key={row.id} className="survey-editor-matrix-row">
                              <Input
                                value={row.label}
                                placeholder={t("surveyEditor.matrixRowLabel")}
                                onChange={(event) =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? {
                                          ...current.matrix,
                                          rows: current.matrix.rows.map((candidate) =>
                                            candidate.id === row.id ? { ...candidate, label: event.target.value } : candidate,
                                          ),
                                        }
                                      : undefined,
                                  }))
                                }
                              />
                              <Input
                                value={row.description}
                                placeholder={t("surveyEditor.matrixRowDescription")}
                                onChange={(event) =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? {
                                          ...current.matrix,
                                          rows: current.matrix.rows.map((candidate) =>
                                            candidate.id === row.id ? { ...candidate, description: event.target.value || undefined } : candidate,
                                          ),
                                        }
                                      : undefined,
                                  }))
                                }
                              />
                              <Button
                                icon={<ArrowUpOutlined />}
                                disabled={rowIndex === 0}
                                onClick={() =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? { ...current.matrix, rows: reorderByIndex(current.matrix.rows, rowIndex, rowIndex - 1) }
                                      : undefined,
                                  }))
                                }
                              />
                              <Button
                                icon={<ArrowDownOutlined />}
                                disabled={rowIndex === matrix.rows.length - 1}
                                onClick={() =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? { ...current.matrix, rows: reorderByIndex(current.matrix.rows, rowIndex, rowIndex + 1) }
                                      : undefined,
                                  }))
                                }
                              />
                              <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? {
                                          ...current.matrix,
                                          rows: current.matrix.rows
                                            .filter((candidate) => candidate.id !== row.id)
                                            .map((candidate, index) => ({ ...candidate, displayOrder: index })),
                                        }
                                      : undefined,
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </Space>
                      </div>

                      <div className="rule-card">
                        <Space direction="vertical" style={{ width: "100%" }} size={12}>
                          <Space style={{ width: "100%", justifyContent: "space-between" }}>
                            <Typography.Title level={5} style={{ margin: 0 }}>
                              {t("surveyEditor.matrixColumns")}
                            </Typography.Title>
                            <Button
                              icon={<PlusOutlined />}
                              onClick={() =>
                                updateQuestion(section.id, question.id, (current) => ({
                                  ...current,
                                  matrix: current.matrix
                                    ? {
                                        ...current.matrix,
                                        columns: [
                                          ...current.matrix.columns,
                                          {
                                            id: uid("col"),
                                            label: `${t("surveyEditor.matrixColumnPrefix")} ${current.matrix.columns.length + 1}`,
                                            value: `${t("surveyEditor.matrixColumnPrefix")} ${current.matrix.columns.length + 1}`,
                                            displayOrder: current.matrix.columns.length,
                                          },
                                        ],
                                      }
                                    : createDefaultMatrix(t),
                                }))
                              }
                            >
                              {t("surveyEditor.addMatrixColumn")}
                            </Button>
                          </Space>
                          {matrix.columns.map((column, columnIndex) => (
                            <div key={column.id} className="survey-editor-matrix-column-row">
                              <Input
                                value={column.label}
                                placeholder={t("surveyEditor.matrixColumnLabel")}
                                onChange={(event) =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? {
                                          ...current.matrix,
                                          columns: current.matrix.columns.map((candidate) =>
                                            candidate.id === column.id
                                              ? { ...candidate, label: event.target.value, value: event.target.value }
                                              : candidate,
                                          ),
                                        }
                                      : undefined,
                                  }))
                                }
                              />
                              <Button
                                icon={<ArrowUpOutlined />}
                                disabled={columnIndex === 0}
                                onClick={() =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? { ...current.matrix, columns: reorderByIndex(current.matrix.columns, columnIndex, columnIndex - 1) }
                                      : undefined,
                                  }))
                                }
                              />
                              <Button
                                icon={<ArrowDownOutlined />}
                                disabled={columnIndex === matrix.columns.length - 1}
                                onClick={() =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? { ...current.matrix, columns: reorderByIndex(current.matrix.columns, columnIndex, columnIndex + 1) }
                                      : undefined,
                                  }))
                                }
                              />
                              <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  updateQuestion(section.id, question.id, (current) => ({
                                    ...current,
                                    matrix: current.matrix
                                      ? {
                                          ...current.matrix,
                                          columns: current.matrix.columns
                                            .filter((candidate) => candidate.id !== column.id)
                                            .map((candidate, index) => ({ ...candidate, displayOrder: index })),
                                        }
                                      : undefined,
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </Space>
                      </div>

                      <div className="rule-card">
                        <Typography.Title level={5}>{t("surveyEditor.matrixPreview")}</Typography.Title>
                        <Table
                          size="small"
                          pagination={false}
                          rowKey="id"
                          dataSource={question.matrix.rows}
                          scroll={{ x: true }}
                          columns={[
                            { title: t("surveyEditor.matrixRowLabel"), dataIndex: "label", key: "label", fixed: "left", width: 240 },
                            ...matrix.columns.map((column) => ({
                              title: column.label,
                              key: column.id,
                              width: 140,
                              render: () => <Typography.Text type="secondary">{t("surveyEditor.matrixSingleSelectCell")}</Typography.Text>,
                            })),
                          ]}
                        />
                      </div>
                    </Space>
                    );
                  })()}
                </Form>
              </div>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() =>
                updateSection(section.id, (current) => ({
                  ...current,
                  questions: [
                    ...current.questions,
                    {
                      ...createDefaultQuestion(t),
                      displayOrder: current.questions.length,
                    },
                  ],
                }))
              }
            >
              {t("surveyEditor.addQuestion")}
            </Button>
          </Space>
        </Card>
      ))}

      <Button
        block
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() =>
          onChange({
            ...value,
            sections: [...value.sections, { id: uid("section"), title: `${t("surveyEditor.sectionPrefix")} ${value.sections.length + 1}`, displayOrder: value.sections.length, questions: [] }],
          })
        }
      >
        {t("surveyEditor.addSection")}
      </Button>
    </div>
  );
}
