import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WorkspaceStore } from './workspace-store.ts'

test('persists goals, linked tasks and outcomes across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workmuse-workspace-'))
  try {
    const store = new WorkspaceStore(directory)
    await store.initialize()
    const project = await store.createProject({ title: '企业版 MVP', owner: 'Mishu' })
    const goal = await store.createGoal({ title: '提升激活率', target: 45 })
    await store.updateGoalProgress(goal.id, { current: 42 })
    const task = await store.createTask({ title: '改进引导', projectId: project.id, goalId: goal.id, acceptanceCriteria: '完成评审' })
    await store.updateTaskStatus(task.id, 'done')
    const outcome = await store.createOutcome({ title: '实验结果', kind: 'metric', goalId: goal.id, taskId: task.id, value: 42, unit: '%' })
    await store.updateOutcomeStatus(outcome.id, 'accepted')
    const resourceId = `sha256:${'a'.repeat(64)}`
    const meeting = await store.createMeeting({ title: '项目评审', startsAt: '2026-08-29T09:00:00+08:00', projectId: project.id, goalIds: [goal.id] })
    await store.attachMeetingResource(meeting.id, resourceId)
    await store.attachMeetingResource(meeting.id, resourceId)
    await store.updateMeetingStatus(meeting.id, 'completed')
    const knowledge = await store.confirmKnowledge({ title: '用户需要更短的引导流程', sources: [{ kind: 'resource', id: resourceId, label: '访谈', evidenceBlockId: 'block-1' }] })
    const sameKnowledge = await store.confirmKnowledge({ title: '重复确认', sources: [{ kind: 'resource', id: resourceId, label: '访谈', evidenceBlockId: 'block-1' }] })
    assert.equal(sameKnowledge.id, knowledge.id)

    const reopened = new WorkspaceStore(directory)
    await reopened.initialize()
    const snapshot = reopened.list()
    assert.equal(snapshot.goals[0].title, '提升激活率')
    assert.equal(snapshot.goals[0].current, 42)
    assert.equal(snapshot.tasks[0].status, 'done')
    assert.equal(snapshot.outcomes[0].taskId, task.id)
    assert.equal(snapshot.outcomes[0].status, 'accepted')
    assert.equal(snapshot.tasks[0].projectId, project.id)
    assert.equal(snapshot.meetings[0].resourceIds[0], resourceId)
    assert.equal(snapshot.meetings[0].resourceIds.length, 1)
    assert.equal(snapshot.meetings[0].status, 'completed')
    assert.equal(snapshot.knowledge.length, 1)
    assert.equal(snapshot.tasks[0].sources[0].kind, 'manual')

    const inspiration = await reopened.createInspiration({ content: '把访谈洞察整理成执行任务' })
    const converted = await reopened.convertInspirationToTask(inspiration.id, { priority: 'high', goalId: goal.id })
    const convertedAgain = await reopened.convertInspirationToTask(inspiration.id)
    assert.equal(convertedAgain.id, converted.id)
    assert.equal(converted.sources[0].kind, 'inspiration')
    assert.equal(reopened.list().inspirations[0].convertedTaskId, converted.id)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('migrates version 1 snapshots without losing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workmuse-workspace-'))
  try {
    await writeFile(join(directory, 'workspace.v1.json'), JSON.stringify({ schemaVersion: 1, goals: [], tasks: [], outcomes: [] }))
    const store = new WorkspaceStore(directory)
    await store.initialize()
    const snapshot = store.list()
    assert.equal(snapshot.schemaVersion, 4)
    assert.deepEqual(snapshot.inspirations, [])
    assert.deepEqual(snapshot.projects, [])
    assert.deepEqual(snapshot.meetings, [])
    assert.deepEqual(snapshot.knowledge, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects broken relations and invalid dates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workmuse-workspace-'))
  try {
    const store = new WorkspaceStore(directory)
    await store.initialize()
    assert.throws(() => store.createTask({ title: '孤立任务', goalId: 'missing' }), /goal does not exist/)
    assert.throws(() => store.createMeeting({ title: '错误会议', startsAt: '2026-08-29T09:00:00Z', resourceIds: ['file:///secret'] }), /Resource ID is invalid/)
    assert.throws(() => store.confirmKnowledge({ title: '无来源结论' }), /original resource evidence block/)
    assert.throws(() => store.createGoal({ title: '错误日期', dueDate: 'tomorrow' }), /YYYY-MM-DD/)
    assert.deepEqual(store.list().tasks, [])
    assert.deepEqual(store.list().goals, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
