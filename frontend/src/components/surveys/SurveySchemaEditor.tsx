import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import type { SurveySchemaDto } from "@formagents/shared";

const questionTypeOptions = [
  "single_choice",
  "multi_choice",
  "single_choice_other",
  "multi_choice_other",
  "rating",
  "open_text",
  "paragraph",
  "section_title",
  "respondent_instruction",
].map((value) => ({ label: value, value }));

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function SurveySchemaEditor({ value, onChange }: { value: SurveySchemaDto; onChange: (next: SurveySchemaDto) => void }) {
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
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Form layout="vertical">
        <Form.Item label="Survey title">
          <Input value={value.survey.title} onChange={(event) => onChange({ ...value, survey: { ...value.survey, title: event.target.value } })} />
        </Form.Item>
        <Form.Item label="Respondent instructions">
          <Input.TextArea rows={3} value={value.survey.respondentInstructions} onChange={(event) => onChange({ ...value, survey: { ...value.survey, respondentInstructions: event.target.value } })} />
        </Form.Item>
      </Form>

      {value.sections.map((section) => (
        <Card
          key={section.id}
          title={section.title}
          extra={<Button danger icon={<DeleteOutlined />} onClick={() => onChange({ ...value, sections: value.sections.filter((item) => item.id !== section.id) })} />}
        >
          <Form layout="vertical">
            <Form.Item label="Section title">
              <Input value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
            </Form.Item>
            <Form.Item label="Description">
              <Input.TextArea rows={2} value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} />
            </Form.Item>
          </Form>
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            {section.questions.map((question) => (
              <div key={question.id} className="rule-card">
                <Space align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>{question.title || question.id}</Typography.Title>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => updateSection(section.id, (current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }))}
                  />
                </Space>
                <Form layout="vertical">
                  <Form.Item label="Title">
                    <Input value={question.title} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, title: event.target.value }))} />
                  </Form.Item>
                  <Form.Item label="Description">
                    <Input.TextArea rows={2} value={question.description} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, description: event.target.value }))} />
                  </Form.Item>
                  <Form.Item label="Respondent instructions">
                    <Input.TextArea rows={2} value={question.respondentInstructions} onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, respondentInstructions: event.target.value }))} />
                  </Form.Item>
                  <Space wrap>
                    <Form.Item label="Type">
                      <Select value={question.type} style={{ width: 200 }} options={questionTypeOptions} onChange={(type) => updateQuestion(section.id, question.id, (current) => ({ ...current, type }))} />
                    </Form.Item>
                    <Form.Item label="Required">
                      <Switch checked={question.required} onChange={(required) => updateQuestion(section.id, question.id, (current) => ({ ...current, required }))} />
                    </Form.Item>
                    {question.type === "rating" ? (
                      <>
                        <Form.Item label="Min rating">
                          <InputNumber value={question.validation?.minRating ?? 1} onChange={(minRating) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minRating: minRating ?? 1, maxRating: current.validation?.maxRating ?? 5 } }))} />
                        </Form.Item>
                        <Form.Item label="Max rating">
                          <InputNumber value={question.validation?.maxRating ?? 5} onChange={(maxRating) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minRating: current.validation?.minRating ?? 1, maxRating: maxRating ?? 5 } }))} />
                        </Form.Item>
                      </>
                    ) : null}
                  </Space>
                  {["single_choice", "multi_choice", "single_choice_other", "multi_choice_other"].includes(question.type) ? (
                    <Space wrap>
                      <Form.Item label="Min selections">
                        <InputNumber
                          min={0}
                          value={question.validation?.minSelections}
                          onChange={(minSelections) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minSelections: minSelections ?? undefined } }))}
                        />
                      </Form.Item>
                      <Form.Item label="Max selections">
                        <InputNumber
                          min={0}
                          value={question.validation?.maxSelections}
                          onChange={(maxSelections) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, maxSelections: maxSelections ?? undefined } }))}
                        />
                      </Form.Item>
                    </Space>
                  ) : null}
                  {question.type === "open_text" ? (
                    <Space wrap>
                      <Form.Item label="Min length">
                        <InputNumber
                          min={0}
                          value={question.validation?.minLength}
                          onChange={(minLength) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, minLength: minLength ?? undefined } }))}
                        />
                      </Form.Item>
                      <Form.Item label="Max length">
                        <InputNumber
                          min={0}
                          value={question.validation?.maxLength}
                          onChange={(maxLength) => updateQuestion(section.id, question.id, (current) => ({ ...current, validation: { ...current.validation, maxLength: maxLength ?? undefined } }))}
                        />
                      </Form.Item>
                    </Space>
                  ) : null}
                  {["single_choice", "multi_choice", "single_choice_other", "multi_choice_other"].includes(question.type) ? (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {question.options.map((option) => (
                        <Space key={option.id} style={{ width: "100%" }} align="start">
                          <Input value={option.label} placeholder="Option label" onChange={(event) => updateQuestion(section.id, question.id, (current) => ({ ...current, options: current.options.map((candidate) => candidate.id === option.id ? { ...candidate, label: event.target.value, value: event.target.value } : candidate) }))} />
                          <Switch checked={Boolean(option.allowOther)} onChange={(allowOther) => updateQuestion(section.id, question.id, (current) => ({ ...current, options: current.options.map((candidate) => candidate.id === option.id ? { ...candidate, allowOther } : candidate) }))} />
                          <Button danger icon={<DeleteOutlined />} onClick={() => updateQuestion(section.id, question.id, (current) => ({ ...current, options: current.options.filter((candidate) => candidate.id !== option.id) }))} />
                        </Space>
                      ))}
                      <Typography.Text type="secondary">Each option can independently allow free-text other input.</Typography.Text>
                      <Button icon={<PlusOutlined />} onClick={() => updateQuestion(section.id, question.id, (current) => ({ ...current, options: [...current.options, { id: uid("option"), label: "New option", value: "New option", displayOrder: current.options.length }] }))}>
                        Add option
                      </Button>
                    </Space>
                  ) : null}
                </Form>
              </div>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => updateSection(section.id, (current) => ({
                ...current,
                questions: [
                  ...current.questions,
                  {
                    id: uid("question"),
                    title: "New question",
                    type: "single_choice",
                    required: false,
                    displayOrder: current.questions.length,
                    options: [
                      { id: uid("option"), label: "Option A", value: "Option A", displayOrder: 0 },
                      { id: uid("option"), label: "Option B", value: "Option B", displayOrder: 1 },
                    ],
                  },
                ],
              }))}
            >
              Add question
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
            sections: [...value.sections, { id: uid("section"), title: `Section ${value.sections.length + 1}`, displayOrder: value.sections.length, questions: [] }],
          })
        }
      >
        Add section
      </Button>
    </Space>
  );
}
