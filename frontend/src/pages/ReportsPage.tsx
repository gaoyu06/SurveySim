import { DownloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import type { MockRunDto, ReportComparisonDto, ReportDto } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { SimpleChart } from "@/components/charts/SimpleChart";
import { PageHeader, Panel } from "@/components/PageHeader";

const attributeOptions = ["country", "gender", "ageRange", "incomeRange", "interests", "educationLevel", "occupation"];

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

function buildChoiceOption(report: ReportDto) {
  const question = report.questions.find((item) => item.singleChoice || item.multiChoice);
  if (!question) return null;
  const items = question.singleChoice ?? question.multiChoice ?? [];
  return {
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
    series: [
      {
        type: "pie",
        radius: ["38%", "70%"],
        data: items.map((item) => ({ name: item.label, value: item.count })),
      },
    ],
  };
}

function buildRatingOption(report: ReportDto) {
  const question = report.questions.find((item) => item.rating);
  if (!question?.rating) return null;
  return {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: question.rating.distribution.map((item) => item.label),
      axisLabel: { color: "#f4ede1" },
    },
    yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
    series: [
      {
        type: "line",
        smooth: true,
        data: question.rating.distribution.map((item) => item.count),
        lineStyle: { color: "#8da0ff", width: 3 },
        itemStyle: { color: "#d7b98f" },
      },
    ],
  };
}

function buildCompareResponsesOption(comparison?: ReportComparisonDto) {
  if (!comparison?.runs.length) return null;
  return {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: comparison.runs.map((run) => run.runName),
      axisLabel: { color: "#f4ede1", rotate: 12 },
    },
    yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
    series: [
      {
        type: "bar",
        data: comparison.runs.map((run) => run.totalResponses),
        itemStyle: { color: "#d7b98f" },
      },
    ],
  };
}

function buildCompareRatingOption(comparison?: ReportComparisonDto) {
  if (!comparison?.runs.length) return null;
  const ratingQuestionIds = comparison.runs[0]?.questions.filter((question) => question.rating).map((question) => question.questionId) ?? [];
  const firstQuestionId = ratingQuestionIds[0];
  if (!firstQuestionId) return null;

  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
    xAxis: {
      type: "category",
      data: comparison.runs.map((run) => run.runName),
      axisLabel: { color: "#f4ede1", rotate: 12 },
    },
    yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
    series: [
      {
        type: "line",
        smooth: true,
        name: "Mean rating",
        data: comparison.runs.map((run) => run.questions.find((question) => question.questionId === firstQuestionId)?.rating?.mean ?? 0),
        lineStyle: { color: "#8da0ff", width: 3 },
        itemStyle: { color: "#8da0ff" },
      },
    ],
  };
}

export function ReportsPage() {
  const { message } = App.useApp();
  const [runId, setRunId] = useState<string>();
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
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

  const compareMutation = useMutation({
    mutationFn: () =>
      apiClient.post<ReportComparisonDto>("/reports/compare", {
        runIds: compareRunIds,
        groupBy,
        attributes: filterAttribute && filterValue.trim() ? { [filterAttribute]: filterValue.split(",").map((item) => item.trim()).filter(Boolean) } : {},
      }),
    onError: (error: Error) => message.error(error.message),
  });

  const currentReport = reportMutation.data;
  const comparison = compareMutation.data;

  const choiceOption = useMemo(() => (currentReport ? buildChoiceOption(currentReport) : null), [currentReport]);
  const ratingOption = useMemo(() => (currentReport ? buildRatingOption(currentReport) : null), [currentReport]);
  const compareResponsesOption = useMemo(() => buildCompareResponsesOption(comparison), [comparison]);
  const compareRatingOption = useMemo(() => buildCompareRatingOption(comparison), [comparison]);

  return (
    <>
      <PageHeader
        title="Reports & exports"
        subtitle="Run a single-batch report with filters and cross analysis, or compare multiple mock batches side by side against the same survey."
      />
      <div className="workspace-grid">
        <Panel>
          <Typography.Title level={4}>Single run analysis</Typography.Title>
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
              <Select allowClear placeholder="Optional grouping" options={attributeOptions.map((value) => ({ label: value, value }))} value={groupBy} onChange={setGroupBy} />
            </Form.Item>
            <Form.Item label="Filter attribute">
              <Select allowClear placeholder="Optional filter field" options={attributeOptions.map((value) => ({ label: value, value }))} value={filterAttribute} onChange={setFilterAttribute} />
            </Form.Item>
            <Form.Item label="Filter value">
              <Input placeholder="Single value or comma separated values" value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />
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

        <Panel>
          <Typography.Title level={4}>Multi-run comparison</Typography.Title>
          <Form layout="vertical">
            <Form.Item label="Runs to compare">
              <Select
                mode="multiple"
                placeholder="Pick 2+ runs from the same survey"
                options={(runsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                value={compareRunIds}
                onChange={setCompareRunIds}
              />
            </Form.Item>
            <Typography.Paragraph style={{ color: "rgba(244,237,225,.72)" }}>
              Comparison keeps the same participant attribute filter and group-by settings as the single-run panel.
            </Typography.Paragraph>
            <Button type="primary" disabled={compareRunIds.length < 2} loading={compareMutation.isPending} onClick={() => compareMutation.mutate()}>
              Compare runs
            </Button>
          </Form>
        </Panel>
      </div>

      <div className="workspace-grid" style={{ marginTop: 18 }}>
        <div className="card-stack">
          {currentReport ? (
            <>
              <Panel>
                <Typography.Title level={4}>Run summary</Typography.Title>
                <Typography.Paragraph>Total responses: {currentReport.totalResponses}</Typography.Paragraph>
                {currentReport.groupedBy ? (
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Typography.Text>Grouped by</Typography.Text>
                    <Tag color="gold">{currentReport.groupedBy}</Tag>
                    {currentReport.groups.map((group) => (
                      <Tag key={group.key}>{`${group.label}: ${group.count}`}</Tag>
                    ))}
                  </Space>
                ) : null}
                {choiceOption ? <SimpleChart option={choiceOption} /> : <Empty description="No choice question chart available" />}
              </Panel>
              <Panel>
                <Typography.Title level={4}>Rating distribution</Typography.Title>
                {ratingOption ? <SimpleChart option={ratingOption} /> : <Empty description="No rating data available" />}
              </Panel>
              <Panel>
                <Typography.Title level={4}>Question breakdown</Typography.Title>
                <Table
                  rowKey="questionId"
                  pagination={false}
                  dataSource={currentReport.questions}
                  columns={[
                    { title: "Question", dataIndex: "title" },
                    { title: "Type", dataIndex: "type" },
                    {
                      title: "Metric",
                      render: (_, item) =>
                        item.rating
                          ? `Mean ${item.rating.mean} · Median ${item.rating.median}`
                          : item.singleChoice?.length
                            ? `${item.singleChoice[0].label}: ${item.singleChoice[0].percentage}%`
                            : item.multiChoice?.length
                              ? `${item.multiChoice[0].label}: ${item.multiChoice[0].percentage}%`
                              : `${item.openText?.answers.length ?? 0} open answers`,
                    },
                    {
                      title: "Grouped insight",
                      render: (_, item) => {
                        if (item.groupedRating?.length) {
                          return item.groupedRating.map((group) => `${group.groupLabel}: ${group.mean}`).join(" | ");
                        }
                        if (item.groupedOpenText?.length) {
                          return item.groupedOpenText.map((group) => `${group.groupLabel}: ${group.count}`).join(" | ");
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
            </>
          ) : (
            <Panel>
              <Empty description="Build a single run report to inspect distributions, grouped breakdowns, and exports" />
            </Panel>
          )}
        </div>

        <div className="card-stack">
          {comparison ? (
            <>
              <Panel>
                <Typography.Title level={4}>Compared runs</Typography.Title>
                <Space wrap style={{ marginBottom: 12 }}>
                  {comparison.runs.map((run) => (
                    <Tag key={run.runId} color="blue">
                      {run.runName}
                    </Tag>
                  ))}
                </Space>
                {compareResponsesOption ? <SimpleChart option={compareResponsesOption} /> : <Empty description="No response totals available" />}
              </Panel>
              <Panel>
                <Typography.Title level={4}>Rating mean comparison</Typography.Title>
                {compareRatingOption ? <SimpleChart option={compareRatingOption} /> : <Empty description="No shared rating question available across selected runs" />}
              </Panel>
              <Panel>
                <Typography.Title level={4}>Run comparison table</Typography.Title>
                <Table
                  rowKey="runId"
                  pagination={false}
                  dataSource={comparison.runs}
                  columns={[
                    { title: "Run", dataIndex: "runName" },
                    { title: "Responses", dataIndex: "totalResponses" },
                    {
                      title: "Top rating metric",
                      render: (_, item) => {
                        const rating = item.questions.find((question) => question.rating)?.rating;
                        return rating ? `Mean ${rating.mean}` : "-";
                      },
                    },
                    {
                      title: "Open text volume",
                      render: (_, item) =>
                        item.questions
                          .filter((question) => question.openText)
                          .reduce((sum, question) => sum + (question.openText?.answers.length ?? 0), 0),
                    },
                  ]}
                />
              </Panel>
            </>
          ) : (
            <Panel>
              <Empty description="Choose 2 or more runs to compare batch-level response volume and rating signals" />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
