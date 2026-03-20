import { DownloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Form, Select, Space, Table, Typography } from "antd";
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

export function ReportsPage() {
  const { message } = App.useApp();
  const [runId, setRunId] = useState<string>();
  const [groupBy, setGroupBy] = useState<string>();
  const runsQuery = useQuery({
    queryKey: ["mock-runs"],
    queryFn: () => apiClient.get<MockRunDto[]>("/mock-runs"),
  });

  const reportMutation = useMutation({
    mutationFn: () => apiClient.post<ReportDto>(`/reports/${runId}`, { groupBy, attributes: {} }),
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

  return (
    <>
      <PageHeader
        title="Reports & exports"
        subtitle="Generate base statistics, run grouped cuts by participant attributes, and export raw answers or printable summaries."
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
                options={["country", "gender", "ageRange", "incomeRange", "interests", "educationLevel"].map((value) => ({
                  label: value,
                  value,
                }))}
                value={groupBy}
                onChange={setGroupBy}
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
              {choiceOption ? <SimpleChart option={choiceOption} /> : <Empty description="No choice chart available" />}
            </Panel>
            <Panel>
              <Typography.Title level={4}>Rating trend</Typography.Title>
              {ratingOption ? <SimpleChart option={ratingOption} /> : <Empty description="No rating data available" />}
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
