import { useCallback, useEffect, useState } from 'react'
import type { Goal, Inspiration, KnowledgeItem, Meeting, Outcome, Project, WorkTask, WorkspaceSnapshot } from '../../../core/domain'

const EMPTY: WorkspaceSnapshot = { schemaVersion: 4, goals: [], tasks: [], outcomes: [], inspirations: [], projects: [], meetings: [], knowledge: [] }

export function useWorkspace(): {
  data: WorkspaceSnapshot
  loading: boolean
  saving: boolean
  error: string | null
  refresh: () => Promise<void>
  createGoal: (input: unknown) => Promise<Goal>
  createTask: (input: unknown) => Promise<WorkTask>
  createOutcome: (input: unknown) => Promise<Outcome>
  createInspiration: (input: unknown) => Promise<Inspiration>
  convertInspirationToTask: (id: string, input?: unknown) => Promise<WorkTask>
  createProject: (input: unknown) => Promise<Project>
  createMeeting: (input: unknown) => Promise<Meeting>
  confirmKnowledge: (input: unknown) => Promise<KnowledgeItem>
  updateTaskStatus: (id: string, status: WorkTask['status']) => Promise<void>
  updateOutcomeStatus: (id: string, status: Outcome['status']) => Promise<void>
  updateGoalProgress: (id: string, input: { current?: number | null; status?: Goal['status'] }) => Promise<void>
  updateMeetingStatus: (id: string, status: Meeting['status']) => Promise<void>
  attachMeetingResource: (id: string, resourceId: string) => Promise<void>
} {
  const [data, setData] = useState<WorkspaceSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      if (!window.workmuseWorkspace) throw new Error('浏览器预览模式无法访问本地业务数据。')
      setData(await window.workmuseWorkspace.list())
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const run = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setSaving(true)
    setError(null)
    try {
      const result = await operation()
      setData(await window.workmuseWorkspace.list())
      return result
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message)
      throw reason
    } finally {
      setSaving(false)
    }
  }

  return {
    data, loading, saving, error, refresh,
    createGoal: (input) => run(() => window.workmuseWorkspace.createGoal(input)),
    createTask: (input) => run(() => window.workmuseWorkspace.createTask(input)),
    createOutcome: (input) => run(() => window.workmuseWorkspace.createOutcome(input)),
    createInspiration: (input) => run(() => window.workmuseWorkspace.createInspiration(input)),
    convertInspirationToTask: (id, input) => run(() => window.workmuseWorkspace.convertInspirationToTask(id, input)),
    createProject: (input) => run(() => window.workmuseWorkspace.createProject(input)),
    createMeeting: (input) => run(() => window.workmuseWorkspace.createMeeting(input)),
    confirmKnowledge: (input) => run(() => window.workmuseWorkspace.confirmKnowledge(input)),
    updateTaskStatus: async (id, status) => { await run(() => window.workmuseWorkspace.updateTaskStatus(id, status)) },
    updateOutcomeStatus: async (id, status) => { await run(() => window.workmuseWorkspace.updateOutcomeStatus(id, status)) },
    updateGoalProgress: async (id, input) => { await run(() => window.workmuseWorkspace.updateGoalProgress(id, input)) },
    updateMeetingStatus: async (id, status) => { await run(() => window.workmuseWorkspace.updateMeetingStatus(id, status)) },
    attachMeetingResource: async (id, resourceId) => { await run(() => window.workmuseWorkspace.attachMeetingResource(id, resourceId)) }
  }
}
