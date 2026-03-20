import { DownloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, Select, Space, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { MockRunDto, ReportComparisonDto, ReportDto } from "@formagents/shared";
import { apiClient } from "@/api/client";
import { SimpleChart } from "@/components/charts/SimpleChart";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";

const attributeOptions = ["country", "gender", "ageRange", "incomeRange", "interests", "educationLevel", "occupation", "maritalStatus"];

type QuestionReport = ReportDto["questions"][number];
type ComparisonRun = ReportComparisonDto["runs"][number];

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

function toQuestionOptions(questions: QuestionReport[], t: (key: string, params?: Record<string, string | number>) => string) {
  return questions.map((question) => ({
    label: `${question.title} · ${t(`questionType.${question.type}`)}`,
    value: question.questionId,
  }));
}

function buildSingleQuestionChart(question?: QuestionReport | null) {
  if (!question) return null;

  if (question.singleChoice?.length || question.multiChoice?.length) {
    const items = question.singleChoice ?? question.multiChoice ?? [];
    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: items.map((item) => item.label),
        axisLabel: { color: "#f4ede1", interval: 0, rotate: items.length > 4 ? 16 : 0 },
      },
      yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
      series: [
        {
          type: "bar",
          data: items.map((item) => item.percentage),
          itemStyle: { color: "#d7b98f", borderRadius: [8, 8, 0, 0] },
        },
      ],
    };
  }

  if (question.rating) {
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

  if (question.matrixSingleChoice?.rows.length) {
    const firstRow = question.matrixSingleChoice.rows[0];
    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#e5e7eb" } },
      xAxis: {
        type: "category",
        data: firstRow.columns.map((item) => item.label),
        axisLabel: { color: "#e5e7eb", interval: 0, rotate: firstRow.columns.length > 4 ? 12 : 0 },
      },
      yAxis: { type: "value", axisLabel: { color: "#e5e7eb" } },
      series: [
        {
          type: "bar",
          data: firstRow.columns.map((item) => item.percentage),
          itemStyle: { color: "#3b82f6", borderRadius: [8, 8, 0, 0] },
        },
      ],
    };
  }

  return null;
}

function buildGroupedQuestionChart(question: QuestionReport, groups: ReportDto["groups"], t: (key: string, params?: Record<string, string | number>) => string) {
  if (question.groupedRating?.length) {
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

  const groupedChoices = question.groupedSingleChoice ?? question.groupedMultiChoice;
  if (groupedChoices) {
    const entries = Object.entries(groupedChoices);
    const labels = [...(question.singleChoice ?? []), ...(question.multiChoice ?? [])].map((item) => item.label);
    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
      xAxis: {
        type: "category",
        data: groups.map((group) => group.label),
        axisLabel: { color: "#f4ede1" },
      },
      yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
      series: entries.map(([_, values], index) => ({
        type: "bar",
        name: labels[index] ?? t("reports.optionFallback", { index: index + 1 }),
        data: values.map((item) => item.percentage),
      })),
    };
  }

  if (question.matrixSingleChoice?.rows.length && groups.length) {
    const firstRow = question.matrixSingleChoice.rows[0];
    const groupedColumns = firstRow.groupedColumns;
    if (!groupedColumns) return null;

    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#e5e7eb" } },
      xAxis: {
        type: "category",
        data: groups.map((group) => group.label),
        axisLabel: { color: "#e5e7eb" },
      },
      yAxis: { type: "value", axisLabel: { color: "#e5e7eb" } },
      series: Object.entries(groupedColumns).map(([columnId, values]) => ({
        type: "bar",
        name: firstRow.columns.find((column) => column.columnId === columnId)?.label ?? t("reports.optionFallback", { index: 1 }),
        data: values.map((item) => item.percentage),
      })),
    };
  }

  return null;
}

function buildCompareVolumeChart(comparison?: ReportComparisonDto) {
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
        itemStyle: { color: "#d7b98f", borderRadius: [8, 8, 0, 0] },
      },
    ],
  };
}

function buildCompareQuestionChart(runs: ComparisonRun[], questionId: string | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!questionId || !runs.length) return null;
  const baseline = runs[0]?.questions.find((question) => question.questionId === questionId);
  if (!baseline) return null;

  if (baseline.rating) {
    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: runs.map((run) => run.runName),
        axisLabel: { color: "#f4ede1", rotate: 12 },
      },
      yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
      series: [
        {
          type: "line",
          smooth: true,
          name: t("reports.metricMean"),
          data: runs.map((run) => run.questions.find((question) => question.questionId === questionId)?.rating?.mean ?? 0),
          lineStyle: { color: "#8da0ff", width: 3 },
          itemStyle: { color: "#d7b98f" },
        },
      ],
    };
  }

  const options = baseline.singleChoice ?? baseline.multiChoice;
  if (options?.length) {
    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#f4ede1" } },
      xAxis: {
        type: "category",
        data: runs.map((run) => run.runName),
        axisLabel: { color: "#f4ede1", rotate: 12 },
      },
      yAxis: { type: "value", axisLabel: { color: "#f4ede1" } },
      series: options.map((option) => ({
        type: "bar",
        name: option.label,
        data: runs.map((run) => {
          const runQuestion = run.questions.find((question) => question.questionId === questionId);
          const runOption = [...(runQuestion?.singleChoice ?? []), ...(runQuestion?.multiChoice ?? [])].find((item) => item.label === option.label);
          return runOption?.percentage ?? 0;
        }),
      })),
    };
  }

  if (baseline.matrixSingleChoice?.rows.length) {
    const firstRow = baseline.matrixSingleChoice.rows[0];
    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#e5e7eb" } },
      xAxis: {
        type: "category",
        data: runs.map((run) => run.runName),
        axisLabel: { color: "#e5e7eb", rotate: 12 },
      },
      yAxis: { type: "value", axisLabel: { color: "#e5e7eb" } },
      series: firstRow.columns.map((column) => ({
        type: "bar",
        name: column.label,
        data: runs.map((run) => {
          const runQuestion = run.questions.find((question) => question.questionId === questionId);
          const runRow = runQuestion?.matrixSingleChoice?.rows[0];
          const runColumn = runRow?.columns.find((item) => item.columnId === column.columnId);
          return runColumn?.percentage ?? 0;
        }),
      })),
    };
  }

  return null;
}

function buildDiffRows(comparison: ReportComparisonDto | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!comparison?.runs.length) return [];
  const baselineQuestions = comparison.runs[0].questions;

  return baselineQuestions.map((question) => {
    const runQuestions = comparison.runs.map((run) => ({
      runName: run.runName,
      question: run.questions.find((item) => item.questionId === question.questionId),
    }));

    if (question.rating) {
      const values = runQuestions.map((item) => ({
        runName: item.runName,
        value: item.question?.rating?.mean ?? 0,
      }));
      const sorted = [...values].sort((a, b) => b.value - a.value);
      return {
        key: question.questionId,
        questionId: question.questionId,
        title: question.title,
        type: question.type,
        largestDelta: Number((sorted[0].value - sorted[sorted.length - 1].value).toFixed(2)),
        divergentMetric: t("reports.metricMean"),
        leadingRun: sorted[0].runName,
      };
    }

    const options = question.singleChoice ?? question.multiChoice;
    if (options?.length) {
      let bestLabel = options[0]?.label ?? "-";
      let bestDelta = -1;
      let bestLeader = "-";

      for (const option of options) {
        const values = runQuestions.map((item) => {
          const questionOption = [...(item.question?.singleChoice ?? []), ...(item.question?.multiChoice ?? [])].find((candidate) => candidate.label === option.label);
          return {
            runName: item.runName,
            value: questionOption?.percentage ?? 0,
          };
        });
        const sorted = [...values].sort((a, b) => b.value - a.value);
        const delta = sorted[0].value - sorted[sorted.length - 1].value;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestLabel = option.label;
          bestLeader = sorted[0].runName;
        }
      }

      return {
        key: question.questionId,
        questionId: question.questionId,
        title: question.title,
        type: question.type,
        largestDelta: Number(bestDelta.toFixed(2)),
        divergentMetric: bestLabel,
        leadingRun: bestLeader,
      };
    }

    if (question.matrixSingleChoice?.rows.length) {
      let bestRowLabel = question.matrixSingleChoice.rows[0]?.rowLabel ?? "-";
      let bestColumnLabel = question.matrixSingleChoice.rows[0]?.columns[0]?.label ?? "-";
      let bestDelta = -1;
      let bestLeader = "-";

      for (const row of question.matrixSingleChoice.rows) {
        for (const column of row.columns) {
          const values = runQuestions.map((item) => {
            const runRow = item.question?.matrixSingleChoice?.rows.find((candidate) => candidate.rowId === row.rowId);
            const runColumn = runRow?.columns.find((candidate) => candidate.columnId === column.columnId);
            return {
              runName: item.runName,
              value: runColumn?.percentage ?? 0,
            };
          });
          const sorted = [...values].sort((a, b) => b.value - a.value);
          const delta = sorted[0].value - sorted[sorted.length - 1].value;
          if (delta > bestDelta) {
            bestDelta = delta;
            bestRowLabel = row.rowLabel;
            bestColumnLabel = column.label;
            bestLeader = sorted[0].runName;
          }
        }
      }

      return {
        key: question.questionId,
        questionId: question.questionId,
        title: question.title,
        type: question.type,
        largestDelta: Number(bestDelta.toFixed(2)),
        divergentMetric: `${bestRowLabel} · ${bestColumnLabel}`,
        leadingRun: bestLeader,
      };
    }

    const openCounts = runQuestions.map((item) => ({
      runName: item.runName,
      value: item.question?.openText?.answers.length ?? 0,
    }));
    const sorted = [...openCounts].sort((a, b) => b.value - a.value);
    return {
      key: question.questionId,
      questionId: question.questionId,
      title: question.title,
      type: question.type,
      largestDelta: sorted.length ? sorted[0].value - sorted[sorted.length - 1].value : 0,
      divergentMetric: t("reports.openAnswerVolume"),
      leadingRun: sorted[0]?.runName ?? "-",
    };
  });
}

function renderQuestionMetrics(question: QuestionReport | null | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!question) return <Empty description={t("reports.chooseQuestion")} />;

  if (question.rating) {
    return (
      <Space wrap>
        <Tag color="blue">{`${t("reports.metricMean")} ${question.rating.mean}`}</Tag>
        <Tag color="gold">{`${t("reports.metricMedian")} ${question.rating.median}`}</Tag>
        <Tag>{`StdDev ${question.rating.stdDev}`}</Tag>
      </Space>
    );
  }

  if (question.singleChoice?.length || question.multiChoice?.length) {
    const items = question.singleChoice ?? question.multiChoice ?? [];
    return (
      <Space wrap>
        {items.map((item) => (
          <Tag key={item.label}>{`${item.label}: ${item.percentage}%`}</Tag>
        ))}
      </Space>
    );
  }

  if (question.openText) {
    return (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {question.openText.summary ? <Typography.Paragraph>{question.openText.summary}</Typography.Paragraph> : null}
        <Space wrap>
          {question.openText.keywords.map((keyword) => (
            <Tag key={keyword}>{keyword}</Tag>
          ))}
        </Space>
      </Space>
    );
  }

  if (question.matrixSingleChoice?.rows.length) {
    return (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {question.matrixSingleChoice.rows.map((row) => (
          <div key={row.rowId} className="rule-card">
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              {row.rowLabel}
            </Typography.Title>
            <Space wrap>
              {row.columns.map((column) => (
                <Tag key={`${row.rowId}_${column.columnId}`}>{`${column.label}: ${column.percentage}%`}</Tag>
              ))}
            </Space>
          </div>
        ))}
      </Space>
    );
  }

  return <Typography.Text type="secondary">{t("reports.noMetrics")}</Typography.Text>;
}

function renderOpenSamples(question: QuestionReport | null | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  const answers = question?.openText?.answers ?? [];
  if (question?.matrixSingleChoice?.rows.length) {
    return (
      <Table
        size="small"
        pagination={false}
        rowKey="rowId"
        dataSource={question.matrixSingleChoice.rows}
        columns={[
          { title: t("surveyEditor.matrixRowLabel"), dataIndex: "rowLabel", key: "rowLabel" },
          {
            title: t("reports.matrixDistribution"),
            key: "distribution",
            render: (_, row) => row.columns.map((column: { columnId: string; label: string; percentage: number }) => `${column.label}: ${column.percentage}%`).join(" / "),
          },
          { title: t("common.responses"), dataIndex: "responses", key: "responses" },
        ]}
      />
    );
  }

  if (!answers.length) {
    return <Empty description={t("reports.noOpenAnswers")} />;
  }

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      {answers.slice(0, 8).map((answer, index) => (
        <div key={`${index}_${answer}`} className="rule-card">
          <Typography.Text>{answer}</Typography.Text>
        </div>
      ))}
    </Space>
  );
}

function renderCompareOpenText(runs: ComparisonRun[], questionId: string | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!questionId) return <Empty description={t("reports.compareQuestion")} />;
  const items = runs.map((run) => ({
    runName: run.runName,
    question: run.questions.find((question) => question.questionId === questionId),
  }));
  const hasOpenText = items.some((item) => item.question?.openText);
  if (!hasOpenText) return <Empty description={t("reports.noOpenCompare")} />;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {items.map((item) => (
        <div key={item.runName} className="rule-card">
          <Typography.Title level={5}>{item.runName}</Typography.Title>
          {item.question?.openText?.summary ? <Typography.Paragraph>{item.question.openText.summary}</Typography.Paragraph> : null}
          <Space wrap style={{ marginBottom: 10 }}>
            {(item.question?.openText?.keywords ?? []).map((keyword) => (
              <Tag key={`${item.runName}_${keyword}`}>{keyword}</Tag>
            ))}
          </Space>
          <Typography.Text type="secondary">{t("reports.answersCount", { count: item.question?.openText?.answers.length ?? 0 })}</Typography.Text>
        </div>
      ))}
    </Space>
  );
}

export function ReportsPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [runId, setRunId] = useState<string>();
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string>();
  const [filterAttribute, setFilterAttribute] = useState<string>();
  const [filterValue, setFilterValue] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>();
  const [selectedCompareQuestionId, setSelectedCompareQuestionId] = useState<string>();

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

  useEffect(() => {
    if (currentReport?.questions.length) {
      setSelectedQuestionId((current) =>
        current && currentReport.questions.some((question) => question.questionId === current)
          ? current
          : currentReport.questions[0].questionId,
      );
    } else {
      setSelectedQuestionId(undefined);
    }
  }, [currentReport]);

  useEffect(() => {
    const questions = comparison?.runs[0]?.questions ?? [];
    if (questions.length) {
      setSelectedCompareQuestionId((current) =>
        current && questions.some((question) => question.questionId === current) ? current : questions[0].questionId,
      );
    } else {
      setSelectedCompareQuestionId(undefined);
    }
  }, [comparison]);

  const selectedQuestion = useMemo(
    () => currentReport?.questions.find((question) => question.questionId === selectedQuestionId) ?? null,
    [currentReport, selectedQuestionId],
  );

  const singleQuestionChart = useMemo(() => buildSingleQuestionChart(selectedQuestion), [selectedQuestion]);
  const groupedQuestionChart = useMemo(
    () => (selectedQuestion && currentReport ? buildGroupedQuestionChart(selectedQuestion, currentReport.groups, t) : null),
    [selectedQuestion, currentReport, t],
  );

  const compareVolumeChart = useMemo(() => buildCompareVolumeChart(comparison), [comparison]);
  const compareQuestionChart = useMemo(
    () => buildCompareQuestionChart(comparison?.runs ?? [], selectedCompareQuestionId, t),
    [comparison, selectedCompareQuestionId, t],
  );
  const diffRows = useMemo(() => buildDiffRows(comparison, t), [comparison, t]);

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
      />
      <div className="workspace-grid">
        <Panel>
          <Typography.Title level={4}>{t("reports.singleRun")}</Typography.Title>
          <Form layout="vertical">
            <Form.Item label={t("reports.run")}>
              <Select
                placeholder={t("reports.chooseRun")}
                options={(runsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                value={runId}
                onChange={setRunId}
              />
            </Form.Item>
            <Form.Item label={t("reports.groupBy")}>
              <Select allowClear placeholder={t("reports.groupByPlaceholder")} options={attributeOptions.map((value) => ({ label: t(`attributes.${value}`), value }))} value={groupBy} onChange={setGroupBy} />
            </Form.Item>
            <Form.Item label={t("reports.filterAttribute")}>
              <Select allowClear placeholder={t("reports.filterAttributePlaceholder")} options={attributeOptions.map((value) => ({ label: t(`attributes.${value}`), value }))} value={filterAttribute} onChange={setFilterAttribute} />
            </Form.Item>
            <Form.Item label={t("reports.filterValue")}>
              <Input placeholder={t("reports.filterHint")} value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />
            </Form.Item>
            <Space wrap>
              <Button type="primary" disabled={!runId} loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
                {t("reports.build")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/csv`, `${runId}.csv`)}>
                {t("reports.exportCsv")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/json`, `${runId}.json`)}>
                {t("reports.exportJson")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/html`, `${runId}.html`)}>
                {t("reports.exportHtml")}
              </Button>
            </Space>
          </Form>
        </Panel>

        <Panel>
          <Typography.Title level={4}>{t("reports.multiRun")}</Typography.Title>
          <Form layout="vertical">
            <Form.Item label={t("reports.compareRuns")}>
              <Select
                mode="multiple"
                placeholder={t("reports.compareHint")}
                options={(runsQuery.data ?? []).map((item) => ({ label: item.name, value: item.id }))}
                value={compareRunIds}
                onChange={setCompareRunIds}
              />
            </Form.Item>
            <Typography.Paragraph style={{ color: "rgba(244,237,225,.72)" }}>{t("reports.compareDescription")}</Typography.Paragraph>
            <Button type="primary" disabled={compareRunIds.length < 2} loading={compareMutation.isPending} onClick={() => compareMutation.mutate()}>
              {t("reports.compareRuns")}
            </Button>
          </Form>
        </Panel>
      </div>

      <div className="card-stack" style={{ marginTop: 18 }}>
        {currentReport ? (
          <>
            <div className="metric-grid">
              <Panel style={{ padding: 18 }}>
                <div className="metric-label">{t("common.responses")}</div>
                <div className="metric-value">{currentReport.totalResponses}</div>
              </Panel>
              <Panel style={{ padding: 18 }}>
                <div className="metric-label">{t("common.questions")}</div>
                <div className="metric-value">{currentReport.questions.length}</div>
              </Panel>
              <Panel style={{ padding: 18 }}>
                <div className="metric-label">{t("reports.groupedBy")}</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{currentReport.groupedBy ? t(`attributes.${currentReport.groupedBy}`) : t("common.none")}</div>
              </Panel>
            </div>

            <Panel>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <Typography.Title level={4}>{t("reports.questionNavigator")}</Typography.Title>
                <Select
                  showSearch
                  options={toQuestionOptions(currentReport.questions, t)}
                  value={selectedQuestionId}
                  onChange={setSelectedQuestionId}
                />
                <Space wrap>
                  {currentReport.groupedBy ? <Tag color="gold">{t("reports.groupedByTag", { attribute: t(`attributes.${currentReport.groupedBy}`) })}</Tag> : null}
                  {currentReport.groups.map((group) => (
                    <Tag key={group.key}>{`${group.label}: ${group.count}`}</Tag>
                  ))}
                </Space>
              </Space>
            </Panel>

            <div className="workspace-grid">
              <Panel>
                <Typography.Title level={4}>{selectedQuestion?.title ?? t("reports.questionDetails")}</Typography.Title>
                <Typography.Paragraph type="secondary">{selectedQuestion ? t(`questionType.${selectedQuestion.type}`) : ""}</Typography.Paragraph>
                {renderQuestionMetrics(selectedQuestion, t)}
                <div style={{ marginTop: 16 }}>
                  {singleQuestionChart ? <SimpleChart option={singleQuestionChart} /> : <Empty description={t("reports.noChart")} />}
                </div>
              </Panel>
              <Panel>
                <Typography.Title level={4}>{t("reports.groupedView")}</Typography.Title>
                {currentReport.groupedBy ? (
                  groupedQuestionChart ? <SimpleChart option={groupedQuestionChart} /> : <Empty description={t("reports.noGroupedChart")} />
                ) : (
                  <Empty description={t("reports.chooseGroupBy")} />
                )}
              </Panel>
            </div>

            <div className="workspace-grid">
              <Panel>
                <Typography.Title level={4}>{t("reports.openSamples")}</Typography.Title>
                {renderOpenSamples(selectedQuestion, t)}
              </Panel>
              <Panel>
                <Typography.Title level={4}>{t("reports.breakdown")}</Typography.Title>
                <Table
                  rowKey="questionId"
                  pagination={false}
                  dataSource={currentReport.questions}
                  rowClassName={(record) => (record.questionId === selectedQuestionId ? "report-row-active" : "")}
                  onRow={(record) => ({
                    onClick: () => setSelectedQuestionId(record.questionId),
                    style: { cursor: "pointer" },
                  })}
                  columns={[
                    { title: t("common.question"), dataIndex: "title" },
                    { title: t("common.type"), dataIndex: "type", render: (value: string) => t(`questionType.${value}`) },
                    {
                      title: t("common.metric"),
                      render: (_, item) =>
                        item.rating
                          ? `${t("reports.metricMean")} ${item.rating.mean} · ${t("reports.metricMedian")} ${item.rating.median}`
                          : item.matrixSingleChoice?.rows.length
                            ? `${item.matrixSingleChoice.rows[0]?.rowLabel ?? "-"} · ${item.matrixSingleChoice.rows[0]?.columns[0]?.label ?? "-"}`
                          : item.singleChoice?.length
                            ? `${item.singleChoice[0].label}: ${item.singleChoice[0].percentage}%`
                            : item.multiChoice?.length
                              ? `${item.multiChoice[0].label}: ${item.multiChoice[0].percentage}%`
                              : t("reports.openAnswersCount", { count: item.openText?.answers.length ?? 0 }),
                    },
                  ]}
                />
              </Panel>
            </div>
          </>
        ) : (
          <Panel>
            <Empty description={t("reports.noSingleReport")} />
          </Panel>
        )}

        {comparison ? (
          <>
            <div className="metric-grid">
              <Panel style={{ padding: 18 }}>
                <div className="metric-label">{t("reports.comparedRuns")}</div>
                <div className="metric-value">{comparison.runs.length}</div>
              </Panel>
              <Panel style={{ padding: 18 }}>
                <div className="metric-label">{t("reports.sharedQuestions")}</div>
                <div className="metric-value">{comparison.runs[0]?.questions.length ?? 0}</div>
              </Panel>
              <Panel style={{ padding: 18 }}>
                <div className="metric-label">{t("reports.topDelta")}</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{diffRows[0] ? `${diffRows[0].largestDelta}` : "0"}</div>
              </Panel>
            </div>

            <Panel>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <Typography.Title level={4}>{t("reports.compareNavigator")}</Typography.Title>
                <Select
                  showSearch
                  options={toQuestionOptions(comparison.runs[0]?.questions ?? [], t)}
                  value={selectedCompareQuestionId}
                  onChange={setSelectedCompareQuestionId}
                />
                <Space wrap>
                  {comparison.runs.map((run) => (
                    <Tag key={run.runId} color="blue">
                      {`${run.runName}: ${run.totalResponses}`}
                    </Tag>
                  ))}
                </Space>
              </Space>
            </Panel>

            <div className="workspace-grid">
              <Panel>
                <Typography.Title level={4}>{t("reports.batchVolume")}</Typography.Title>
                {compareVolumeChart ? <SimpleChart option={compareVolumeChart} /> : <Empty description={t("reports.noVolume")} />}
              </Panel>
              <Panel>
                <Typography.Title level={4}>{t("reports.selectedQuestionAcrossRuns")}</Typography.Title>
                {compareQuestionChart ? <SimpleChart option={compareQuestionChart} /> : renderCompareOpenText(comparison.runs, selectedCompareQuestionId, t)}
              </Panel>
            </div>

            <div className="workspace-grid">
              <Panel>
                <Typography.Title level={4}>{t("reports.divergenceTable")}</Typography.Title>
                <Table
                  rowKey="key"
                  pagination={false}
                  dataSource={[...diffRows].sort((a, b) => b.largestDelta - a.largestDelta)}
                  rowClassName={(record) => (record.questionId === selectedCompareQuestionId ? "report-row-active" : "")}
                  onRow={(record) => ({
                    onClick: () => setSelectedCompareQuestionId(record.questionId),
                    style: { cursor: "pointer" },
                  })}
                  columns={[
                    { title: t("common.question"), dataIndex: "title" },
                    { title: t("common.type"), dataIndex: "type", render: (value: string) => t(`questionType.${value}`) },
                    { title: t("reports.largestDelta"), dataIndex: "largestDelta" },
                    { title: t("reports.divergentMetric"), dataIndex: "divergentMetric" },
                    { title: t("reports.leadingRun"), dataIndex: "leadingRun" },
                  ]}
                />
              </Panel>
              <Panel>
                <Typography.Title level={4}>{t("reports.openCompare")}</Typography.Title>
                {renderCompareOpenText(comparison.runs, selectedCompareQuestionId, t)}
              </Panel>
            </div>
          </>
        ) : (
          <Panel>
            <Empty description={t("reports.noComparison")} />
          </Panel>
        )}
      </div>
    </>
  );
}
