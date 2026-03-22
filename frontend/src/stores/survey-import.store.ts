import {
  applySurveyImportRecordToDraft,
  type SurveyDraft,
  type SurveyImportRecordEvent,
  type SurveyImportStreamEvent,
  type SurveySchemaDto,
} from "@surveysim/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "@/api/client";

export type StreamStage = "queued" | "extracting" | "validating" | "repairing" | "normalizing" | "completed" | "interrupted";

export type ProcessedRecord = {
  index: number;
  status: "validated" | "repaired" | "skipped";
  recordType?: "survey_meta" | "section" | "question";
  questionType?: string;
  title?: string;
  summary?: string;
  rawLine: string;
  repairedLine?: string;
  message?: string;
};

export type StreamLogEntry = {
  key: string;
  stage?: StreamStage;
  text: string;
  color?: string;
};

const initialDraft: SurveyDraft = {
  rawText: "",
  schema: {
    survey: {
      title: "Untitled Survey",
      respondentInstructions: "",
      language: "auto",
    },
    sections: [
      {
        id: "section_root",
        title: "Section 1",
        displayOrder: 0,
        questions: [],
      },
    ],
  },
  extractionNotes: [],
};

type SurveyImportState = {
  importText: string;
  selectedLlmConfigId?: string;
  draft: SurveyDraft;
  drawerOpen: boolean;
  editingSurveyId: string | null;
  streamLogs: StreamLogEntry[];
  streamStage?: StreamStage;
  isStreaming: boolean;
  streamPreview: string;
  processedRecords: ProcessedRecord[];
  hasUnsavedDraft: boolean;
  showRawJsonl: boolean;
  setImportText: (value: string) => void;
  setSelectedLlmConfigId: (value?: string) => void;
  setDraft: (value: SurveyDraft | ((current: SurveyDraft) => SurveyDraft)) => void;
  setDraftSchema: (schema: SurveySchemaDto) => void;
  setDrawerOpen: (value: boolean) => void;
  setEditingSurveyId: (value: string | null) => void;
  setShowRawJsonl: (value: boolean | ((current: boolean) => boolean)) => void;
  setHasUnsavedDraft: (value: boolean | ((current: boolean) => boolean)) => void;
  setStreaming: (value: boolean) => void;
  resetStream: () => void;
  resetDraft: () => void;
  dismissDraft: () => void;
  markDraftSaved: (surveyId?: string | null) => void;
  appendLog: (entry: Omit<StreamLogEntry, "key">) => void;
  handleStreamEvent: (event: SurveyImportStreamEvent, options?: { onDraftReady?: () => void }) => void;
  applyStreamEvent: (event: SurveyImportStreamEvent) => void;
  startStreamImport: (body: BodyInit) => Promise<void>;
  retryRecord: (record: ProcessedRecord) => Promise<void>;
};

export const surveyImportStore = create<SurveyImportState>()(
  persist(
    (set, get) => ({
      importText: "",
      selectedLlmConfigId: undefined,
      draft: initialDraft,
      drawerOpen: false,
      editingSurveyId: null,
      streamLogs: [],
      streamStage: undefined,
      isStreaming: false,
      streamPreview: "",
      processedRecords: [],
      hasUnsavedDraft: false,
      showRawJsonl: false,
      setImportText: (value) => set({ importText: value }),
      setSelectedLlmConfigId: (value) => set({ selectedLlmConfigId: value }),
      setDraft: (value) =>
        set((state) => ({
          draft: typeof value === "function" ? value(state.draft) : value,
        })),
      setDraftSchema: (schema) =>
        set((state) => ({
          draft: {
            ...state.draft,
            schema,
          },
        })),
      setDrawerOpen: (value) => set({ drawerOpen: value }),
      setEditingSurveyId: (value) => set({ editingSurveyId: value }),
      setShowRawJsonl: (value) =>
        set((state) => ({
          showRawJsonl: typeof value === "function" ? value(state.showRawJsonl) : value,
        })),
      setHasUnsavedDraft: (value) =>
        set((state) => ({
          hasUnsavedDraft: typeof value === "function" ? value(state.hasUnsavedDraft) : value,
        })),
      setStreaming: (value) => set({ isStreaming: value }),
      resetStream: () =>
        set({
          streamLogs: [],
          streamStage: undefined,
          streamPreview: "",
          processedRecords: [],
          showRawJsonl: false,
        }),
      resetDraft: () =>
        set({
          draft: initialDraft,
          drawerOpen: false,
          editingSurveyId: null,
          hasUnsavedDraft: false,
        }),
      dismissDraft: () =>
        set({
          draft: initialDraft,
          drawerOpen: false,
          editingSurveyId: null,
          hasUnsavedDraft: false,
        }),
      markDraftSaved: (surveyId) =>
        set((state) => ({
          drawerOpen: false,
          hasUnsavedDraft: false,
          editingSurveyId: surveyId ?? state.editingSurveyId,
        })),
      appendLog: (entry) =>
        set((state) => ({
          streamLogs: [...state.streamLogs, { key: `${Date.now()}_${state.streamLogs.length}`, ...entry }].slice(-10),
        })),
      handleStreamEvent: (event, options) => {
        get().applyStreamEvent(event);
        if (event.type === "draft") {
          options?.onDraftReady?.();
        }
      },
      applyStreamEvent: (event) => {
        if (event.type === "status") {
          set({ streamStage: event.stage });
          get().appendLog({
            stage: event.stage,
            text: event.message,
            color: event.stage === "completed" ? "green" : event.stage === "interrupted" ? "red" : "blue",
          });
          return;
        }

        if (event.type === "delta") {
          set((state) => ({
            streamPreview: `${state.streamPreview}${event.chunk}`.slice(-8000),
          }));
          return;
        }

        if (event.type === "record") {
          set((state) => ({
            processedRecords: [
              ...state.processedRecords.filter((item) => item.index !== event.index),
              {
                index: event.index,
                status: event.status,
                recordType: event.recordType,
                questionType: event.questionType,
                title: event.title,
                summary: event.summary,
                rawLine: event.rawLine,
                repairedLine: event.repairedLine,
                message: event.message,
              },
            ].sort((a, b) => a.index - b.index),
            draft: event.record ? applySurveyImportRecordToDraft(state.draft, event.record) : state.draft,
            hasUnsavedDraft: event.record ? true : state.hasUnsavedDraft,
          }));
          get().appendLog({
            text: `record:${event.index}:${event.status}:${event.title || event.summary || "-"}`,
            color: event.status === "repaired" ? "gold" : event.status === "skipped" ? "red" : "green",
          });
          return;
        }

        if (event.type === "draft") {
          set({
            draft: event.draft,
            drawerOpen: true,
            editingSurveyId: null,
            hasUnsavedDraft: true,
          });
          get().appendLog({
            text: `draft:${event.draft.schema.sections.length}`,
            color: "gold",
          });
          return;
        }

        get().appendLog({ text: event.message, color: "red" });
        throw new Error(event.message);
      },
      startStreamImport: async (body) => {
        if (get().isStreaming) {
          return;
        }

        get().resetStream();
        set({ isStreaming: true });

        try {
          await apiClient.streamSurveyImport("/surveys/import/stream", body, (event) => get().applyStreamEvent(event));
        } catch (error) {
          const resolved = error instanceof Error ? error.message : String(error);
          if (!get().streamLogs.some((item) => item.text === resolved)) {
            get().appendLog({ stage: "interrupted", text: resolved, color: "red" });
          }
          throw error instanceof Error ? error : new Error(resolved);
        } finally {
          set({ isStreaming: false });
        }
      },
      retryRecord: async (record) => {
        const state = get();
        const event = await apiClient.post<SurveyImportRecordEvent>("/surveys/import/retry-record", {
          rawText: state.draft.rawText || state.importText,
          invalidLine: record.rawLine,
          errorMessage: record.message,
          llmConfigId: state.selectedLlmConfigId,
          index: record.index,
        });

        get().applyStreamEvent(event);
      },
    }),
    {
      name: "surveysim-survey-import",
      partialize: (state) => ({
        importText: state.importText,
        selectedLlmConfigId: state.selectedLlmConfigId,
        draft: state.draft,
        drawerOpen: state.drawerOpen,
        editingSurveyId: state.editingSurveyId,
        streamLogs: state.streamLogs,
        streamStage: state.streamStage,
        streamPreview: state.streamPreview,
        processedRecords: state.processedRecords,
        hasUnsavedDraft: state.hasUnsavedDraft,
        showRawJsonl: state.showRawJsonl,
      }),
    },
  ),
);

export function createInitialSurveyDraft() {
  return initialDraft;
}
