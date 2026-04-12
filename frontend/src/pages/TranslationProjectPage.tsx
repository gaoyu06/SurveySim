import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button, Card, Collapse, Descriptions, Divider, Empty, Form, Input, List, Modal,
  Popconfirm, Progress, Radio, Select, Skeleton, Space, Spin, Steps, Tag, Timeline, Typography,
  message as antMessage,
} from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { apiClient } from "@/api/client";
import { PageHeader, Panel } from "@/components/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import type { EvaluationAggregate, EvaluatorResult, EvaluationSuggestion } from "@surveysim/shared";

const { TextArea } = Input;

export function TranslationProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: ["translation-project", id],
    queryFn: () => apiClient.get<any>(`/translations/projects/${id}`),
    enabled: !!id,
  });

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [addVersionOpen, setAddVersionOpen] = useState(false);
  const [evaluateOpen, setEvaluateOpen] = useState(false);
  const [addVersionForm] = Form.useForm();
  const [evaluateForm] = Form.useForm();

  // Fetch participant templates for evaluation form
  const templates = useQuery({
    queryKey: ["participant-templates"],
    queryFn: () => apiClient.get<any[]>("/participant-templates"),
  });

  // Auto-select latest version
  useEffect(() => {
    if (project.data?.versions?.length && !selectedVersionId) {
      setSelectedVersionId(project.data.versions[0].id);
    }
  }, [project.data?.versions, selectedVersionId]);

  // Auto-open add version modal when navigated from project creation
  useEffect(() => {
    if (location.state?.autoOpenAddVersion) {
      setAddVersionOpen(true);
      // Clear the state to prevent re-opening on subsequent renders
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const versionDetail = useQuery({
    queryKey: ["translation-version", selectedVersionId],
    queryFn: () => apiClient.get<any>(`/translations/versions/${selectedVersionId}`),
    enabled: !!selectedVersionId,
  });

  const [activeEvaluationId, setActiveEvaluationId] = useState<string | null>(null);
  const evaluation = useQuery({
    queryKey: ["translation-evaluation", activeEvaluationId],
    queryFn: () => apiClient.get<any>(`/translations/evaluations/${activeEvaluationId}`),
    enabled: !!activeEvaluationId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 3000 : false;
    },
  });

  const createVersion = useMutation({
    mutationFn: (data: any) => apiClient.post(`/translations/projects/${id}/versions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["translation-project", id] });
      setAddVersionOpen(false);
      addVersionForm.resetFields();
      antMessage.success(t("translation.versionCreated"));
    },
  });

  const startEvaluation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/translations/versions/${selectedVersionId}/evaluate`, data),
    onSuccess: (result: any) => {
      setEvaluateOpen(false);
      evaluateForm.resetFields();
      setActiveEvaluationId(result.id);
      antMessage.success(t("translation.evaluationStarted"));
    },
  });

  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);

  const autoFix = useMutation({
    mutationFn: () =>
      apiClient.post(`/translations/evaluations/${activeEvaluationId}/auto-fix`, {
        selectedSuggestionIds: selectedSuggestions,
      }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["translation-project", id] });
      setSelectedVersionId(result.version.id);
      setActiveEvaluationId(null);
      setSelectedSuggestions([]);
      antMessage.success(t("translation.autoFixSuccess"));
    },
  });

  const deleteProject = useMutation({
    mutationFn: () => apiClient.delete(`/translations/projects/${id}`),
    onSuccess: () => {
      antMessage.success(t("translation.projectDeleted"));
      navigate("/translation");
    },
  });

  if (project.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  const currentVersion = versionDetail.data;
  const versions = project.data?.versions ?? [];
  const selectedVersion = versions.find((v: any) => v.id === selectedVersionId);

  return (
    <>
      <PageHeader
        title={project.data?.title}
        subtitle={project.data?.dramaTheme || project.data?.targetMarket}
        actions={
          <Space>
            <Button onClick={() => navigate("/translation")}>
              {t("common.back")}
            </Button>
            <Popconfirm
              title={t("translation.deleteProjectConfirm")}
              onConfirm={() => deleteProject.mutate()}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={deleteProject.isPending}
              >
                {t("common.delete")}
              </Button>
            </Popconfirm>
          </Space>
        }
      />

      <div className="translation-project-layout">
        {/* Left: Version Timeline */}
        <div className="translation-project-sidebar">
          <div className="translation-sidebar-header">
            <Typography.Text strong>{t("translation.versions")}</Typography.Text>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setAddVersionOpen(true)}>
              {t("translation.newVersion")}
            </Button>
          </div>
          <Timeline
            items={versions.map((v: any) => ({
              color: v.id === selectedVersionId ? "blue" : "gray",
              children: (
                <div
                  className={`translation-version-item ${v.id === selectedVersionId ? "active" : ""}`}
                  onClick={() => {
                    setSelectedVersionId(v.id);
                    setActiveEvaluationId(null);
                    setSelectedSuggestions([]);
                  }}
                >
                  <Typography.Text strong={v.id === selectedVersionId}>
                    {t("translation.versionLabel", { num: v.versionNumber })}
                  </Typography.Text>
                  <div>
                    {v.evaluations?.map((e: any) => (
                      <Tag key={e.id} color={statusColor(e.status)} style={{ fontSize: 11 }}>
                        {t(`translation.evalStatus.${e.status}`)}
                      </Tag>
                    ))}
                  </div>
                </div>
              ),
            }))}
          />
        </div>

        {/* Right: Main content */}
        <div className="translation-project-main">
          {!selectedVersionId ? (
            <Panel>
              <Empty description={t("translation.selectVersion")} />
            </Panel>
          ) : versionDetail.isLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : (
            <>
              {/* Version content */}
              <Panel style={{ marginBottom: 16 }}>
                <div className="translation-version-header">
                  <Typography.Title level={4}>
                    {t("translation.versionLabel", { num: currentVersion?.versionNumber })}
                  </Typography.Title>
                  <Space>
                    {!activeEvaluationId && currentVersion?.evaluations?.length ? (
                      <Select
                        style={{ width: 220 }}
                        placeholder={t("translation.selectEval")}
                        onChange={(val) => {
                          setActiveEvaluationId(val);
                          setSelectedSuggestions([]);
                        }}
                        options={currentVersion.evaluations.map((e: any) => ({
                          label: `${t("translation.evalStatus." + e.status)} · ${e.evaluatorCount} ${t("translation.evaluators")}`,
                          value: e.id,
                        }))}
                      />
                    ) : null}
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      onClick={() => setEvaluateOpen(true)}
                    >
                      {t("translation.startEvaluation")}
                    </Button>
                  </Space>
                </div>

                {currentVersion?.sourceText && (
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text type="secondary">{t("translation.sourceText")}</Typography.Text>
                    <div className="translation-text-box">{currentVersion.sourceText}</div>
                  </div>
                )}
                <div>
                  <Typography.Text type="secondary">{t("translation.translatedText")}</Typography.Text>
                  <div className="translation-text-box">{currentVersion?.translatedText}</div>
                </div>
                {currentVersion?.changeSummary && (
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="secondary">{t("translation.changeSummary")}: </Typography.Text>
                    <Typography.Text>{currentVersion.changeSummary}</Typography.Text>
                  </div>
                )}
              </Panel>

              {/* Evaluation Results */}
              {evaluation.data && (
                <Panel>
                  <div className="translation-eval-header">
                    <Typography.Title level={4}>
                      {t("translation.evaluationResults")}
                    </Typography.Title>
                    <Tag color={statusColor(evaluation.data.status)} style={{ fontSize: 13, padding: "2px 10px" }}>
                      {t(`translation.evalStatus.${evaluation.data.status}`)}
                    </Tag>
                  </div>

                  {evaluation.data.status === "running" ? (
                    <div style={{ textAlign: "center", padding: 32 }}>
                      <Spin size="large" />
                      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                        {t("translation.evaluationRunning")}
                      </Typography.Paragraph>
                    </div>
                  ) : evaluation.data.status === "completed" ? (
                    <>
                      {/* Aggregate Scores */}
                      {evaluation.data.aggregateScores && (
                        <div className="translation-scores-grid">
                          {renderScoreCards(evaluation.data.aggregateScores, t)}
                        </div>
                      )}

                      {/* Evaluator Results */}
                      {evaluation.data.results?.length > 0 && (
                        <Collapse
                          style={{ marginTop: 16 }}
                          items={evaluation.data.results.map((r: EvaluatorResult, i: number) => ({
                            key: i,
                            label: (
                              <Space>
                                <Typography.Text strong>{r.profile.name}</Typography.Text>
                                <Typography.Text type="secondary">
                                  {r.profile.age}岁 · {r.profile.gender} · {r.profile.culturalBackground}
                                </Typography.Text>
                              </Space>
                            ),
                            children: (
                              <div>
                                <Typography.Paragraph type="secondary">
                                  {t("translation.viewingHabits")}: {r.profile.viewingHabits}
                                </Typography.Paragraph>
                                <Typography.Paragraph type="secondary">
                                  {t("translation.evaluationFocus")}: {r.profile.evaluationFocus}
                                </Typography.Paragraph>
                                <Divider />
                                <Typography.Text strong>{t("translation.overallImpression")}</Typography.Text>
                                <Typography.Paragraph>{r.overallImpression}</Typography.Paragraph>
                                {r.dimensionScores?.map((ds, j) => (
                                  <div key={j} style={{ marginBottom: 4 }}>
                                    <Typography.Text type="secondary">
                                      {t(`translation.dimension.${ds.dimension}`)}:
                                    </Typography.Text>{" "}
                                    <Typography.Text strong>{ds.score}/10</Typography.Text>{" "}
                                    <Typography.Text type="secondary">{ds.reason}</Typography.Text>
                                  </div>
                                ))}
                              </div>
                            ),
                          }))}
                        />
                      )}

                      {/* Suggestions for auto-fix - grouped by location/originalText */}
                      {evaluation.data.allSuggestions?.length > 0 && (() => {
                        const grouped = groupSuggestionsByLocation(evaluation.data.allSuggestions);
                        return (
                          <div style={{ marginTop: 16 }}>
                            <Typography.Title level={5}>
                              {t("translation.suggestions")}
                            </Typography.Title>
                            {grouped.map((group, gi) => (
                              <div key={gi} style={{ marginBottom: 16, border: "1px solid rgba(148,163,184,0.12)", borderRadius: 12, padding: 12 }}>
                                <Typography.Text strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>
                                  {group.locationLabel}
                                </Typography.Text>
                                <Radio.Group
                                  value={getSelectedIdForGroup(group, selectedSuggestions)}
                                  onChange={(e) => handleGroupRadioChange(group, e.target.value, selectedSuggestions, setSelectedSuggestions)}
                                  style={{ width: "100%" }}
                                >
                                  <Space direction="vertical" style={{ width: "100%" }}>
                                    {group.items.map((s) => (
                                      <Radio key={s.id} value={s.id} style={{ alignItems: "flex-start" }}>
                                        <div>
                                          <div>
                                            <Typography.Text mark>{s.suggestedText}</Typography.Text>
                                          </div>
                                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{s.reason}</Typography.Text>
                                          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                              {t("translation.suggestionBy", {
                                                count: s.evaluatorCount,
                                                evaluators: s.evaluatorIndices.map((i) => t("translation.evaluatorLabel", { num: i + 1 })).join(", "),
                                              })}
                                            </Typography.Text>
                                            {s.evaluatorCount > 1 && (
                                              <Tag color="blue" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px", margin: 0 }}>
                                                {t("translation.suggestionAgreed", { count: s.evaluatorCount })}
                                              </Tag>
                                            )}
                                          </div>
                                        </div>
                                      </Radio>
                                    ))}
                                  </Space>
                                </Radio.Group>
                              </div>
                            ))}
                            {selectedSuggestions.length > 0 && (
                              <Button
                                type="primary"
                                style={{ marginTop: 12 }}
                                loading={autoFix.isPending}
                                onClick={() => autoFix.mutate()}
                              >
                                {t("translation.applySelected")} ({selectedSuggestions.length})
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  ) : evaluation.data.status === "failed" ? (
                    <Typography.Text type="danger">{t("translation.evaluationFailed")}</Typography.Text>
                  ) : null}
                </Panel>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Version Modal */}
      <Modal
        title={t("translation.addVersion")}
        open={addVersionOpen}
        onCancel={() => setAddVersionOpen(false)}
        onOk={() => addVersionForm.submit()}
        confirmLoading={createVersion.isPending}
        width={700}
      >
        <Form form={addVersionForm} layout="vertical" onFinish={(values) => createVersion.mutate(values)}>
          <Form.Item name="sourceText" label={t("translation.sourceText")}>
            <TextArea rows={6} placeholder={t("translation.sourceTextPlaceholder")} />
          </Form.Item>
          <Form.Item
            name="translatedText"
            label={t("translation.translatedText")}
            rules={[{ required: true, message: t("translation.translatedTextRequired") }]}
          >
            <TextArea rows={8} placeholder={t("translation.translatedTextPlaceholder")} />
          </Form.Item>
          <Form.Item name="parentVersionId" label={t("translation.parentVersion")}>
            <Select
              allowClear
              placeholder={t("translation.parentVersionPlaceholder")}
              options={versions.map((v: any) => ({
                label: t("translation.versionLabel", { num: v.versionNumber }),
                value: v.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Evaluate Modal */}
      <Modal
        title={t("translation.startEvaluation")}
        open={evaluateOpen}
        onCancel={() => setEvaluateOpen(false)}
        onOk={() => evaluateForm.submit()}
        confirmLoading={startEvaluation.isPending}
      >
        <Form
          form={evaluateForm}
          layout="vertical"
          initialValues={{ evaluatorCount: 5, concurrency: 3 }}
          onFinish={(values) => startEvaluation.mutate(values)}
        >
          <Form.Item name="evaluatorCount" label={t("translation.evaluatorCount")} rules={[{ required: true }]}>
            <Select
              options={[
                { label: "3", value: 3 },
                { label: "5", value: 5 },
                { label: "8", value: 8 },
                { label: "10", value: 10 },
              ]}
            />
          </Form.Item>
          <Form.Item name="concurrency" label={t("translation.concurrency")} rules={[{ required: true }]}>
            <Select
              options={[
                { label: "1", value: 1 },
                { label: "2", value: 2 },
                { label: "3", value: 3 },
                { label: "5", value: 5 },
                { label: "8", value: 8 },
              ]}
            />
          </Form.Item>
          <Form.Item name="participantTemplateId" label={t("translation.evaluatorTemplate")}>
            <Select
              allowClear
              placeholder={t("translation.evaluatorTemplatePlaceholder")}
              loading={templates.isLoading}
              options={(templates.data ?? []).map((tpl: any) => ({
                label: tpl.name,
                value: tpl.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function statusColor(status: string) {
  switch (status) {
    case "completed": return "green";
    case "running": return "blue";
    case "failed": return "red";
    default: return "default";
  }
}

function renderScoreCards(scores: EvaluationAggregate, t: (key: string) => string) {
  const dimensions = [
    "cultural_adaptation",
    "emotional_fidelity",
    "naturalness",
    "timing_rhythm",
    "character_voice",
    "localization_quality",
    "overall",
  ] as const;

  return (
    <div className="translation-scores-grid">
      {dimensions.map((dim) => {
        const value = scores[dim] ?? 0;
        return (
          <div key={dim} className="translation-score-card">
            <div className="translation-score-card__label">
              {t(`translation.dimension.${dim}`)}
            </div>
            <Progress
              type="dashboard"
              percent={value * 10}
              size={80}
              format={() => `${value}`}
              strokeColor={value >= 7 ? "#52c41a" : value >= 5 ? "#faad14" : "#ff4d4f"}
            />
          </div>
        );
      })}
    </div>
  );
}

// Deduplicated suggestion: merges identical suggestions from multiple evaluators
interface MergedSuggestion {
  id: string;
  originalIds: string[];          // all original suggestion ids (for auto-fix)
  evaluatorIndices: number[];     // which evaluators gave this suggestion
  evaluatorCount: number;         // how many evaluators agreed
  location?: string;
  originalText?: string;
  suggestedText: string;
  reason: string;                 // longest/most detailed reason
}

// Group of deduplicated suggestions targeting the same location
interface SuggestionGroup {
  locationKey: string;
  locationLabel: string;
  items: MergedSuggestion[];
}

// Deduplicate: merge suggestions with same originalText + suggestedText
function deduplicateSuggestions(suggestions: EvaluationSuggestion[]): MergedSuggestion[] {
  const map = new Map<string, MergedSuggestion>();

  for (const s of suggestions) {
    // Key by location + suggestedText (normalize whitespace)
    const key = [
      (s.originalText || s.location || "").trim().toLowerCase(),
      s.suggestedText.trim().toLowerCase(),
    ].join("|||");

    if (map.has(key)) {
      const existing = map.get(key)!;
      if (!existing.evaluatorIndices.includes(s.evaluatorIndex)) {
        existing.evaluatorIndices.push(s.evaluatorIndex);
        existing.evaluatorCount++;
      }
      existing.originalIds.push(s.id);
      // Keep the longest reason
      if (s.reason.length > existing.reason.length) {
        existing.reason = s.reason;
      }
    } else {
      map.set(key, {
        id: s.id,
        originalIds: [s.id],
        evaluatorIndices: [s.evaluatorIndex],
        evaluatorCount: 1,
        location: s.location,
        originalText: s.originalText,
        suggestedText: s.suggestedText,
        reason: s.reason,
      });
    }
  }

  return Array.from(map.values());
}

function groupSuggestionsByLocation(suggestions: EvaluationSuggestion[]): SuggestionGroup[] {
  const merged = deduplicateSuggestions(suggestions);
  const map = new Map<string, SuggestionGroup>();

  for (const s of merged) {
    const key = s.originalText || s.location || "__general__";
    if (!map.has(key)) {
      map.set(key, {
        locationKey: key,
        locationLabel: s.originalText || s.location || "整体建议",
        items: [],
      });
    }
    map.get(key)!.items.push(s);
  }

  // Sort each group: suggestions with more evaluators first
  for (const group of map.values()) {
    group.items.sort((a, b) => b.evaluatorCount - a.evaluatorCount);
  }

  return Array.from(map.values());
}

function getSelectedIdForGroup(group: SuggestionGroup, selectedIds: string[]): string | undefined {
  return group.items.find((s) => selectedSuggestionsMatch(s, selectedIds))?.id;
}

function selectedSuggestionsMatch(s: MergedSuggestion, selectedIds: string[]): boolean {
  return selectedIds.includes(s.id) || s.originalIds.some((id) => selectedIds.includes(id));
}

function handleGroupRadioChange(
  group: SuggestionGroup,
  newValue: string,
  currentSelected: string[],
  setSelected: (ids: string[]) => void,
) {
  // Remove any existing selection from this group, add the new one
  const allIdsInGroup = new Set(group.items.flatMap((s) => [s.id, ...s.originalIds]));
  const filtered = currentSelected.filter((id) => !allIdsInGroup.has(id));
  setSelected([...filtered, newValue]);
}
