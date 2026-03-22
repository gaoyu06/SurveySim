import { ArrowLeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Radio,
  Rate,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { SurveyQuestionDto, SurveySchemaDto } from "@surveysim/shared";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

type SurveyRecord = {
  id: string;
  title: string;
  description?: string;
  rawText: string;
  schema: SurveySchemaDto;
  createdAt: string;
  updatedAt: string;
};

type MatrixRowDto = NonNullable<SurveyQuestionDto["matrix"]>["rows"][number];

function isInstructionalQuestion(type: SurveyQuestionDto["type"]) {
  return ["paragraph", "section_title", "respondent_instruction"].includes(type);
}

function renderQuestionMeta(question: SurveyQuestionDto, t: (key: string, params?: Record<string, string | number>) => string) {
  if (isInstructionalQuestion(question.type)) {
    return (
      <Space wrap size={[8, 8]}>
        <Tag color="blue">{t(`questionType.${question.type}`)}</Tag>
      </Space>
    );
  }

  return (
    <Space wrap size={[8, 8]}>
      <Tag color="blue">{t(`questionType.${question.type}`)}</Tag>
      {question.required ? <Tag color="gold">{t("surveyEditor.requiredTag")}</Tag> : null}
      {question.code ? <Tag>{question.code}</Tag> : null}
    </Space>
  );
}

function MatrixPreviewTable({ question, t }: { question: SurveyQuestionDto; t: (key: string, params?: Record<string, string | number>) => string }) {
  const matrix = question.matrix;
  const [valueByRow, setValueByRow] = useState<Record<string, string | undefined>>({});
  const columns = useMemo<ColumnsType<MatrixRowDto>>(() => {
    if (!matrix) return [];

    return [
      {
        title: t("surveyEditor.matrixRowLabel"),
        dataIndex: "label",
        key: "label",
        fixed: "left",
        width: 220,
        render: (_, row) => (
          <Space direction="vertical" size={2}>
            <Typography.Text>{row.label}</Typography.Text>
            {row.description ? <Typography.Text type="secondary">{row.description}</Typography.Text> : null}
          </Space>
        ),
      },
      ...matrix.columns.map((column) => ({
        title: column.label,
        dataIndex: column.id,
        key: column.id,
        width: 120,
        align: "center" as const,
        render: (_: unknown, row: MatrixRowDto) => (
          <Radio
            checked={valueByRow[row.id] === column.id}
            onChange={() => {
              setValueByRow((current) => ({ ...current, [row.id]: column.id }));
            }}
          />
        ),
      })),
    ];
  }, [matrix, t, valueByRow]);

  if (!matrix) return null;

  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={matrix.rows}
      columns={columns}
      scroll={{ x: true }}
    />
  );
}

function QuestionPreview({
  question,
  t,
}: {
  question: SurveyQuestionDto;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [singleChoiceValue, setSingleChoiceValue] = useState<string>();
  const [multiChoiceValue, setMultiChoiceValue] = useState<string[]>([]);
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [textValue, setTextValue] = useState("");
  const [otherValueByOptionId, setOtherValueByOptionId] = useState<Record<string, string>>({});

  if (question.type === "section_title") {
    return (
      <div className="survey-preview-instruction survey-preview-instruction--section">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {question.title}
        </Typography.Title>
        {question.description ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 10 }}>
            {question.description}
          </Typography.Paragraph>
        ) : null}
      </div>
    );
  }

  if (question.type === "paragraph") {
    return (
      <div className="survey-preview-instruction">
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 10 }}>
          {question.title}
        </Typography.Title>
        {question.description ? (
          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
            {question.description}
          </Typography.Paragraph>
        ) : null}
      </div>
    );
  }

  if (question.type === "respondent_instruction") {
    return (
      <div className="survey-preview-instruction survey-preview-instruction--hint">
        <Typography.Text strong>{question.title}</Typography.Text>
        {question.description ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8, whiteSpace: "pre-wrap" }}>
            {question.description}
          </Typography.Paragraph>
        ) : null}
      </div>
    );
  }

  return (
    <Card className="survey-preview-question" bordered={false}>
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        {renderQuestionMeta(question, t)}
        <div>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
            {question.title}
          </Typography.Title>
          {question.description ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {question.description}
            </Typography.Paragraph>
          ) : null}
          {question.respondentInstructions ? (
            <Typography.Paragraph className="survey-preview-inline-note">
              {question.respondentInstructions}
            </Typography.Paragraph>
          ) : null}
        </div>

        {question.type === "single_choice" || question.type === "single_choice_other" ? (
          <Radio.Group style={{ width: "100%" }} value={singleChoiceValue} onChange={(event) => setSingleChoiceValue(event.target.value)}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {question.options.map((option) => (
                <div key={option.id} className="survey-preview-option">
                  <Radio value={option.id}>
                    {option.label}
                  </Radio>
                  {option.allowOther && singleChoiceValue === option.id ? (
                    <Input
                      value={otherValueByOptionId[option.id] ?? ""}
                      onChange={(event) =>
                        setOtherValueByOptionId((current) => ({ ...current, [option.id]: event.target.value }))
                      }
                      placeholder={t("surveyPreview.otherPlaceholder")}
                    />
                  ) : null}
                </div>
              ))}
            </Space>
          </Radio.Group>
        ) : null}

        {question.type === "multi_choice" || question.type === "multi_choice_other" ? (
          <Checkbox.Group style={{ width: "100%" }} value={multiChoiceValue} onChange={(values) => setMultiChoiceValue(values as string[])}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {question.options.map((option) => (
                <div key={option.id} className="survey-preview-option">
                  <Checkbox value={option.id}>
                    {option.label}
                  </Checkbox>
                  {option.allowOther && multiChoiceValue.includes(option.id) ? (
                    <Input
                      value={otherValueByOptionId[option.id] ?? ""}
                      onChange={(event) =>
                        setOtherValueByOptionId((current) => ({ ...current, [option.id]: event.target.value }))
                      }
                      placeholder={t("surveyPreview.otherPlaceholder")}
                    />
                  ) : null}
                </div>
              ))}
            </Space>
          </Checkbox.Group>
        ) : null}

        {question.type === "rating" ? (
          <div className="survey-preview-rating">
            <Rate count={Number(question.validation?.maxRating ?? 5)} value={ratingValue} onChange={setRatingValue} />
            <Typography.Text type="secondary">
              {`${question.validation?.minRating ?? 1} - ${question.validation?.maxRating ?? 5}`}
            </Typography.Text>
          </div>
        ) : null}

        {question.type === "open_text" ? (
          <Input.TextArea
            rows={4}
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder={t("surveyPreview.openTextPlaceholder")}
          />
        ) : null}

        {question.type === "matrix_single_choice" ? <MatrixPreviewTable question={question} t={t} /> : null}
      </Space>
    </Card>
  );
}

export function SurveyPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const surveyQuery = useQuery({
    queryKey: ["survey", id],
    queryFn: () => apiClient.get<SurveyRecord>(`/surveys/${id}`),
    enabled: Boolean(id),
  });

  return (
    <>
      <PageHeader
        title={surveyQuery.data?.title ?? t("surveys.previewTitle")}
        subtitle={t("surveys.previewSubtitle")}
        actions={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/surveys")}>
            {t("common.back")}
          </Button>
        }
      />

      {surveyQuery.isLoading ? (
        <Panel>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Panel>
      ) : surveyQuery.data ? (
        <div className="card-stack">
          <Panel>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div>
                <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
                  {surveyQuery.data.schema.survey.title}
                </Typography.Title>
                {surveyQuery.data.schema.survey.description ? (
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {surveyQuery.data.schema.survey.description}
                  </Typography.Paragraph>
                ) : null}
              </div>
              <Space wrap size={[8, 8]}>
                <Tag>{t("surveys.sectionsCount", { count: surveyQuery.data.schema.sections.length })}</Tag>
                <Tag>{surveyQuery.data.schema.survey.language}</Tag>
              </Space>
              {surveyQuery.data.schema.survey.respondentInstructions ? (
                <div className="survey-preview-hero">
                  <Typography.Text strong>{t("surveyPreview.respondentInstructions")}</Typography.Text>
                  <Typography.Paragraph style={{ marginBottom: 0, marginTop: 10, whiteSpace: "pre-wrap" }}>
                    {surveyQuery.data.schema.survey.respondentInstructions}
                  </Typography.Paragraph>
                </div>
              ) : null}
            </Space>
          </Panel>

          {surveyQuery.data.schema.sections.map((section, index) => (
            <Panel key={section.id}>
              <div className="survey-preview-section-head">
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space wrap size={[8, 8]}>
                    <Tag color="blue">{t("surveyEditor.sectionTag", { index: index + 1 })}</Tag>
                    <Tag>{t("surveyEditor.sectionQuestionCount", { count: section.questions.length })}</Tag>
                  </Space>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {section.title}
                  </Typography.Title>
                  {section.description ? (
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {section.description}
                    </Typography.Paragraph>
                  ) : null}
                </Space>
              </div>

              <div className="survey-preview-stack">
                {section.questions.map((question) => (
                  <QuestionPreview key={question.id} question={question} t={t} />
                ))}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty description={t("common.noData")} />
        </Panel>
      )}
    </>
  );
}
