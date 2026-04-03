import { DownloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, Progress, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { MockRunDto, ReportComparisonDto, ReportDto } from "@surveysim/shared";
import { apiClient } from "@/api/client";
import { FieldLabel, HelpCallout } from "@/components/Help";
import { SimpleChart } from "@/components/charts/SimpleChart";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { authStore } from "@/stores/auth.store";

const attributeOptions = ["country", "gender", "ageRange", "incomeRange", "interests", "educationLevel", "occupation", "maritalStatus"];

type QuestionReport = ReportDto["questions"][number];
type ComparisonRun = ReportComparisonDto["runs"][number];

function getQuestionCardLayout(question: QuestionReport) {
  if (question.openText || question.matrixSingleChoice?.rows.length || question.rating) {
    return "wide";
  }
  return "compact";
}

function shouldShowQuestionChart(question: QuestionReport) {
  return Boolean(buildSingleQuestionChart(question));
}

function OpenTextAnswerList({
  answers,
  t,
}: {
  answers: string[];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (!answers.length) {
    return <Typography.Text type="secondary">{t("reports.noOpenAnswers")}</Typography.Text>;
  }

  return (
    <div className="open-answer-list">
      {answers.map((answer, index) => (
        <details key={`${index}-${answer.slice(0, 24)}`} className="open-answer-item">
          <summary className="open-answer-summary">
            <div className="open-answer-head">
              <Typography.Text strong className="open-answer-index">{`#${index + 1}`}</Typography.Text>
              <Typography.Text type="secondary" className="open-answer-preview">
                {answer}
              </Typography.Text>
            </div>
          </summary>
          <div className="open-answer-content">
            <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{answer}</Typography.Paragraph>
          </div>
        </details>
      ))}
    </div>
  );
}

async function download(path: string, filename: string) {
  const persisted = localStorage.getItem("surveysim-auth");
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

function buildSingleQuestionChart(question?: QuestionReport | null) {
  if (!question) return null;

  if (question.singleChoice?.length || question.multiChoice?.length) {
    const items = question.singleChoice ?? question.multiChoice ?? [];
    if (question.suggestedChart === "pie" && items.length <= 5) {
      return {
        tooltip: { trigger: "item" },
        legend: { bottom: 0, textStyle: { color: "#e5e7eb" } },
        series: [
          {
            type: "pie",
            radius: ["42%", "72%"],
            data: items.map((item) => ({ name: item.label, value: item.count })),
          },
        ],
      };
    }
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
    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#e5e7eb" } },
      xAxis: {
        type: "category",
        data: question.matrixSingleChoice.rows.map((row) => row.rowLabel),
        axisLabel: { color: "#e5e7eb", interval: 0, rotate: question.matrixSingleChoice.rows.length > 4 ? 12 : 0 },
      },
      yAxis: { type: "value", axisLabel: { color: "#e5e7eb" } },
      series: question.matrixSingleChoice.rows[0]?.columns.map((column, columnIndex) => ({
        type: "bar",
        name: column.label,
        stack: "matrix",
        data: question.matrixSingleChoice?.rows.map((row) => row.columns[columnIndex]?.percentage ?? 0),
      })) ?? [],
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
        <Typography.Text type="secondary">{t("reports.openAnswersCount", { count: question.openText.answers.length })}</Typography.Text>
        <OpenTextAnswerList answers={question.openText.answers} t={t} />
      </Space>
    );
  }

  if (question.matrixSingleChoice?.rows.length) {
    return (
      <div className="matrix-report-grid">
        {question.matrixSingleChoice.rows.map((row) => (
          <div key={row.rowId} className="matrix-report-card">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Space align="baseline" style={{ justifyContent: "space-between", width: "100%" }}>
                <Typography.Title level={5} style={{ margin: 0, fontSize: 16 }}>
                  {row.rowLabel}
                </Typography.Title>
                <Typography.Text type="secondary">{t("reports.answersCount", { count: row.responses })}</Typography.Text>
              </Space>
              <div className="matrix-report-options">
                {row.columns
                  .slice()
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((column) => (
                    <div key={`${row.rowId}_${column.columnId}`} className="matrix-report-option">
                      <Typography.Text className="matrix-report-option__label">{column.label}</Typography.Text>
                      <Typography.Text type="secondary" className="matrix-report-option__meta">
                        {`${column.count} · ${column.percentage}%`}
                      </Typography.Text>
                      <Progress percent={column.percentage} size="small" showInfo={false} strokeColor="#3b82f6" trailColor="rgba(148, 163, 184, 0.12)" />
                    </div>
                  ))}
              </div>
            </Space>
          </div>
        ))}
      </div>
    );
  }

  return <Typography.Text type="secondary">{t("reports.noMetrics")}</Typography.Text>;
}

function renderQuestionStatus(question: QuestionReport, totalResponses: number, t: (key: string, params?: Record<string, string | number>) => string) {
  return (
    <Space wrap>
      <Tag color="blue">{t("reports.answersCount", { count: question.responseCount })}</Tag>
      <Tag color="gold">{t("reports.responseRate", { rate: question.responseRate })}</Tag>
      <Tag>{t(`questionType.${question.type}`)}</Tag>
      {question.suggestedChart !== "none" ? <Tag>{t(`reports.chartType.${question.suggestedChart}`)}</Tag> : null}
      <Tag>{t("reports.totalResponsesForRun", { count: totalResponses })}</Tag>
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
          <Typography.Text type="secondary">{t("reports.answersCount", { count: item.question?.openText?.answers.length ?? 0 })}</Typography.Text>
        </div>
      ))}
    </Space>
  );
}

export function ReportsPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const currentUser = authStore((state) => state.user);
  const [runId, setRunId] = useState<string>();
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [filterAttribute, setFilterAttribute] = useState<string>();
  const [filterValue, setFilterValue] = useState("");
  const [selectedCompareQuestionId, setSelectedCompareQuestionId] = useState<string>();
  const [onlyOwnData, setOnlyOwnData] = useState(true);

  const runsQuery = useQuery({
    queryKey: ["mock-runs", "reports", currentUser?.role, onlyOwnData],
    queryFn: () => apiClient.get<MockRunDto[]>(`/mock-runs${currentUser?.role === "admin" && !onlyOwnData ? "?scope=all" : ""}`),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      apiClient.post<ReportDto>(`/reports/${runId}`, {
        attributes: filterAttribute && filterValue.trim() ? { [filterAttribute]: filterValue.split(",").map((item) => item.trim()).filter(Boolean) } : {},
      }),
    onError: (error: Error) => message.error(error.message),
  });

  const compareMutation = useMutation({
    mutationFn: () =>
      apiClient.post<ReportComparisonDto>("/reports/compare", {
        runIds: compareRunIds,
        attributes: filterAttribute && filterValue.trim() ? { [filterAttribute]: filterValue.split(",").map((item) => item.trim()).filter(Boolean) } : {},
      }),
    onError: (error: Error) => message.error(error.message),
  });

  const currentReport = reportMutation.data;
  const comparison = compareMutation.data;

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

  const compareVolumeChart = useMemo(() => buildCompareVolumeChart(comparison), [comparison]);
  const compareQuestionChart = useMemo(
    () => buildCompareQuestionChart(comparison?.runs ?? [], selectedCompareQuestionId, t),
    [comparison, selectedCompareQuestionId, t],
  );
  const diffRows = useMemo(() => buildDiffRows(comparison, t), [comparison, t]);
  const selectedCompareQuestion = useMemo(
    () => comparison?.runs[0]?.questions.find((question) => question.questionId === selectedCompareQuestionId) ?? null,
    [comparison, selectedCompareQuestionId],
  );

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        actions={
          currentUser?.role === "admin" ? (
            <Space>
              <span>{t("common.onlyMine")}</span>
              <Switch checked={onlyOwnData} onChange={setOnlyOwnData} />
            </Space>
          ) : undefined
        }
      />
      <HelpCallout
        title={t("reports.guideTitle")}
        description={t("reports.guideDescription")}
        items={[t("reports.guideStep1"), t("reports.guideStep2"), t("reports.guideStep3")]}
      />
      <div className="workspace-grid">
        <Panel>
          <Typography.Title level={4}>{t("reports.singleRun")}</Typography.Title>
          <Form layout="vertical">
            <Form.Item label={<FieldLabel label={t("reports.run")} hint={t("reports.runHint")} />}>
              <Select
                placeholder={t("reports.chooseRun")}
                options={(runsQuery.data ?? []).map((item) => ({ label: item.ownerEmail ? `${item.name} · ${item.ownerEmail}` : item.name, value: item.id }))}
                value={runId}
                onChange={setRunId}
              />
            </Form.Item>
            <Form.Item label={<FieldLabel label={t("reports.filterAttribute")} hint={t("reports.filterAttributeHint")} />}>
              <Select allowClear placeholder={t("reports.filterAttributePlaceholder")} options={attributeOptions.map((value) => ({ label: t(`attributes.${value}`), value }))} value={filterAttribute} onChange={setFilterAttribute} />
            </Form.Item>
            <Form.Item label={<FieldLabel label={t("reports.filterValue")} hint={t("reports.filterValueHint")} />}>
              <Input placeholder={t("reports.filterHint")} value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />
            </Form.Item>
            <Space wrap>
              <Button type="primary" disabled={!runId} loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
                {t("reports.build")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/csv`, `${runId}.csv`)}>
                {t("reports.exportCsv")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/open-text-csv`, `${runId}-open-text.csv`)}>
                {t("reports.exportOpenTextCsv")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/raw-csv`, `${runId}-raw-responses.csv`)}>
                {t("reports.exportRawResponseCsv")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/json`, `${runId}.json`)}>
                {t("reports.exportJson")}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!runId} onClick={() => runId && download(`/exports/${runId}/html`, `${runId}.html`)}>
                {t("reports.exportHtml")}
              </Button>
            </Space>
            <div className="subtle-help">{t("reports.exportHint")}</div>
          </Form>
        </Panel>

        <Panel>
          <Typography.Title level={4}>{t("reports.multiRun")}</Typography.Title>
          <Form layout="vertical">
            <Form.Item label={<FieldLabel label={t("reports.compareRuns")} hint={t("reports.compareRunsHint")} />}>
              <Select
                mode="multiple"
                placeholder={t("reports.compareHint")}
                options={(runsQuery.data ?? []).map((item) => ({ label: item.ownerEmail ? `${item.name} · ${item.ownerEmail}` : item.name, value: item.id }))}
                value={compareRunIds}
                onChange={setCompareRunIds}
              />
            </Form.Item>
            <div className="subtle-help">{t("reports.compareFilterSharedHint")}</div>
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
            </div>

            <Panel>
              <Typography.Title level={4}>{t("reports.questionGallery")}</Typography.Title>
              <div className="question-gallery-grid">
                {currentReport.questions.map((question) => {
                  const chart = buildSingleQuestionChart(question);
                  return (
                    <div
                      key={question.questionId}
                      className={`rule-card question-gallery-card question-gallery-card--${getQuestionCardLayout(question)}`}
                    >
                      <Space direction="vertical" size={12} style={{ width: "100%" }}>
                        <div>
                          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 6 }}>
                            {question.title}
                          </Typography.Title>
                          {renderQuestionStatus(question, currentReport.totalResponses, t)}
                        </div>
                        {renderQuestionMetrics(question, t)}
                        {shouldShowQuestionChart(question) ? (
                          <div style={{ marginTop: 8 }}>
                            <SimpleChart option={chart!} />
                          </div>
                        ) : null}
                      </Space>
                    </div>
                  );
                })}
              </div>
            </Panel>
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

            <div className="workspace-grid">
              <Panel>
                <Typography.Title level={4}>{t("reports.batchVolume")}</Typography.Title>
                {compareVolumeChart ? <SimpleChart option={compareVolumeChart} /> : <Empty description={t("reports.noVolume")} />}
              </Panel>
              <Panel>
                <Typography.Title level={4}>
                  {selectedCompareQuestion?.title ?? t("reports.selectedQuestionAcrossRuns")}
                </Typography.Title>
                {selectedCompareQuestion ? (
                  <Typography.Paragraph type="secondary">
                    {t(`questionType.${selectedCompareQuestion.type}`)}
                  </Typography.Paragraph>
                ) : null}
                <Space wrap style={{ marginBottom: 16 }}>
                  {comparison.runs.map((run) => (
                    <Tag key={run.runId} color="blue">
                      {`${run.runName}: ${run.totalResponses}`}
                    </Tag>
                  ))}
                </Space>
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
                  scroll={{ x: 860 }}
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
