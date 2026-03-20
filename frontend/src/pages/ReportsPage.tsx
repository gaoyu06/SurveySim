import { DownloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import type { MockRunDto, ReportDto } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { SimpleChart } from "@/components/charts/SimpleChart";
import { PageHeader, Panel } from "@/components/PageHeader";

async function download(path: string, filename: string) {
  const persisted = localStorage.getItem("formagents-auth");
  const parsed = persisted ? JSON.parse(persisted) : null;
  const response = await fetch(`/api${path}`, {
    headers: parsed?.state?.token ? { Authorization: `Bearer ${parsed.state.token}` } : {},
  });
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

const attributeOptions = ["country", "gender", "ageRange", "incomeRange", "interests", "educationLevel"];

function buildChoiceCrossOption(report: ReportDto) {
  const question = report.questions.find((item) => item.groupedSingleChoice || item.groupedMultiChoice);
  if (!question) return null;

  const grouped = question.groupedSingleChoice ?? question.groupedMultiChoice;
  if (!grouped) return null;

  const optionEntries = Object.entries(grouped);
  const groupLabels = report.groups.map((group) => group.label);
  const optionLabelMap = new Map(
    [...(question.singleChoice ?? []), ...(question.multiChoice ?? [])].map((item, index) => [
      Object.keys(grouped)[index],
      item.label,
    ]),
  );

  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
    xAxis: {
      type: "category",
      data: groupLabels,
      axisLabel: { color: "#f4ede1" },
    },
    yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
    series: optionEntries.map(([optionId, items]) => ({
      type: "bar",
      name: optionLabelMap.get(optionId) ?? optionId,
      data: items.map((item) => item.percentage),
    })),
  };
}

function buildRatingCrossOption(report: ReportDto) {
  const question = report.questions.find((item) => item.groupedRating?.length);
  if (!question?.groupedRating?.length) return null;

  return {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: question.groupedRating.map((item) => item.groupLabel),
      axisLabel: { color: "#f4ede1" },
    },
    yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
    series: [
      {
        type: "line",
        smooth: true,
        data: question.groupedRating.map((item) => item.mean),
        lineStyle: { color: "#8da0ff", width: 3 },
        itemStyle: { color: "#d7b98f" },
      },
    ],
  };
}

export function ReportsPage() {
  const { message } = App.useApp();
  const [runId, setRunId] = useState<string>();
  const [groupBy, setGroupBy] = useState<string>();
  const [filterAttribute, setFilterAttribute] = useState<string>();
  const [filterValue, setFilterValue] = useState("");

  const runsQuery = useQuery({
    queryKey: ["mock-runs"],
    queryFn: () => apiClient.get<MockRunDto[]>("/mock-runs"),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiClient.post<ReportDto>(`/reports/${runId}`, {
        groupBy,
        attributes: filterAttribute && filterValue.trim() ? { [filterAttribute]: filterValue.split(",").map((item) => item.trim()).filter(Boolean) } : {},
      }),
    onError: (error: Error) => message.error(error.message),
  });

  const currentReport = reportMutation.data;
  const firstChoiceQuestion = currentReport?.questions.find((question) => question.singleChoice || question.multiChoice);

  const choiceOption = useMemo(() => {
    if (!firstChoiceQuestion) return null;
    const items = firstChoiceQuestion.singleChoice ?? firstChoiceQuestion.multiChoice ?? [];
    return {
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
      series: [
        {
          type: "pie",
          radius: ["36%", "68%"],
          data: items.map((item) => ({ name: item.label, value: item.count })),
        },
      ],
    };
  }, [firstChoiceQuestion]);

  const ratingQuestion = currentReport?.questions.find((question) => question.rating);
  const ratingOption = useMemo(() => {
    if (!ratingQuestion?.rating) return null;
    return {
      xAxis: {
        type: "category",
        data: ratingQuestion.rating.distribution.map((item) => item.label),
        axisLabel: { color: "#f4ede1" },
      },
      yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
      series: [
        {
          type: "line",
          smooth: true,
          data: ratingQuestion.rating.distribution.map((item) => item.count),
          lineStyle: { color: "#8da0ff", width: 3 },
          itemStyle: { color: "#d7b98f" },
        },
      ],
    };
  }, [ratingQuestion]);

  const choiceCrossOption = useMemo(() => (currentReport ? buildChoiceCrossOption(currentReport) : null), [currentReport]);
  const ratingCrossOption = useMemo(() => (currentReport ? buildRatingCrossOption(currentReport) : null), [currentReport]);

  return (
    <>
      <PageHeader
        title="Reports & exports"
        subtitle="Generate base statistics, filter by respondent attributes, and compare answer distributions across groups."
      />
      <div className="workspace-grid">
        <Panel>
          <Form layout="vertical">
            <Form.Item label="Mock run">
              <Select
                placeholder="Choose run"
                options={(runsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                value={runId}
                onChange={setRunId}
              />
            </Form.Item>
            <Form.Item label="Group by participant attribute">
              <Select
                allowClear
                placeholder="Optional grouping"
                options={attributeOptions.map((value) => ({ label: value, value }))}
                value={groupBy}
                onChange={setGroupBy}
              />
            </Form.Item>
            <Form.Item label="Filter attribute">
              <Select
                allowClear
                placeholder="Optional filter field"
                options={attributeOptions.map((value) => ({ label: value, value }))}
                value={filterAttribute}
                onChange={setFilterAttribute}
              />
            </Form.Item>
            <Form.Item label="Filter value">
              <Input
                placeholder="Single value or comma separated values"
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
              />
            </Form.Item>
            <Space wrap>
              <Button type="primary" disabled={!runId} loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
                Build report
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/csv`, `${runId}.csv`)}>
                Export CSV
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/json`, `${runId}.json`)}>
                Export JSON
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/html`, `${runId}.html`)}>
                Printable HTML
              </Button>
            </Space>
          </Form>
        </Panel>

        {currentReport ? (
          <div className="card-stack">
            <Panel>
              <Typography.Title level={4}>Summary</Typography.Title>
              <Typography.Paragraph>Total responses: {currentReport.totalResponses}</Typography.Paragraph>
              {currentReport.groupedBy ? (
                <Space wrap style={{ marginBottom: 12 }}>
                  <Typography.Text>Grouped by:</Typography.Text>
                  <Tag color="gold">{currentReport.groupedBy}</Tag>
                  {currentReport.groups.map((group) => (
                    <Tag key={group.key}>{`${group.label}: ${group.count}`}</Tag>
                  ))}
                </Space>
              ) : null}
              {choiceOption ? <SimpleChart option={choiceOption} /> : <Empty description="No choice chart available" />}
            </Panel>
            <Panel>
              <Typography.Title level={4}>Rating trend</Typography.Title>
              {ratingOption ? <SimpleChart option={ratingOption} /> : <Empty description="No rating data available" />}
            </Panel>
            <Panel>
              <Typography.Title level={4}>Cross analysis</Typography.Title>
              {currentReport.groupedBy ? (
                <div className="card-stack">
                  {choiceCrossOption ? <SimpleChart option={choiceCrossOption} /> : <Empty description="No grouped choice comparison available" />}
                  {ratingCrossOption ? <SimpleChart option={ratingCrossOption} /> : <Empty description="No grouped rating comparison available" />}
                </div>
              ) : (
                <Empty description="Choose a group-by field to view cross analysis" />
              )}
            </Panel>
            <Panel>
              <Typography.Title level={4}>Question table</Typography.Title>
              <Table
                rowKey="questionId"
                pagination={false}
                dataSource={currentReport.questions}
                columns={[
                  { title: "Question", dataIndex: "title" },
                  { title: "Type", dataIndex: "type" },
                  {
                    title: "Headline metric",
                    render: (_, item) =>
                      item.rating
                        ? `Mean ${item.rating.mean}`
                        : item.singleChoice?.[0]
                          ? `${item.singleChoice[0].label}: ${item.singleChoice[0].count}`
                          : item.multiChoice?.[0]
                            ? `${item.multiChoice[0].label}: ${item.multiChoice[0].count}`
                            : `${item.openText?.answers.length ?? 0} open answers`,
                  },
                  {
                    title: "Grouped insight",
                    render: (_, item) => {
                      if (item.groupedRating?.length) {
                        return item.groupedRating.map((group: { groupLabel: string; mean: number }) => `${group.groupLabel}: ${group.mean}`).join(" | ");
                      }
                      if (item.groupedOpenText?.length) {
                        return item.groupedOpenText.map((group: { groupLabel: string; count: number }) => `${group.groupLabel}: ${group.count}`).join(" | ");
                      }
                      if (item.groupedSingleChoice || item.groupedMultiChoice) {
                        return "Grouped distribution available";
                      }
                      return "-";
                    },
                  },
                ]}
              />
            </Panel>
          </div>
        ) : (
          <Panel>
            <Empty description="Run a report to see charts and export options" />
          </Panel>
        )}
      </div>
    </>
  );
}
