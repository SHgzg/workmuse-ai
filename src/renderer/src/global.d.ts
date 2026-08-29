import type { AuthState, CoreImportResult, CoreJob, CoreSettings, CoreStatus, UpdateState } from '../../preload'
import type { QuestionAnswer, SearchContext, SearchResult } from '../../core/content'
import type { Goal, Inspiration, KnowledgeItem, Meeting, Outcome, Project, WorkTask, WorkspaceSnapshot } from '../../core/domain'

declare global {
  interface Window {
    updater: {
      getVersion(): Promise<string>
      check(): Promise<{ ok: boolean; message?: string }>
      install(): Promise<{ ok: boolean; message?: string }>
      onState(callback: (state: UpdateState) => void): () => void
    }
    workmuseCore: {
      status(): Promise<CoreStatus>
      importResource(): Promise<CoreImportResult | null>
      jobs(): Promise<CoreJob[]>
      cancelJob(jobId: string): Promise<boolean>
      retryJob(jobId: string): Promise<unknown>
      search(query: string, limit?: number): Promise<SearchResult[]>
      openSource(resourceId: string): Promise<boolean>
      buildContext(query: string): Promise<SearchContext>
      answer(question: string): Promise<QuestionAnswer>
      getSettings(): Promise<CoreSettings | null>
      updateSettings(settings: Partial<CoreSettings> & { apiKey?: string; clearApiKey?: boolean }): Promise<CoreSettings>
      onEvent(callback: (event: unknown) => void): () => void
    }
    workmuseWorkspace: {
      list(): Promise<WorkspaceSnapshot>
      createGoal(input: unknown): Promise<Goal>
      createTask(input: unknown): Promise<WorkTask>
      createOutcome(input: unknown): Promise<Outcome>
      updateTaskStatus(id: string, status: WorkTask['status']): Promise<WorkTask>
      updateOutcomeStatus(id: string, status: Outcome['status']): Promise<Outcome>
      updateGoalProgress(id: string, input: { current?: number | null; status?: Goal['status'] }): Promise<Goal>
      updateMeetingStatus(id: string, status: Meeting['status']): Promise<Meeting>
      attachMeetingResource(id: string, resourceId: string): Promise<Meeting>
      createInspiration(input: unknown): Promise<Inspiration>
      convertInspirationToTask(id: string, input?: unknown): Promise<WorkTask>
      createProject(input: unknown): Promise<Project>
      createMeeting(input: unknown): Promise<Meeting>
      confirmKnowledge(input: unknown): Promise<KnowledgeItem>
    }
    workmuseAuth: {
      state(): Promise<AuthState>
      login(input: { email: string; password: string; displayName?: string }): Promise<AuthState>
      logout(): Promise<AuthState>
    }
  }
}

export {}
