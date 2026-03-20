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
                    <Input value={question.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => (item.id === question.id ? { ...item, title: event.target.value } : item)) }))} />
                  </Form.Item>
                  <Space wrap>
                    <Form.Item label="Type">
                      <Select value={question.type} style={{ width: 200 }} options={questionTypeOptions} onChange={(type) => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => (item.id === question.id ? { ...item, type } : item)) }))} />
                    </Form.Item>
                    <Form.Item label="Required">
                      <Switch checked={question.required} onChange={(required) => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => (item.id === question.id ? { ...item, required } : item)) }))} />
                    </Form.Item>
                    {question.type === "rating" ? (
                      <>
                        <Form.Item label="Min rating">
                          <InputNumber value={question.validation?.minRating ?? 1} onChange={(minRating) => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => (item.id === question.id ? { ...item, validation: { ...item.validation, minRating: minRating ?? 1, maxRating: item.validation?.maxRating ?? 5 } } : item)) }))} />
                        </Form.Item>
                        <Form.Item label="Max rating">
                          <InputNumber value={question.validation?.maxRating ?? 5} onChange={(maxRating) => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => (item.id === question.id ? { ...item, validation: { ...item.validation, minRating: item.validation?.minRating ?? 1, maxRating: maxRating ?? 5 } } : item)) }))} />
                        </Form.Item>
                      </>
                    ) : null}
                  </Space>
                  {["single_choice", "multi_choice", "single_choice_other", "multi_choice_other"].includes(question.type) ? (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {question.options.map((option) => (
                        <Space key={option.id} style={{ width: "100%" }} align="start">
                          <Input value={option.label} placeholder="Option label" onChange={(event) => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, options: item.options.map((candidate) => candidate.id === option.id ? { ...candidate, label: event.target.value, value: event.target.value } : candidate) } : item) }))} />
                          <Button danger icon={<DeleteOutlined />} onClick={() => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, options: item.options.filter((candidate) => candidate.id !== option.id) } : item) }))} />
                        </Space>
                      ))}
                      <Button icon={<PlusOutlined />} onClick={() => updateSection(section.id, (current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, options: [...item.options, { id: uid("option"), label: "New option", value: "New option", displayOrder: item.options.length }] } : item) }))}>
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
