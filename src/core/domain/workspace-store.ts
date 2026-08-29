import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type SourceReference = {
  kind: 'manual' | 'resource' | 'meeting' | 'inspiration' | 'ai-suggestion'
  id?: string
  label: string
  evidenceBlockId?: string
}

type EntityBase = {
  id: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
  sources: SourceReference[]
}

export type Goal = EntityBase & {
  type: 'goal'
  status: 'active' | 'achieved' | 'paused' | 'cancelled'
  owner: string
  metric: string
  baseline: number | null
  target: number | null
  current: number | null
  dueDate: string | null
}

export type WorkTask = EntityBase & {
  type: 'task'
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  owner: string
  dueDate: string | null
  goalId: string | null
  projectId: string | null
  expectedOutcome: string
  acceptanceCriteria: string
}

export type Outcome = EntityBase & {
  type: 'outcome'
  kind: 'deliverable' | 'metric' | 'validation' | 'business'
  status: 'draft' | 'pending_review' | 'accepted' | 'rejected'
  goalId: string | null
  taskId: string | null
  value: number | null
  unit: string
  evidence: string
}

export type Inspiration = EntityBase & {
  type: 'inspiration'
  status: 'inbox' | 'converted' | 'archived'
  convertedTaskId: string | null
}

export type Project = EntityBase & {
  type: 'project'
  status: 'planned' | 'active' | 'paused' | 'completed' | 'cancelled'
  owner: string
  dueDate: string | null
}

export type Meeting = EntityBase & {
  type: 'meeting'
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  startsAt: string
  endsAt: string | null
  participantCount: number
  projectId: string | null
  goalIds: string[]
  resourceIds: string[]
}

export type KnowledgeItem = EntityBase & {
  type: 'knowledge'
  kind: 'claim' | 'decision' | 'insight'
  status: 'confirmed' | 'archived'
  confirmedAt: string
}

export type WorkspaceSnapshot = {
  schemaVersion: 4
  goals: Goal[]
  tasks: WorkTask[]
  outcomes: Outcome[]
  inspirations: Inspiration[]
  projects: Project[]
  meetings: Meeting[]
  knowledge: KnowledgeItem[]
}

const EMPTY_SNAPSHOT: WorkspaceSnapshot = { schemaVersion: 4, goals: [], tasks: [], outcomes: [], inspirations: [], projects: [], meetings: [], knowledge: [] }

export class WorkspaceStore {
  private snapshot: WorkspaceSnapshot = structuredClone(EMPTY_SNAPSHOT)
  private writes: Promise<void> = Promise.resolve()
  private readonly path: string

  constructor(directory: string) {
    this.path = join(directory, 'workspace.v1.json')
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown
      this.snapshot = parseSnapshot(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await this.persist()
    }
  }

  list(): WorkspaceSnapshot {
    return structuredClone(this.snapshot)
  }

  createGoal(input: unknown): Promise<Goal> {
    const value = objectInput(input)
    const now = new Date().toISOString()
    const goal: Goal = {
      id: randomUUID(), type: 'goal', title: requiredText(value.title, 'title'), description: optionalText(value.description),
      status: enumValue(value.status, ['active', 'achieved', 'paused', 'cancelled'], 'active'), owner: optionalText(value.owner),
      metric: optionalText(value.metric), baseline: optionalNumber(value.baseline), target: optionalNumber(value.target),
      current: optionalNumber(value.current), dueDate: optionalDate(value.dueDate), sources: sourceReferences(value.sources),
      createdAt: now, updatedAt: now
    }
    return this.mutate((snapshot) => { snapshot.goals.unshift(goal); return goal })
  }

  createTask(input: unknown): Promise<WorkTask> {
    const value = objectInput(input)
    const goalId = optionalId(value.goalId)
    const projectId = optionalId(value.projectId)
    if (goalId && !this.snapshot.goals.some((goal) => goal.id === goalId)) throw new Error('Referenced goal does not exist.')
    if (projectId && !this.snapshot.projects.some((project) => project.id === projectId)) throw new Error('Referenced project does not exist.')
    const now = new Date().toISOString()
    const task: WorkTask = {
      id: randomUUID(), type: 'task', title: requiredText(value.title, 'title'), description: optionalText(value.description),
      status: enumValue(value.status, ['todo', 'in_progress', 'blocked', 'done', 'cancelled'], 'todo'),
      priority: enumValue(value.priority, ['low', 'medium', 'high', 'urgent'], 'medium'), owner: optionalText(value.owner),
      dueDate: optionalDate(value.dueDate), goalId, projectId, expectedOutcome: optionalText(value.expectedOutcome),
      acceptanceCriteria: optionalText(value.acceptanceCriteria), sources: sourceReferences(value.sources), createdAt: now, updatedAt: now
    }
    return this.mutate((snapshot) => { snapshot.tasks.unshift(task); return task })
  }

  createOutcome(input: unknown): Promise<Outcome> {
    const value = objectInput(input)
    const goalId = optionalId(value.goalId)
    const taskId = optionalId(value.taskId)
    if (goalId && !this.snapshot.goals.some((goal) => goal.id === goalId)) throw new Error('Referenced goal does not exist.')
    if (taskId && !this.snapshot.tasks.some((task) => task.id === taskId)) throw new Error('Referenced task does not exist.')
    const now = new Date().toISOString()
    const outcome: Outcome = {
      id: randomUUID(), type: 'outcome', title: requiredText(value.title, 'title'), description: optionalText(value.description),
      kind: enumValue(value.kind, ['deliverable', 'metric', 'validation', 'business'], 'deliverable'),
      status: enumValue(value.status, ['draft', 'pending_review', 'accepted', 'rejected'], 'draft'), goalId, taskId,
      value: optionalNumber(value.value), unit: optionalText(value.unit), evidence: optionalText(value.evidence),
      sources: sourceReferences(value.sources), createdAt: now, updatedAt: now
    }
    return this.mutate((snapshot) => { snapshot.outcomes.unshift(outcome); return outcome })
  }

  createInspiration(input: unknown): Promise<Inspiration> {
    const value = objectInput(input)
    const description = requiredLongText(value.content ?? value.description, 'content')
    const now = new Date().toISOString()
    const inspiration: Inspiration = {
      id: randomUUID(), type: 'inspiration', title: optionalText(value.title).slice(0, 120) || description.slice(0, 60),
      description, status: 'inbox', convertedTaskId: null, sources: sourceReferences(value.sources), createdAt: now, updatedAt: now
    }
    return this.mutate((snapshot) => { snapshot.inspirations.unshift(inspiration); return inspiration })
  }

  createProject(input: unknown): Promise<Project> {
    const value = objectInput(input)
    const now = new Date().toISOString()
    const project: Project = {
      id: randomUUID(), type: 'project', title: requiredText(value.title, 'title'), description: optionalText(value.description),
      status: enumValue(value.status, ['planned', 'active', 'paused', 'completed', 'cancelled'], 'active'),
      owner: optionalText(value.owner), dueDate: optionalDate(value.dueDate), sources: sourceReferences(value.sources), createdAt: now, updatedAt: now
    }
    return this.mutate((snapshot) => { snapshot.projects.unshift(project); return project })
  }

  createMeeting(input: unknown): Promise<Meeting> {
    const value = objectInput(input)
    const projectId = optionalId(value.projectId)
    const goalIds = idList(value.goalIds)
    const resourceIds = resourceIdList(value.resourceIds)
    if (projectId && !this.snapshot.projects.some((project) => project.id === projectId)) throw new Error('Referenced project does not exist.')
    if (goalIds.some((id) => !this.snapshot.goals.some((goal) => goal.id === id))) throw new Error('Referenced goal does not exist.')
    const startsAt = requiredDateTime(value.startsAt, 'startsAt')
    const endsAt = optionalDateTime(value.endsAt)
    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) throw new Error('Meeting end must be after its start.')
    const now = new Date().toISOString()
    const meeting: Meeting = {
      id: randomUUID(), type: 'meeting', title: requiredText(value.title, 'title'), description: optionalText(value.description),
      status: enumValue(value.status, ['planned', 'in_progress', 'completed', 'cancelled'], 'planned'), startsAt, endsAt,
      participantCount: integerInRange(value.participantCount, 0, 10_000, 0), projectId, goalIds, resourceIds,
      sources: sourceReferences(value.sources), createdAt: now, updatedAt: now
    }
    return this.mutate((snapshot) => { snapshot.meetings.unshift(meeting); return meeting })
  }

  confirmKnowledge(input: unknown): Promise<KnowledgeItem> {
    const value = objectInput(input)
    const sources = sourceReferences(value.sources)
    if (!sources.some((source) => source.kind === 'resource' && source.id && source.evidenceBlockId)) {
      throw new Error('Confirmed knowledge requires an original resource evidence block.')
    }
    return this.mutate((snapshot) => {
      const existing = snapshot.knowledge.find((item) => item.sources.some((source) => sources.some((candidate) =>
        source.kind === 'resource' && source.id === candidate.id && source.evidenceBlockId === candidate.evidenceBlockId
      )))
      if (existing) return existing
      const now = new Date().toISOString()
      const item: KnowledgeItem = {
        id: randomUUID(), type: 'knowledge', kind: enumValue(value.kind, ['claim', 'decision', 'insight'], 'claim'),
        status: 'confirmed', title: requiredText(value.title, 'title'), description: optionalText(value.description),
        sources, confirmedAt: now, createdAt: now, updatedAt: now
      }
      snapshot.knowledge.unshift(item)
      return item
    })
  }

  convertInspirationToTask(id: unknown, input: unknown = {}): Promise<WorkTask> {
    const inspirationId = requiredText(id, 'inspiration id')
    const value = objectInput(input)
    return this.mutate((snapshot) => {
      const inspiration = snapshot.inspirations.find((candidate) => candidate.id === inspirationId)
      if (!inspiration) throw new Error('Inspiration does not exist.')
      if (inspiration.convertedTaskId) {
        const existing = snapshot.tasks.find((task) => task.id === inspiration.convertedTaskId)
        if (existing) return existing
      }
      const goalId = optionalId(value.goalId)
      const projectId = optionalId(value.projectId)
      if (goalId && !snapshot.goals.some((goal) => goal.id === goalId)) throw new Error('Referenced goal does not exist.')
      if (projectId && !snapshot.projects.some((project) => project.id === projectId)) throw new Error('Referenced project does not exist.')
      const now = new Date().toISOString()
      const task: WorkTask = {
        id: randomUUID(), type: 'task', title: optionalText(value.title) || inspiration.title,
        description: optionalText(value.description) || inspiration.description, status: 'todo',
        priority: enumValue(value.priority, ['low', 'medium', 'high', 'urgent'], 'medium'), owner: optionalText(value.owner),
        dueDate: optionalDate(value.dueDate), goalId, projectId, expectedOutcome: optionalText(value.expectedOutcome),
        acceptanceCriteria: optionalText(value.acceptanceCriteria),
        sources: [{ kind: 'inspiration', id: inspiration.id, label: inspiration.title }], createdAt: now, updatedAt: now
      }
      snapshot.tasks.unshift(task)
      inspiration.status = 'converted'
      inspiration.convertedTaskId = task.id
      inspiration.updatedAt = now
      return task
    })
  }

  updateTaskStatus(id: unknown, status: unknown): Promise<WorkTask> {
    const taskId = requiredText(id, 'task id')
    const nextStatus = enumValue(status, ['todo', 'in_progress', 'blocked', 'done', 'cancelled'])
    const task = this.snapshot.tasks.find((candidate) => candidate.id === taskId)
    if (!task) throw new Error('Task does not exist.')
    const updated = { ...task, status: nextStatus, updatedAt: new Date().toISOString() }
    return this.mutate((snapshot) => {
      snapshot.tasks = snapshot.tasks.map((candidate) => candidate.id === taskId ? updated : candidate)
      return updated
    })
  }

  updateOutcomeStatus(id: unknown, status: unknown): Promise<Outcome> {
    const outcomeId = requiredText(id, 'outcome id')
    const nextStatus = enumValue(status, ['draft', 'pending_review', 'accepted', 'rejected'])
    return this.mutate((snapshot) => {
      const outcome = snapshot.outcomes.find((candidate) => candidate.id === outcomeId)
      if (!outcome) throw new Error('Outcome does not exist.')
      const updated = { ...outcome, status: nextStatus, updatedAt: new Date().toISOString() }
      snapshot.outcomes = snapshot.outcomes.map((candidate) => candidate.id === outcomeId ? updated : candidate)
      return updated
    })
  }

  updateGoalProgress(id: unknown, input: unknown): Promise<Goal> {
    const goalId = requiredText(id, 'goal id')
    const value = objectInput(input)
    return this.mutate((snapshot) => {
      const goal = snapshot.goals.find((candidate) => candidate.id === goalId)
      if (!goal) throw new Error('Goal does not exist.')
      const updated: Goal = {
        ...goal,
        current: value.current === undefined ? goal.current : optionalNumber(value.current),
        status: value.status === undefined ? goal.status : enumValue(value.status, ['active', 'achieved', 'paused', 'cancelled']),
        updatedAt: new Date().toISOString()
      }
      snapshot.goals = snapshot.goals.map((candidate) => candidate.id === goalId ? updated : candidate)
      return updated
    })
  }

  updateMeetingStatus(id: unknown, status: unknown): Promise<Meeting> {
    const meetingId = requiredText(id, 'meeting id')
    const nextStatus = enumValue(status, ['planned', 'in_progress', 'completed', 'cancelled'])
    return this.mutate((snapshot) => {
      const meeting = snapshot.meetings.find((candidate) => candidate.id === meetingId)
      if (!meeting) throw new Error('Meeting does not exist.')
      const updated = { ...meeting, status: nextStatus, updatedAt: new Date().toISOString() }
      snapshot.meetings = snapshot.meetings.map((candidate) => candidate.id === meetingId ? updated : candidate)
      return updated
    })
  }

  attachMeetingResource(id: unknown, resourceId: unknown): Promise<Meeting> {
    const meetingId = requiredText(id, 'meeting id')
    const [validatedResourceId] = resourceIdList([resourceId])
    return this.mutate((snapshot) => {
      const meeting = snapshot.meetings.find((candidate) => candidate.id === meetingId)
      if (!meeting) throw new Error('Meeting does not exist.')
      if (meeting.resourceIds.includes(validatedResourceId)) return meeting
      const updated = { ...meeting, resourceIds: [...meeting.resourceIds, validatedResourceId], updatedAt: new Date().toISOString() }
      snapshot.meetings = snapshot.meetings.map((candidate) => candidate.id === meetingId ? updated : candidate)
      return updated
    })
  }

  private async mutate<T>(change: (snapshot: WorkspaceSnapshot) => T): Promise<T> {
    let result: T | undefined
    this.writes = this.writes.catch(() => undefined).then(async () => {
      const next = structuredClone(this.snapshot)
      result = change(next)
      await this.persist(next)
      this.snapshot = next
    })
    await this.writes
    return structuredClone(result as T)
  }

  private async persist(snapshot: WorkspaceSnapshot = this.snapshot): Promise<void> {
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.path)
  }
}

function parseSnapshot(value: unknown): WorkspaceSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('Unsupported workspace data schema.')
  }
  const version = (value as { schemaVersion?: unknown }).schemaVersion
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4) throw new Error('Unsupported workspace data schema.')
  const candidate = value as Partial<WorkspaceSnapshot>
  if (!Array.isArray(candidate.goals) || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.outcomes)) {
    throw new Error('Workspace data is damaged.')
  }
  return {
    schemaVersion: 4,
    goals: structuredClone(candidate.goals),
    tasks: candidate.tasks.map((task) => ({ ...structuredClone(task), projectId: (task as Partial<WorkTask>).projectId ?? null })),
    outcomes: structuredClone(candidate.outcomes), inspirations: Array.isArray(candidate.inspirations) ? structuredClone(candidate.inspirations) : [],
    projects: Array.isArray(candidate.projects) ? structuredClone(candidate.projects) : [],
    meetings: Array.isArray(candidate.meetings) ? structuredClone(candidate.meetings) : [],
    knowledge: Array.isArray(candidate.knowledge) ? structuredClone(candidate.knowledge) : []
  }
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Input must be an object.')
  return value as Record<string, unknown>
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value.trim().slice(0, 500)
}

function requiredLongText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value.trim().slice(0, 10_000)
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 10_000) : ''
}

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Numeric value is invalid.')
  return value
}

function optionalDate(value: unknown): string | null {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('Date must use YYYY-MM-DD.')
  }
  return value
}

function requiredDateTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid date and time.`)
  return new Date(value).toISOString()
}

function optionalDateTime(value: unknown): string | null {
  return value === '' || value === null || value === undefined ? null : requiredDateTime(value, 'date time')
}

function idList(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || !item.trim())) throw new Error('ID list is invalid.')
  return [...new Set(value.map((item) => String(item).trim()))]
}

function resourceIdList(value: unknown): string[] {
  const ids = idList(value)
  if (ids.some((id) => !/^sha256:[a-f0-9]{64}$/.test(id))) throw new Error('Resource ID is invalid.')
  return ids
}

function integerInRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (value === '' || value === undefined || value === null) return fallback
  const number = typeof value === 'string' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isInteger(number) || number < minimum || number > maximum) throw new Error('Integer value is invalid.')
  return number
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T {
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback
    throw new Error('Value is required.')
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('Value is invalid.')
  return value as T
}

function sourceReferences(value: unknown): SourceReference[] {
  if (value === undefined) return [{ kind: 'manual', label: '用户手动创建' }]
  if (!Array.isArray(value) || value.length > 50) throw new Error('Sources are invalid.')
  return value.map((item) => {
    const source = objectInput(item)
    return {
      kind: enumValue(source.kind, ['manual', 'resource', 'meeting', 'inspiration', 'ai-suggestion']),
      id: optionalId(source.id) ?? undefined,
      label: requiredText(source.label, 'source label'),
      evidenceBlockId: optionalId(source.evidenceBlockId) ?? undefined
    }
  })
}
