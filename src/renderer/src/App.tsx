import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle, Archive, ArrowRight, Bell, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, FilePlus2, Files,
  Flag, FolderKanban, Gauge, Home, Lightbulb, ListTodo, Menu, MessageSquareText, MoreHorizontal,
  Database, Download, Eye, EyeOff, FileSearch, LoaderCircle, LockKeyhole, LogIn, Plus, RefreshCw, RotateCcw, Search, Settings, ShieldCheck, Smartphone, Sparkles, Target, Trophy, Upload, Users, WandSparkles, WifiOff, X
} from 'lucide-react'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'
import { useWorkMuseCore } from './lib/use-workmuse-core'
import { useWorkspace } from './lib/use-workspace'
import type { QuestionAnswer, SearchResult, UnderstandResourceResult } from '../../core/content'
import type { Goal, Meeting } from '../../core/domain'
import type { AuthState, CoreSettings } from '../../preload'

const nav = [
  ['首页', Home], ['AI 助手', Bot], ['项目', FolderKanban], ['会议', CalendarDays],
  ['文件柜', Archive], ['目标', Target], ['任务', ListTodo], ['成果', Trophy],
  ['知识库', BookOpen], ['通知', Bell], ['团队与设置', Users]
] as const

const createItems = [
  ['记录灵感', Lightbulb], ['创建项目', FolderKanban], ['创建会议', CalendarDays],
  ['上传材料', Upload], ['创建目标', Target], ['创建任务', ListTodo], ['登记成果', Trophy]
] as const

const toneClass: Record<string, string> = {
  violet: 'bg-violet-50 text-violet-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600', purple: 'bg-fuchsia-50 text-fuchsia-600', emerald: 'bg-emerald-50 text-emerald-600'
}

function completedResource(job: ReturnType<typeof useWorkMuseCore>['jobs'][number]): UnderstandResourceResult | null {
  if (job.method !== 'resources.understand' || job.status !== 'succeeded' || !job.result || typeof job.result !== 'object') return null
  const result = job.result as Partial<UnderstandResourceResult>
  return result.content?.schema === 'workmuse.content.v1' && result.content.resource ? result as UnderstandResourceResult : null
}

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0) return '刚刚'
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function App(): React.JSX.Element {
  const [auth,setAuth] = useState<AuthState|null>(null)
  useEffect(()=>{if(!window.workmuseAuth){setAuth({configured:false,authenticated:false,profile:null});return}void window.workmuseAuth.state().then(setAuth)},[])
  if(!auth)return <div className="grid h-full place-items-center bg-slate-50"><LoaderCircle size={22} className="animate-spin text-violet-600"/></div>
  return auth.authenticated ? <Workspace profile={auth.profile} onLogout={()=>void window.workmuseAuth.logout().then(setAuth)}/> : <LoginScreen configured={auth.configured} onLogin={async(input)=>setAuth(await window.workmuseAuth.login(input))}/>
}

function Workspace({profile,onLogout}:{profile:AuthState['profile'];onLogout:()=>void}): React.JSX.Element {
  const [active, setActive] = useState('首页')
  const [newOpen, setNewOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)
  const [navOpen, setNavOpen] = useState(true)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [inspirationDraft, setInspirationDraft] = useState('')
  const [inspirationMessage, setInspirationMessage] = useState<string | null>(null)
  const [version, setVersion] = useState('…')
  const [updateState, setUpdateState] = useState<{status:string;message:string;percent?:number}>({status:'idle',message:'准备检查更新'})
  const core = useWorkMuseCore()
  const workspace = useWorkspace()
  const completedResources = core.jobs.filter((job) => job.method === 'resources.understand' && job.status === 'succeeded').length
  const runningJobs = core.jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
  const failedJobs = core.jobs.filter((job) => job.status === 'failed' || job.status === 'interrupted').length
  const recentResources = core.jobs
    .map((job) => ({ job, resource: completedResource(job) }))
    .filter((item): item is { job: typeof item.job; resource: UnderstandResourceResult } => item.resource !== null)
    .sort((left, right) => Date.parse(right.job.updatedAt) - Date.parse(left.job.updatedAt))
    .slice(0, 4)
  const openTasks = workspace.data.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled')
  const priorityTasks = [...openTasks].sort((left,right) => ['urgent','high','medium','low'].indexOf(left.priority)-['urgent','high','medium','low'].indexOf(right.priority)).slice(0,3)
  const todayLabel = new Intl.DateTimeFormat('zh-CN',{dateStyle:'full'}).format(new Date())
  const notificationCount = failedJobs + workspace.data.tasks.filter((task)=>task.status==='blocked').length + workspace.data.outcomes.filter((outcome)=>outcome.status==='draft'||outcome.status==='pending_review').length
  const homeMetrics = [
    { label: '已处理资料', value: String(completedResources), note: '可用于搜索与问答', icon: Files, tone: 'violet' },
    { label: '处理中', value: String(runningJobs), note: runningJobs ? '后台 Worker 正在处理' : '当前没有活动任务', icon: LoaderCircle, tone: 'blue' },
    { label: '需要处理', value: String(failedJobs), note: failedJobs ? '可在文件柜查看并重试' : '没有失败或中断任务', icon: AlertTriangle, tone: failedJobs ? 'red' : 'emerald' },
    { label: 'Core 状态', value: core.loading ? '…' : core.status?.available ? '在线' : '离线', note: core.status?.available ? '本地服务连接正常' : '查看文件柜中的错误信息', icon: Database, tone: core.status?.available ? 'emerald' : 'amber' },
    { label: '云端处理', value: core.settings?.allowCloud ? '已授权' : '关闭', note: core.settings?.allowCloud ? '仅处理用户明确选择的材料' : '仅在设置中明确授权后启用', icon: ShieldCheck, tone: core.settings?.allowCloud ? 'violet' : 'purple' }
  ]

  useEffect(() => {
    if (!window.updater) {
      setVersion('0.1.0')
      setUpdateState({status:'disabled',message:'浏览器预览模式不支持应用更新'})
      return
    }
    void window.updater.getVersion().then(setVersion)
    return window.updater.onState((state) => setUpdateState(state))
  }, [])

  useEffect(() => {
    const onShortcut = (event:KeyboardEvent):void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  const checkUpdate = async (): Promise<void> => {
    if (!window.updater) {
      setUpdateState({status:'disabled',message:'浏览器预览模式不支持应用更新'})
      return
    }
    setUpdateState({status:'checking',message:'正在检查更新…'})
    const result = await window.updater.check()
    if (!result.ok) setUpdateState({status:'disabled',message:result.message ?? '当前无法检查更新'})
  }

  const recordInspiration = async (event:FormEvent):Promise<void> => {
    event.preventDefault()
    if(!inspirationDraft.trim())return
    try {
      await workspace.createInspiration({content:inspirationDraft})
      setInspirationDraft('')
      setInspirationMessage('灵感已保存在本地收件箱。')
    } catch {
      setInspirationMessage(null)
    }
  }

  return (
    <div className="app-shell flex overflow-hidden bg-[#f4f5f8] text-slate-900">
      <aside className={cn('primary-nav relative flex shrink-0 flex-col border-r border-slate-200/70 bg-[#fafbfc] transition-[width] duration-200', navOpen ? 'w-[218px]' : 'w-[68px]')}>
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-200"><Sparkles size={17}/></div>
          {navOpen && <div className="nav-copy min-w-0"><div className="text-sm font-bold">WorkMuse</div><div className="truncate text-[9px] text-slate-400">可追溯 AI 工作台</div></div>}
        </div>
        <div className="mx-3 mb-3 h-px bg-slate-200/70"/>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {nav.map(([label, Icon], index) => <button key={label} onClick={() => setActive(label)} title={label} className={cn('group flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[11px] font-medium transition', active === label ? 'bg-violet-600 text-white shadow-sm shadow-violet-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900', index === 9 && 'mt-4')}><Icon size={15} className="shrink-0"/><span className={cn('nav-copy truncate transition-opacity', !navOpen && 'hidden')}>{label}</span>{label === '通知' && navOpen && notificationCount>0 && <span className="nav-copy ml-auto grid size-4 place-items-center rounded-full bg-red-500 text-[8px] text-white">{Math.min(notificationCount,99)}</span>}</button>)}
        </nav>
        <div className="m-2.5 border-t border-slate-200/70 pt-2"><button onClick={onLogout} title="退出本地工作区" className="flex h-11 w-full items-center gap-3 rounded-xl px-2 hover:bg-slate-100"><div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{profile?.displayName.slice(0,1).toUpperCase()||'W'}</div>{navOpen && <div className="nav-copy min-w-0 flex-1 text-left"><div className="truncate text-[11px] font-semibold">{profile?.displayName||'本地用户'}</div><div className="truncate text-[9px] text-slate-400">{profile?.email||'本地工作区'}</div></div>}{navOpen && <LogIn size={14} className="nav-copy rotate-180 text-slate-400"/>}</button></div>
        <button onClick={() => setNavOpen(!navOpen)} className="absolute -right-3 top-[76px] z-20 grid size-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm hover:text-violet-600">{navOpen ? <ChevronLeft size={12}/> : <ChevronRight size={12}/>}</button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="global-header relative z-30 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200/70 bg-white px-6">
          <div className="workspace-switch flex min-w-[160px] items-center gap-2 rounded-lg px-2 py-1.5 text-left"><span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-violet-600"><BriefcaseBusiness size={14}/></span><span className="workspace-copy min-w-0 flex-1"><span className="block text-[9px] text-slate-400">当前空间</span><span className="block truncate text-[11px] font-semibold">本地私有工作区</span></span></div>
          <button onClick={() => setSearchOpen(true)} className="global-search mx-auto flex h-9 min-w-0 w-full max-w-[560px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[11px] text-slate-400 transition hover:border-violet-200 hover:bg-white"><Search size={15} className="shrink-0"/><span className="min-w-0 flex-1 truncate text-left">搜索文件、会议、观点、任务，或直接提问……</span><kbd className="search-shortcut shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px]">⌘ K</kbd></button>
          <div className="relative">
            <Button onClick={() => setNewOpen(!newOpen)} className="h-9 rounded-xl px-3 text-[11px]"><Plus size={15}/>新建<ChevronDown size={12}/></Button>
            {newOpen && <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/60"><p className="px-2 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">快速新建</p>{createItems.map(([label, Icon]) => <button key={label} onClick={() => {setNewOpen(false);if(label==='上传材料')void core.importResource();else if(label==='记录灵感'){setActive('首页');setTimeout(()=>document.getElementById('quick-inspiration')?.focus(),0)}else if(label==='创建项目')setActive('项目');else if(label==='创建会议')setActive('会议');else if(label==='创建目标')setActive('目标');else if(label==='创建任务')setActive('任务');else if(label==='登记成果')setActive('成果')}} className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[11px] text-slate-600 hover:bg-violet-50 hover:text-violet-700"><Icon size={14}/>{label}</button>)}</div>}
          </div>
          <Button onClick={()=>setHelpOpen(true)} variant="ghost" size="icon" className="size-9" title="帮助与功能说明"><CircleHelp size={16}/></Button>
          <Button onClick={() => setUpdateOpen(true)} variant="ghost" size="icon" className="size-9" title="检查更新"><RefreshCw size={16}/></Button>
          <Button onClick={()=>setActive('通知')} variant="ghost" size="icon" className="relative size-9"><Bell size={16}/>{notificationCount>0&&<span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500 ring-2 ring-white"/>}</Button>
          <button onClick={onLogout} title="退出本地账户" className="grid size-8 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{profile?.displayName.slice(0,1).toUpperCase()||'W'}</button>
        </header>

        <div className="workspace-body flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main className="workspace-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-7 py-6">
            {active === '文件柜' ? <FileCabinet core={core} workspace={workspace}/> : active === 'AI 助手' ? <AiAssistantPage core={core} workspace={workspace}/> : active === '项目' ? <ProjectPage workspace={workspace}/> : active === '会议' ? <MeetingPage workspace={workspace} core={core}/> : active === '目标' ? <GoalPage workspace={workspace}/> : active === '任务' ? <TaskPage workspace={workspace}/> : active === '成果' ? <OutcomePage workspace={workspace}/> : active === '知识库' ? <KnowledgePage workspace={workspace} core={core}/> : active === '通知' ? <NotificationPage workspace={workspace} core={core} onNavigate={setActive}/> : active === '团队与设置' ? <SettingsPage core={core}/> : active !== '首页' ? <EmptyPage title={active}/> : <>
              <section className="mb-6 flex items-start justify-between gap-6">
                <div><div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-violet-600"><span>{todayLabel}</span><span className="size-1 rounded-full bg-slate-300"/><span>本地工作区</span></div><h1 className="text-[25px] font-bold tracking-[-.04em]">你好，Mishu</h1><p className="mt-1.5 text-[11px] text-slate-400">当前有 {openTasks.length} 件未完成任务。</p></div>
                <div className="min-w-[310px] max-w-[430px] rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700"><Flag size={13}/>优先任务</span><button onClick={()=>setActive('任务')} className="text-[9px] text-violet-500">进入任务中心</button></div>{priorityTasks.length?<div className="flex min-w-0 gap-1.5">{priorityTasks.map((task) => <span key={task.id} className="min-w-0 flex-1 truncate rounded-lg border border-violet-100 bg-white/80 px-2 py-1 text-[9px] text-violet-700">{task.title}</span>)}</div>:<p className="text-[9px] text-violet-400">还没有待处理任务。</p>}</div>
              </section>

              <form onSubmit={(event)=>void recordInspiration(event)} className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_4px_16px_rgba(37,43,66,.04)] focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-50"><span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-500"><Lightbulb size={15}/></span><input id="quick-inspiration" value={inspirationDraft} onChange={(event)=>{setInspirationDraft(event.target.value);setInspirationMessage(null)}} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-400" placeholder="快速记录灵感、想法或待办……"/><button disabled={workspace.saving||!inspirationDraft.trim()} className="rounded-lg px-3 py-2 text-[10px] font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-40">{workspace.saving?'保存中…':'记录'}</button></form>
              {(inspirationMessage||workspace.data.inspirations.length>0)&&<div className="mb-6 flex min-w-0 items-center gap-3 px-2 text-[8.5px] text-slate-400"><span>{inspirationMessage||`${workspace.data.inspirations.filter((item)=>item.status==='inbox').length} 条灵感待整理`}</span><div className="flex min-w-0 flex-1 gap-2 overflow-hidden">{workspace.data.inspirations.filter((item)=>item.status==='inbox').slice(0,2).map((item)=><span key={item.id} className="flex min-w-0 items-center gap-1 rounded-lg bg-white px-2 py-1"><span className="truncate">{item.title}</span><button onClick={()=>void workspace.convertInspirationToTask(item.id)} className="shrink-0 font-semibold text-violet-600">转为任务</button></span>)}</div></div>}

              <section className="mb-7 grid grid-cols-5 gap-2.5">{homeMetrics.map((item) => <article key={item.label} className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_5px_18px_rgba(33,38,60,.035)]"><div className="flex items-start justify-between"><div><p className="text-[9px] text-slate-400">{item.label}</p><strong className="mt-1 block text-[20px] tracking-tight">{item.value}</strong></div><span className={cn('grid size-8 place-items-center rounded-xl',toneClass[item.tone])}><item.icon size={15} className={item.label==='处理中'&&runningJobs>0?'animate-spin':''}/></span></div><p className={cn('mt-2 text-[8.5px]', item.tone === 'red' ? 'text-red-500' : 'text-slate-400')}>{item.note}</p></article>)}</section>

              <section className="mb-7 grid grid-cols-[1.05fr_.95fr] gap-5">
                <div><SectionTitle title="待办任务" subtitle="来自本地任务数据，按优先级排列" action="查看全部" onAction={()=>setActive('任务')}/><div className="min-h-[162px] overflow-hidden rounded-2xl border border-slate-100 bg-white">{priorityTasks.length?priorityTasks.map((task,index) => <div key={task.id} className={cn('group flex items-center gap-3 px-4 py-3',index<priorityTasks.length-1&&'border-b border-slate-100')}><button onClick={() => void workspace.updateTaskStatus(task.id,'done')} className="grid size-5 place-items-center rounded-full border border-slate-300 text-transparent hover:border-violet-500"><Check size={11}/></button><span className="w-10 text-[9px] font-semibold text-slate-500">{task.dueDate||'无期限'}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium">{task.title}</p><p className="mt-1 truncate text-[8.5px] text-slate-400">{task.expectedOutcome||'未填写预期成果'}</p></div><span className="rounded-md bg-violet-50 px-2 py-1 text-[8px] font-medium text-violet-600">{task.priority}</span></div>):<div className="grid min-h-[162px] place-items-center text-center"><div><ListTodo size={20} className="mx-auto text-slate-300"/><p className="mt-2 text-[9px] text-slate-400">还没有待办任务</p><button onClick={()=>setActive('任务')} className="mt-2 text-[9px] font-semibold text-violet-600">创建任务</button></div></div>}</div></div>
                <div><SectionTitle title="最近资料" subtitle="来自本地 Core 的真实处理记录" action="文件柜" onAction={() => setActive('文件柜')}/>{recentResources.length ? <div className="grid grid-cols-2 gap-2.5">{recentResources.map(({job,resource}) => <button key={job.id} onClick={() => void window.workmuseCore?.openSource(resource.content.resource.id)} className="flex min-h-[76px] items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left transition hover:-translate-y-px hover:border-violet-100 hover:shadow-md"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Files size={14}/></span><span className="min-w-0"><strong className="block truncate text-[10px]">{resource.content.title || resource.content.resource.fileName}</strong><span className="mt-1.5 block text-[8.5px] text-slate-400">{resource.content.resource.kind} · {relativeTime(job.updatedAt)}</span><span className="mt-1 block text-[8px] text-slate-300">{resource.content.blocks.length} 个可检索内容块</span></span></button>)}</div> : <div className="grid min-h-[162px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center"><div><Files size={20} className="mx-auto text-slate-300"/><p className="mt-2 text-[10px] font-semibold text-slate-600">还没有已处理资料</p><p className="mt-1 text-[8.5px] text-slate-400">上传第一份材料后会显示在这里。</p><button onClick={() => void core.importResource()} className="mt-3 text-[9px] font-semibold text-violet-600 hover:text-violet-700">上传材料</button></div></div>}</div>
              </section>

              <section><SectionTitle title="目标与成果概览" subtitle="只显示已登记的目标值与实际成果，不生成未经证实的进度" action="进入目标中心" onAction={()=>setActive('目标')}/><div className="overflow-hidden rounded-2xl border border-slate-100 bg-white"><div className="grid grid-cols-[1.5fr_.8fr_.9fr_.65fr_1.2fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[8.5px] font-semibold text-slate-400"><span>目标</span><span>当前 / 目标</span><span>差距</span><span>状态</span><span>关联</span></div>{workspace.data.goals.length?workspace.data.goals.slice(0,5).map((goal,index) => {const gap=goal.current!==null&&goal.target!==null?goal.current-goal.target:null;const taskCount=workspace.data.tasks.filter((task)=>task.goalId===goal.id).length;const outcomeCount=workspace.data.outcomes.filter((outcome)=>outcome.goalId===goal.id).length;return <div key={goal.id} className={cn('grid grid-cols-[1.5fr_.8fr_.9fr_.65fr_1.2fr] items-center gap-4 px-4 py-3.5',index<Math.min(workspace.data.goals.length,5)-1&&'border-b border-slate-100')}><div className="min-w-0"><p className="truncate text-[10.5px] font-semibold">{goal.title}</p><p className="mt-1 text-[8px] text-slate-400">负责人 · {goal.owner||'未指定'}</p></div><span className="text-[9px] font-medium">{goal.current??'—'} / {goal.target??'—'}</span><span className={cn('text-[9px] font-semibold',gap===null?'text-slate-400':gap<0?'text-amber-600':'text-emerald-600')}>{gap===null?'依据不足':gap>0?`+${gap}`:gap}</span><StatusBadge label={goal.status==='active'?'进行中':goal.status}/><span className="text-[9px] text-slate-500">{taskCount} 任务 · {outcomeCount} 成果</span></div>}):<div className="grid min-h-32 place-items-center text-[9px] text-slate-400">还没有目标；请先在目标中心创建。</div>}</div></section>
            </>}
          </main>

          {aiOpen ? <WorkspaceInsightPanel workspace={workspace} onClose={()=>setAiOpen(false)} onNavigate={setActive}/> : <button onClick={() => setAiOpen(true)} className="m-3 grid size-9 shrink-0 place-items-center self-start rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200" title="展开工作提醒"><Bot size={16}/></button>}
          <button onClick={() => setAiOpen(true)} className="responsive-ai-trigger fixed bottom-4 right-4 z-40 hidden size-10 place-items-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-300" title="打开工作提醒"><Bot size={17}/></button>
        </div>
      </div>
      {updateOpen && <UpdateDialog version={version} state={updateState} onClose={() => setUpdateOpen(false)} onCheck={() => void checkUpdate()} onInstall={() => void window.updater?.install()}/>} 
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onSearch={core.search}/>}
      {helpOpen&&<HelpDialog onClose={()=>setHelpOpen(false)}/>}
    </div>
  )
}

type WorkspaceHook = ReturnType<typeof useWorkspace>

function WorkspaceInsightPanel({workspace,onClose,onNavigate}:{workspace:WorkspaceHook;onClose:()=>void;onNavigate:(page:string)=>void}):React.JSX.Element {
  const blocked=workspace.data.tasks.filter((task)=>task.status==='blocked')
  const unsupported=workspace.data.goals.filter((goal)=>!workspace.data.tasks.some((task)=>task.goalId===goal.id))
  const pending=workspace.data.outcomes.filter((outcome)=>outcome.status==='draft'||outcome.status==='pending_review')
  return <aside className="ai-panel flex min-h-0 w-[302px] shrink-0 flex-col border-l border-slate-200/70 bg-[#fcfcfe]"><div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-4"><div className="flex items-center gap-2 text-[11px] font-bold"><span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-violet-600"><Gauge size={14}/></span>工作提醒</div><button onClick={onClose} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={14}/></button></div><div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white"><div className="flex items-center gap-2 text-[10px] font-semibold"><ShieldCheck size={14}/>规则计算 · 非 AI 推断</div><p className="mt-2.5 text-[10px] leading-5 text-slate-300">以下提醒仅依据你登记的目标、任务和成果状态计算，不会补全缺失事实。</p></div><InsightCard tone="red" title="受阻任务" count={blocked.length} text={blocked.length?blocked.slice(0,2).map((item)=>item.title).join('、'):'当前没有标记为受阻的任务'} onClick={()=>onNavigate('任务')}/><InsightCard tone="amber" title="缺少任务支撑的目标" count={unsupported.length} text={unsupported.length?unsupported.slice(0,2).map((item)=>item.title).join('、'):'所有目标均已有任务关联'} onClick={()=>onNavigate('目标')}/><InsightCard tone="violet" title="待确认成果" count={pending.length} text={pending.length?'草稿或待审核成果尚不能作为已确认事实。':'当前没有待确认成果'} onClick={()=>onNavigate('成果')}/></div><div className="shrink-0 border-t border-slate-100 p-3"><button onClick={() => onNavigate('AI 助手')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-100"><Bot size={14}/>基于资料询问 AI</button></div></aside>
}

function InsightCard({tone,title,count,text,onClick}:{tone:string;title:string;count:number;text:string;onClick:()=>void}):React.JSX.Element { return <button onClick={onClick} className="mt-3 block w-full rounded-2xl border border-slate-100 bg-white p-3.5 text-left hover:border-violet-100"><div className="flex items-center justify-between"><span className="text-[10px] font-bold">{title}</span><span className={cn('grid min-w-6 place-items-center rounded-md px-1.5 py-1 text-[8px] font-bold',toneClass[tone])}>{count}</span></div><p className="mt-2 text-[9px] leading-4 text-slate-400">{text}</p></button> }

function ProjectPage({workspace}:{workspace:WorkspaceHook}):React.JSX.Element {
  const submit=(event:FormEvent<HTMLFormElement>):void=>{event.preventDefault();const form=event.currentTarget;const values=new FormData(form);void workspace.createProject({title:values.get('title'),description:values.get('description'),owner:values.get('owner'),dueDate:values.get('dueDate'),status:values.get('status')}).then(()=>form.reset()).catch(()=>undefined)}
  return <BusinessPage title="项目" subtitle="项目聚合会议、目标和任务；当前数据仅保存在本地工作区。" loading={workspace.loading} saving={workspace.saving} error={workspace.error} form={<form onSubmit={submit} className="space-y-3"><FormField label="项目名称"><input name="title" required className="form-control"/></FormField><FormField label="说明"><textarea name="description" className="form-control min-h-20 resize-y"/></FormField><div className="grid grid-cols-2 gap-3"><FormField label="负责人"><input name="owner" className="form-control"/></FormField><FormField label="截止日期"><input name="dueDate" type="date" className="form-control"/></FormField></div><FormField label="状态"><select name="status" className="form-control"><option value="active">进行中</option><option value="planned">计划中</option><option value="paused">暂停</option><option value="completed">已完成</option></select></FormField><SaveButton saving={workspace.saving} label="创建项目"/></form>} empty="还没有项目" count={workspace.data.projects.length}>{workspace.data.projects.map((project)=>{const meetings=workspace.data.meetings.filter((item)=>item.projectId===project.id).length;const tasks=workspace.data.tasks.filter((item)=>item.projectId===project.id).length;return <article key={project.id} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-start justify-between"><div><h3 className="text-[12px] font-bold">{project.title}</h3><p className="mt-1 text-[8.5px] text-slate-400">{project.owner||'未指定负责人'} · {project.dueDate||'未设置期限'}</p></div><StatusBadge label={project.status}/></div>{project.description&&<p className="mt-3 text-[9.5px] leading-5 text-slate-500">{project.description}</p>}<div className="mt-3 flex gap-2 text-[8.5px] text-slate-500"><span className="rounded-lg bg-slate-50 px-2 py-1">{meetings} 场会议</span><span className="rounded-lg bg-slate-50 px-2 py-1">{tasks} 个任务</span></div><SourceLine label={project.sources[0]?.label}/></article>})}</BusinessPage>
}

function MeetingPage({workspace,core}:{workspace:WorkspaceHook;core:ReturnType<typeof useWorkMuseCore>}):React.JSX.Element {
  const resources=core.jobs.map((job)=>completedResource(job)).filter((item):item is UnderstandResourceResult=>item!==null)
  const resourceMap=new Map(resources.map((item)=>[item.content.resource.id,item.content.title||item.content.resource.fileName]))
  const submit=(event:FormEvent<HTMLFormElement>):void=>{event.preventDefault();const form=event.currentTarget;const values=new FormData(form);const goalId=String(values.get('goalId')??'');void workspace.createMeeting({title:values.get('title'),description:values.get('description'),startsAt:values.get('startsAt'),endsAt:values.get('endsAt'),participantCount:values.get('participantCount'),projectId:values.get('projectId'),goalIds:goalId?[goalId]:[],resourceIds:values.getAll('resourceIds')}).then(()=>form.reset()).catch(()=>undefined)}
  return <BusinessPage title="会议" subtitle="会议可以关联项目、目标和已导入资料；资料 ID 在主进程验证后才会保存。" loading={workspace.loading} saving={workspace.saving} error={workspace.error||core.error} form={<form onSubmit={submit} className="space-y-3"><FormField label="会议名称"><input name="title" required className="form-control"/></FormField><FormField label="议程与说明"><textarea name="description" className="form-control min-h-16 resize-y"/></FormField><div className="grid grid-cols-2 gap-3"><FormField label="开始时间"><input name="startsAt" required type="datetime-local" className="form-control"/></FormField><FormField label="结束时间"><input name="endsAt" type="datetime-local" className="form-control"/></FormField><FormField label="参与人数"><input name="participantCount" type="number" min="0" className="form-control"/></FormField><FormField label="关联项目"><select name="projectId" className="form-control"><option value="">暂不关联</option>{workspace.data.projects.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField></div><FormField label="关联目标"><select name="goalId" className="form-control"><option value="">暂不关联</option>{workspace.data.goals.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></FormField><FormField label="会议材料"><div className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">{resources.length?resources.map((item)=><label key={item.content.resource.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[8.5px] text-slate-500 hover:bg-slate-50"><input type="checkbox" name="resourceIds" value={item.content.resource.id}/><span className="truncate">{item.content.title||item.content.resource.fileName}</span></label>):<span className="block p-2 text-[8.5px] text-slate-400">文件柜中暂无已处理资料</span>}</div></FormField><SaveButton saving={workspace.saving} label="创建会议"/></form>} empty="还没有会议" count={workspace.data.meetings.length}>{workspace.data.meetings.map((meeting)=>{const upload=async():Promise<void>=>{const imported=await core.importResource();if(imported)await workspace.attachMeetingResource(meeting.id,imported.asset.id)};return <article key={meeting.id} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-[12px] font-bold">{meeting.title}</h3><p className="mt-1 text-[8.5px] text-slate-400">{new Date(meeting.startsAt).toLocaleString()} · {meeting.participantCount} 人</p></div><select aria-label="会议状态" value={meeting.status} onChange={(event)=>void workspace.updateMeetingStatus(meeting.id,event.target.value as typeof meeting.status)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[8.5px]"><option value="planned">计划中</option><option value="in_progress">进行中</option><option value="completed">已结束</option><option value="cancelled">已取消</option></select></div>{meeting.description&&<p className="mt-3 text-[9.5px] leading-5 text-slate-500">{meeting.description}</p>}<div className="mt-3 flex flex-wrap gap-2">{meeting.resourceIds.map((id)=><button key={id} onClick={()=>void window.workmuseCore.openSource(id)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[8px] text-blue-600"><Files size={10}/>{resourceMap.get(id)||'会议材料'}</button>)}{meeting.goalIds.length>0&&<span className="rounded-lg bg-violet-50 px-2 py-1 text-[8px] text-violet-600">{meeting.goalIds.length} 个目标</span>}<button onClick={()=>void upload()} disabled={core.importing||workspace.saving} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[8px] font-semibold text-amber-700 disabled:opacity-50"><Upload size={10}/>{core.importing?'处理中…':'添加录音或材料'}</button></div><MeetingContent meeting={meeting} resources={resources} workspace={workspace}/><SourceLine label={meeting.sources[0]?.label}/></article>})}</BusinessPage>
}

function MeetingContent({meeting,resources,workspace}:{meeting:Meeting;resources:UnderstandResourceResult[];workspace:WorkspaceHook}):React.JSX.Element|null {
  const linked=resources.filter((resource)=>meeting.resourceIds.includes(resource.content.resource.id))
  if(!linked.length)return meeting.resourceIds.length?<div className="mt-3 rounded-xl bg-amber-50 p-3 text-[8.5px] text-amber-700">资料已保存，等待 Core 完成理解与索引。</div>:null
  const actions=linked.flatMap((resource)=>resource.content.semantics.actionItems.map((action)=>({action,resource})))
  return <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"><summary className="cursor-pointer text-[9px] font-semibold text-slate-600">查看会议纪要与原始记录</summary><div className="mt-3 space-y-3">{linked.map((resource)=><div key={resource.content.resource.id}>{resource.content.semantics.summary&&<div className="rounded-xl bg-violet-50 p-3"><span className="rounded bg-white px-1.5 py-1 text-[7.5px] font-semibold text-violet-600">系统摘要 · AI 推断</span><p className="mt-2 text-[9px] leading-5 text-slate-600">{resource.content.semantics.summary}</p></div>}<div className="mt-2 space-y-1">{resource.content.blocks.filter((block)=>block.type==='transcript'||block.type==='paragraph').slice(0,8).map((block)=><div key={block.id} className="rounded-lg bg-white px-3 py-2"><div className="flex items-center gap-2 text-[7.5px] text-slate-400"><span className="text-blue-600">原始记录</span><span>{formatLocation(block.location)}</span></div><p className="mt-1 text-[8.5px] leading-4 text-slate-600">{block.text}</p></div>)}</div></div>)}{actions.length>0&&<div><p className="mb-2 text-[8.5px] font-semibold text-slate-500">待确认行动项</p>{actions.map(({action,resource})=>{const evidence=action.evidence[0];const created=evidence?workspace.data.tasks.some((task)=>task.sources.some((source)=>source.id===resource.content.resource.id&&source.evidenceBlockId===evidence.blockId)):false;const create=():void=>{void workspace.createTask({title:action.text,owner:action.assignee??'',dueDate:action.dueDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]??'',sources:[{kind:'meeting',id:meeting.id,label:meeting.title},{kind:'resource',id:resource.content.resource.id,label:resource.content.title||resource.content.resource.fileName,evidenceBlockId:evidence?.blockId}]}).catch(()=>undefined)};return <div key={`${resource.content.resource.id}:${action.id}`} className="mb-1 flex items-center gap-2 rounded-lg bg-white px-3 py-2"><span className="min-w-0 flex-1 text-[8.5px] text-slate-600">{action.text}</span><button onClick={create} disabled={created||workspace.saving} className="shrink-0 text-[8px] font-semibold text-violet-600 disabled:text-slate-400">{created?'已创建':'确认并转任务'}</button></div>})}</div>}</div></details>
}

function KnowledgePage({workspace,core}:{workspace:WorkspaceHook;core:ReturnType<typeof useWorkMuseCore>}):React.JSX.Element {
  const resources=core.jobs.map((job)=>completedResource(job)).filter((item):item is UnderstandResourceResult=>item!==null)
  const titles=new Map(resources.map((item)=>[item.content.resource.id,item.content.title||item.content.resource.fileName]))
  const extracted=resources.flatMap((resource)=>resource.content.semantics.claims.map((claim)=>({claim,resource})))
  const isConfirmed=(resourceId:string,blockId:string):boolean=>workspace.data.knowledge.some((item)=>item.sources.some((source)=>source.id===resourceId&&source.evidenceBlockId===blockId))
  return <div className="mx-auto max-w-[1080px]"><header className="mb-6"><p className="mb-1 text-[9px] font-semibold uppercase tracking-[.15em] text-violet-600">可追溯知识库</p><h1 className="text-[24px] font-bold tracking-[-.04em]">已确认知识与待确认观点</h1><p className="mt-2 text-[10px] text-slate-400">Core 提取内容不会自动成为知识；只有你确认且具备原始证据块的内容才会入库。</p></header>{workspace.error&&<ErrorState message={workspace.error}/>}<div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5"><section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-[13px] font-bold">已确认知识</h2><p className="mt-1 text-[8.5px] text-slate-400">可随时打开原材料复核。</p></div><span className="text-[9px] text-slate-400">{workspace.data.knowledge.length} 条</span></div>{workspace.loading?<LoadingRows/>:workspace.data.knowledge.length?<div className="space-y-2">{workspace.data.knowledge.map((item)=><article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center gap-2"><span className="rounded-md bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-600">用户已确认</span><span className="text-[8px] text-slate-400">{new Date(item.confirmedAt).toLocaleString()}</span></div><h3 className="mt-3 text-[11px] font-semibold leading-5">{item.title}</h3>{item.description&&<p className="mt-2 text-[9px] leading-5 text-slate-500">{item.description}</p>}<div className="mt-3 flex flex-wrap gap-2">{item.sources.filter((source)=>source.kind==='resource'&&source.id).map((source)=><button key={`${source.id}:${source.evidenceBlockId}`} onClick={()=>void window.workmuseCore.openSource(source.id!)} className="rounded-lg bg-blue-50 px-2 py-1 text-[8px] text-blue-600">原始资料：{titles.get(source.id!)||source.label}</button>)}</div></article>)}</div>:<EmptyState title="还没有已确认知识" detail="请在右侧核对 Core 提取观点并确认来源。"/>}</section><aside><div className="mb-3"><h2 className="text-[13px] font-bold">待确认观点</h2><p className="mt-1 text-[8.5px] text-slate-400">AI/Core 提取 · 尚不是已确认事实</p></div><div className="max-h-[calc(100vh-190px)] space-y-2 overflow-y-auto pr-1">{extracted.length?extracted.slice(0,30).map(({claim,resource})=>{const evidence=claim.evidence[0];const confirmed=evidence?isConfirmed(resource.content.resource.id,evidence.blockId):false;const confirm=():void=>{if(!evidence)return;void workspace.confirmKnowledge({kind:'claim',title:claim.text,sources:claim.evidence.map((item)=>({kind:'resource',id:item.resourceId,label:resource.content.title||resource.content.resource.fileName,evidenceBlockId:item.blockId}))}).catch(()=>undefined)};return <article key={`${resource.content.resource.id}:${claim.id}`} className="rounded-2xl border border-amber-100 bg-amber-50/30 p-3.5"><p className="text-[9.5px] font-medium leading-5 text-slate-700">{claim.text}</p><p className="mt-2 text-[8px] text-slate-400">来源：{resource.content.title||resource.content.resource.fileName}</p><div className="mt-3 flex items-center justify-between"><button onClick={()=>evidence&&void window.workmuseCore.openSource(evidence.resourceId)} className="text-[8px] font-medium text-blue-600">查看原文</button><button onClick={confirm} disabled={!evidence||confirmed||workspace.saving} className="rounded-lg bg-white px-2 py-1.5 text-[8px] font-semibold text-violet-600 disabled:text-slate-400">{confirmed?'已确认':'确认入库'}</button></div></article>}):<EmptyState title="暂无待确认观点" detail="导入并完成语义理解后，提取观点会显示在这里。"/>}</div></aside></div></div>
}

function NotificationPage({workspace,core,onNavigate}:{workspace:WorkspaceHook;core:ReturnType<typeof useWorkMuseCore>;onNavigate:(page:string)=>void}):React.JSX.Element {
  const failed=core.jobs.filter((job)=>job.status==='failed'||job.status==='interrupted')
  const blocked=workspace.data.tasks.filter((task)=>task.status==='blocked')
  const pendingOutcomes=workspace.data.outcomes.filter((outcome)=>outcome.status==='draft'||outcome.status==='pending_review')
  const pendingClaims=core.jobs.map((job)=>completedResource(job)).filter((item):item is UnderstandResourceResult=>item!==null).reduce((count,item)=>count+item.content.semantics.claims.length,0)-workspace.data.knowledge.length
  const total=failed.length+blocked.length+pendingOutcomes.length+Math.max(0,pendingClaims)
  return <div className="mx-auto max-w-[900px]"><header className="mb-6"><h1 className="text-[24px] font-bold tracking-[-.04em]">通知与待处理事项</h1><p className="mt-2 text-[10px] text-slate-400">由本地 Core 与业务状态实时计算，不包含虚构消息或远程推送。</p></header>{total===0?<EmptyState title="当前没有待处理通知" detail="Core 处理正常，业务记录中也没有需要确认的状态。"/>:<div className="space-y-3">{failed.length>0&&<NotificationGroup icon={AlertTriangle} tone="red" title={`${failed.length} 个 Core 任务需要处理`} detail={failed[0].error?.message??'处理失败或应用中断'} action="打开文件柜" onClick={()=>onNavigate('文件柜')}/>} {blocked.length>0&&<NotificationGroup icon={ListTodo} tone="amber" title={`${blocked.length} 个任务受阻`} detail={blocked.slice(0,3).map((item)=>item.title).join('、')} action="查看任务" onClick={()=>onNavigate('任务')}/>} {pendingOutcomes.length>0&&<NotificationGroup icon={Trophy} tone="violet" title={`${pendingOutcomes.length} 个成果尚未确认`} detail="草稿或待审核成果不能作为已确认事实参与目标判断。" action="查看成果" onClick={()=>onNavigate('成果')}/>} {pendingClaims>0&&<NotificationGroup icon={BookOpen} tone="blue" title={`${pendingClaims} 条提取观点待确认`} detail="Core 提取结果需核对原文后才能进入知识库。" action="打开知识库" onClick={()=>onNavigate('知识库')}/>}</div>}</div>
}

function NotificationGroup({icon:Icon,tone,title,detail,action,onClick}:{icon:typeof AlertTriangle;tone:string;title:string;detail:string;action:string;onClick:()=>void}):React.JSX.Element { return <article className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4"><span className={cn('grid size-10 shrink-0 place-items-center rounded-xl',toneClass[tone])}><Icon size={17}/></span><div className="min-w-0 flex-1"><h2 className="text-[11px] font-semibold">{title}</h2><p className="mt-1.5 truncate text-[8.5px] text-slate-400">{detail}</p></div><button onClick={onClick} className="rounded-lg bg-violet-50 px-3 py-2 text-[8.5px] font-semibold text-violet-600">{action}</button></article> }

function GoalPage({workspace}:{workspace:WorkspaceHook}): React.JSX.Element {
  const submit = (event:FormEvent<HTMLFormElement>):void => {
    event.preventDefault(); const form=event.currentTarget; const values=new FormData(form)
    void workspace.createGoal({title:values.get('title'),description:values.get('description'),owner:values.get('owner'),metric:values.get('metric'),baseline:numberOrEmpty(values.get('baseline')),current:numberOrEmpty(values.get('current')),target:numberOrEmpty(values.get('target')),dueDate:values.get('dueDate')}).then(()=>form.reset()).catch(()=>undefined)
  }
  return <BusinessPage title="目标中心" subtitle="目标值、当前成果和期限保存在本地；目标依据会明确标注来源。" loading={workspace.loading} saving={workspace.saving} error={workspace.error} form={<form onSubmit={submit} className="space-y-3"><FormField label="目标名称"><input name="title" required maxLength={500} className="form-control" placeholder="例如：提升新用户激活率"/></FormField><FormField label="说明"><textarea name="description" className="form-control min-h-20 resize-y"/></FormField><div className="grid grid-cols-2 gap-3"><FormField label="负责人"><input name="owner" className="form-control"/></FormField><FormField label="截止日期"><input name="dueDate" type="date" className="form-control"/></FormField></div><FormField label="指标"><input name="metric" className="form-control" placeholder="例如：激活率（%）"/></FormField><div className="grid grid-cols-3 gap-2"><FormField label="基准"><input name="baseline" type="number" step="any" className="form-control"/></FormField><FormField label="当前"><input name="current" type="number" step="any" className="form-control"/></FormField><FormField label="目标"><input name="target" type="number" step="any" className="form-control"/></FormField></div><SaveButton saving={workspace.saving} label="创建目标"/></form>} empty="还没有目标" count={workspace.data.goals.length}>{workspace.data.goals.map((goal)=><article key={goal.id} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="truncate text-[12px] font-bold">{goal.title}</h3><p className="mt-1 text-[9px] text-slate-400">{goal.owner||'未指定负责人'} · {goal.dueDate||'未设置期限'}</p></div><StatusBadge label={goal.status==='active'?'进行中':goal.status}/></div>{goal.description&&<p className="mt-3 text-[9.5px] leading-5 text-slate-500">{goal.description}</p>}<GoalProgress goal={goal} workspace={workspace}/><SourceLine label={goal.sources[0]?.label}/></article>)}</BusinessPage>
}

function GoalProgress({goal,workspace}:{goal:Goal;workspace:WorkspaceHook}):React.JSX.Element {
  const hasValues=goal.current!==null&&goal.target!==null
  const gap=hasValues?goal.target!-goal.current!:null
  const baselineProgress=hasValues&&goal.baseline!==null&&goal.target!==goal.baseline?Math.max(0,Math.min(100,((goal.current!-goal.baseline)/(goal.target!-goal.baseline))*100)):null
  const timeProgress=goal.dueDate?Math.max(0,Math.min(100,((Date.now()-Date.parse(goal.createdAt))/(Date.parse(`${goal.dueDate}T23:59:59`)-Date.parse(goal.createdAt)))*100)):null
  const submit=(event:FormEvent<HTMLFormElement>):void=>{event.preventDefault();const value=new FormData(event.currentTarget).get('current');const current=typeof value==='string'&&value.trim()?Number(value):null;void workspace.updateGoalProgress(goal.id,{current}).catch(()=>undefined)}
  return <div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="grid grid-cols-3 gap-2 text-center"><Metric label="基准" value={goal.baseline}/><Metric label="当前" value={goal.current}/><Metric label="目标" value={goal.target}/></div><div className="mt-3 border-t border-slate-200/70 pt-3"><div className="flex items-center justify-between text-[8px]"><span className="font-semibold text-slate-500">差距分析</span><span className={gap===null?'text-slate-400':gap>0?'text-amber-600':'text-emerald-600'}>{gap===null?'数据不足':gap>0?`还差 ${gap}`:`已达到目标（${Math.abs(gap)}）`}</span></div><p className="mt-1.5 text-[8px] leading-4 text-slate-400">依据：目标值 − 当前值{baselineProgress!==null?`；指标完成度 ${baselineProgress.toFixed(1)}%`:''}{timeProgress!==null&&Number.isFinite(timeProgress)?`；时间进度 ${timeProgress.toFixed(1)}%`:''}。当前值由用户确认更新，不由任务完成自动推断。</p><form onSubmit={submit} className="mt-2 flex gap-2"><input name="current" type="number" step="any" defaultValue={goal.current??''} className="form-control" aria-label="当前值"/><button disabled={workspace.saving} className="shrink-0 rounded-lg bg-white px-3 text-[8.5px] font-semibold text-violet-600">更新当前值</button></form></div></div>
}

function TaskPage({workspace}:{workspace:WorkspaceHook}): React.JSX.Element {
  const submit = (event:FormEvent<HTMLFormElement>):void => {
    event.preventDefault(); const form=event.currentTarget; const values=new FormData(form)
    void workspace.createTask({title:values.get('title'),description:values.get('description'),owner:values.get('owner'),dueDate:values.get('dueDate'),priority:values.get('priority'),projectId:values.get('projectId'),goalId:values.get('goalId'),expectedOutcome:values.get('expectedOutcome'),acceptanceCriteria:values.get('acceptanceCriteria')}).then(()=>form.reset()).catch(()=>undefined)
  }
  return <BusinessPage title="任务中心" subtitle="任务与项目、目标、预期成果、验收标准和来源分开保存。完成任务不等于取得成果。" loading={workspace.loading} saving={workspace.saving} error={workspace.error} form={<form onSubmit={submit} className="space-y-3"><FormField label="任务名称"><input name="title" required className="form-control"/></FormField><FormField label="说明"><textarea name="description" className="form-control min-h-16 resize-y"/></FormField><div className="grid grid-cols-2 gap-3"><FormField label="负责人"><input name="owner" className="form-control"/></FormField><FormField label="截止日期"><input name="dueDate" type="date" className="form-control"/></FormField><FormField label="优先级"><select name="priority" className="form-control"><option value="medium">中</option><option value="high">高</option><option value="urgent">紧急</option><option value="low">低</option></select></FormField><FormField label="所属项目"><select name="projectId" className="form-control"><option value="">暂不关联</option>{workspace.data.projects.map((project)=><option key={project.id} value={project.id}>{project.title}</option>)}</select></FormField><FormField label="所属目标"><select name="goalId" className="form-control"><option value="">暂不关联</option>{workspace.data.goals.map((goal)=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></FormField></div><FormField label="预期成果"><input name="expectedOutcome" className="form-control"/></FormField><FormField label="验收标准"><textarea name="acceptanceCriteria" className="form-control min-h-16 resize-y"/></FormField><SaveButton saving={workspace.saving} label="创建任务"/></form>} empty="还没有任务" count={workspace.data.tasks.length}>{workspace.data.tasks.map((task)=><article key={task.id} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-start gap-3"><button onClick={()=>void workspace.updateTaskStatus(task.id,task.status==='done'?'todo':'done')} className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',task.status==='done'?'border-emerald-500 bg-emerald-500 text-white':'border-slate-300 text-transparent')}><Check size={11}/></button><div className="min-w-0 flex-1"><h3 className={cn('truncate text-[11px] font-bold',task.status==='done'&&'line-through text-slate-400')}>{task.title}</h3><p className="mt-1 text-[8.5px] text-slate-400">{task.owner||'未指定负责人'} · {task.dueDate||'未设置期限'} · {task.priority}</p>{task.expectedOutcome&&<p className="mt-2 text-[9px] text-slate-500">预期成果：{task.expectedOutcome}</p>}<SourceLine label={task.sources[0]?.label}/></div><select aria-label="任务状态" value={task.status} onChange={(event)=>void workspace.updateTaskStatus(task.id,event.target.value as typeof task.status)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[8.5px]"><option value="todo">待开始</option><option value="in_progress">进行中</option><option value="blocked">受阻</option><option value="done">已完成</option><option value="cancelled">已取消</option></select></div></article>)}</BusinessPage>
}

function OutcomePage({workspace}:{workspace:WorkspaceHook}): React.JSX.Element {
  const submit = (event:FormEvent<HTMLFormElement>):void => {
    event.preventDefault(); const form=event.currentTarget; const values=new FormData(form)
    void workspace.createOutcome({title:values.get('title'),description:values.get('description'),kind:values.get('kind'),goalId:values.get('goalId'),taskId:values.get('taskId'),value:numberOrEmpty(values.get('value')),unit:values.get('unit'),evidence:values.get('evidence')}).then(()=>form.reset()).catch(()=>undefined)
  }
  return <BusinessPage title="成果中心" subtitle="成果独立于任务完成状态，并可关联目标、任务和证明材料。" loading={workspace.loading} saving={workspace.saving} error={workspace.error} form={<form onSubmit={submit} className="space-y-3"><FormField label="成果名称"><input name="title" required className="form-control"/></FormField><FormField label="说明"><textarea name="description" className="form-control min-h-16 resize-y"/></FormField><div className="grid grid-cols-2 gap-3"><FormField label="成果类型"><select name="kind" className="form-control"><option value="deliverable">交付物</option><option value="metric">数据改善</option><option value="validation">验证结论</option><option value="business">业务结果</option></select></FormField><FormField label="关联目标"><select name="goalId" className="form-control"><option value="">暂不关联</option>{workspace.data.goals.map((goal)=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></FormField><FormField label="关联任务"><select name="taskId" className="form-control"><option value="">暂不关联</option>{workspace.data.tasks.map((task)=><option key={task.id} value={task.id}>{task.title}</option>)}</select></FormField><div className="grid grid-cols-[1fr_.8fr] gap-2"><FormField label="成果数值"><input name="value" type="number" step="any" className="form-control"/></FormField><FormField label="单位"><input name="unit" className="form-control"/></FormField></div></div><FormField label="证明材料说明"><textarea name="evidence" className="form-control min-h-16 resize-y" placeholder="描述证明材料；文件关联将在下一阶段接入"/></FormField><SaveButton saving={workspace.saving} label="登记成果"/></form>} empty="还没有登记成果" count={workspace.data.outcomes.length}>{workspace.data.outcomes.map((outcome)=><article key={outcome.id} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-[11px] font-bold">{outcome.title}</h3><p className="mt-1 text-[8.5px] text-slate-400">{outcome.kind}</p></div>{outcome.value!==null&&<strong className="shrink-0 text-[15px] text-violet-600">{outcome.value} {outcome.unit}</strong>}<select aria-label="成果状态" value={outcome.status} onChange={(event)=>void workspace.updateOutcomeStatus(outcome.id,event.target.value as typeof outcome.status)} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[8.5px]"><option value="draft">草稿</option><option value="pending_review">待审核</option><option value="accepted">已确认</option><option value="rejected">已拒绝</option></select></div>{outcome.evidence&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-[9px] text-slate-500">证明：{outcome.evidence}</p>}<SourceLine label={outcome.sources[0]?.label}/></article>)}</BusinessPage>
}

function BusinessPage({title,subtitle,loading,saving,error,form,empty,count,children}:{title:string;subtitle:string;loading:boolean;saving:boolean;error:string|null;form:React.ReactNode;empty:string;count:number;children:React.ReactNode}):React.JSX.Element {
  return <div className="mx-auto max-w-[1100px]"><div className="mb-5"><h1 className="text-[22px] font-bold">{title}</h1><p className="mt-1.5 text-[10px] text-slate-400">{subtitle}</p></div>{error&&<div className="mb-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[9px] text-red-600"><AlertTriangle size={13}/>{error}</div>}<div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5"><section><div className="mb-3 flex items-center justify-between"><h2 className="text-[12px] font-bold">全部记录</h2><span className="text-[9px] text-slate-400">{count} 条</span></div>{loading?<div className="grid min-h-40 place-items-center rounded-2xl bg-white"><LoaderCircle className="animate-spin text-violet-500" size={20}/></div>:count?<div className="space-y-3">{children}</div>:<div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white text-[10px] text-slate-400">{empty}</div>}</section><aside className={cn('rounded-2xl border border-slate-100 bg-white p-4 shadow-sm',saving&&'pointer-events-none opacity-70')}><h2 className="mb-4 text-[12px] font-bold">快速创建</h2>{form}</aside></div></div>
}

function FormField({label,children}:{label:string;children:React.ReactNode}):React.JSX.Element { return <label className="block"><span className="mb-1.5 block text-[8.5px] font-semibold text-slate-500">{label}</span>{children}</label> }
function SaveButton({saving,label}:{saving:boolean;label:string}):React.JSX.Element { return <Button type="submit" disabled={saving} className="mt-1 h-9 w-full rounded-xl text-[10px]">{saving?<LoaderCircle size={13} className="animate-spin"/>:<Plus size={13}/>} {saving?'正在保存…':label}</Button> }
function StatusBadge({label}:{label:string}):React.JSX.Element { return <span className="rounded-lg bg-violet-50 px-2 py-1 text-[8px] font-semibold text-violet-600">{label}</span> }
function Metric({label,value}:{label:string;value:number|null}):React.JSX.Element { return <div><span className="block text-[8px] text-slate-400">{label}</span><strong className="mt-1 block text-[11px]">{value??'—'}</strong></div> }
function SourceLine({label}:{label?:string}):React.JSX.Element { return <p className="mt-3 flex items-center gap-1 text-[8px] text-slate-400"><ShieldCheck size={10}/>来源：{label||'未标注'}</p> }
function numberOrEmpty(value:FormDataEntryValue|null):number|string { return typeof value==='string'&&value.trim()!==''?Number(value):'' }

function SettingsPage({core}:{core:ReturnType<typeof useWorkMuseCore>}): React.JSX.Element {
  const defaults:CoreSettings = {baseUrl:'',semanticModel:'',embeddingModel:'',transcriptionModel:'',allowCloud:false,hasApiKey:false}
  const [settings,setSettings] = useState<CoreSettings>(defaults)
  const [apiKey,setApiKey] = useState('')
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState<{tone:'success'|'error';text:string}|null>(null)
  useEffect(() => {
    if(!window.workmuseCore) { setLoading(false); setMessage({tone:'error',text:'浏览器预览无法读取 Electron Core 设置。'}); return }
    void window.workmuseCore.getSettings().then((value)=>{if(value)setSettings(value)}).catch((error)=>setMessage({tone:'error',text:error instanceof Error?error.message:String(error)})).finally(()=>setLoading(false))
  },[])
  const save = async (event:FormEvent):Promise<void> => {
    event.preventDefault(); if(!window.workmuseCore)return
    setSaving(true); setMessage(null)
    try {
      const updated = await window.workmuseCore.updateSettings({...settings,apiKey:apiKey||undefined})
      setSettings(updated); setApiKey(''); setMessage({tone:'success',text:'Core 设置已保存，后台 Worker 已使用新配置重新启动。'}); await core.refresh()
    } catch(error) { setMessage({tone:'error',text:error instanceof Error?error.message:String(error)}) }
    finally { setSaving(false) }
  }
  const clearKey = async ():Promise<void> => {
    if(!window.workmuseCore)return
    setSaving(true); setMessage(null)
    try { const updated=await window.workmuseCore.updateSettings({...settings,clearApiKey:true}); setSettings(updated); setApiKey(''); setMessage({tone:'success',text:'API Key 已从系统加密存储中移除。'}); await core.refresh() }
    catch(error){setMessage({tone:'error',text:error instanceof Error?error.message:String(error)})}
    finally{setSaving(false)}
  }
  return <div className="mx-auto max-w-[900px]"><header className="mb-6"><p className="mb-1 text-[9px] font-semibold uppercase tracking-[.15em] text-violet-600">团队与设置</p><h1 className="text-[24px] font-bold tracking-[-.04em]">Core 与 AI 配置</h1><p className="mt-2 text-[10px] text-slate-400">配置本地或兼容模型服务。云端处理默认关闭，密钥不会暴露给 Renderer。</p></header>
    <div className="grid grid-cols-[1fr_240px] gap-5"><form onSubmit={(event)=>void save(event)} className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4"><div><h2 className="text-[12px] font-bold">模型服务</h2><p className="mt-1 text-[8.5px] text-slate-400">支持 OpenAI 兼容端点；localhost 可使用 HTTP。</p></div><span className={cn('rounded-lg px-2 py-1 text-[8px] font-medium',core.status?.available?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700')}>{core.status?.available?'Core 已连接':'Core 不可用'}</span></div>
      {loading?<LoadingRows/>:<div className="space-y-4"><SettingInput label="服务地址" value={settings.baseUrl} placeholder="https://api.example.com/v1" onChange={(value)=>setSettings({...settings,baseUrl:value})}/><div className="grid grid-cols-2 gap-3"><SettingInput label="语义模型" value={settings.semanticModel} placeholder="模型名称" onChange={(value)=>setSettings({...settings,semanticModel:value})}/><SettingInput label="嵌入模型" value={settings.embeddingModel} placeholder="嵌入模型名称" onChange={(value)=>setSettings({...settings,embeddingModel:value})}/></div><SettingInput label="转写模型" value={settings.transcriptionModel} placeholder="音视频转写模型" onChange={(value)=>setSettings({...settings,transcriptionModel:value})}/><div><label className="mb-1.5 block text-[9px] font-semibold text-slate-600">API Key</label><div className="flex gap-2"><input type="password" autoComplete="new-password" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-[10px] outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50" placeholder={settings.hasApiKey?'已安全保存；留空表示不修改':'输入后将由操作系统加密保存'}/>{settings.hasApiKey&&<Button type="button" onClick={()=>void clearKey()} variant="secondary" className="h-10 text-[9px]">移除密钥</Button>}</div></div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><input type="checkbox" checked={settings.allowCloud} onChange={(e)=>setSettings({...settings,allowCloud:e.target.checked})} className="mt-0.5 size-4 accent-violet-600"/><span><span className="block text-[10px] font-semibold">允许将明确选择的材料发送到云端模型</span><span className="mt-1 block text-[8.5px] leading-4 text-slate-400">关闭时，远程语义、视觉、嵌入和转写请求都会被拒绝；本地端点不受影响。</span></span></label>
        {message&&<div className={cn('rounded-xl border p-3 text-[9px]',message.tone==='success'?'border-emerald-100 bg-emerald-50 text-emerald-700':'border-red-100 bg-red-50 text-red-700')}>{message.text}</div>}
        <div className="flex justify-end"><Button type="submit" disabled={saving} className="h-9 text-[9px]">{saving?<><LoaderCircle size={13} className="animate-spin"/>正在保存</>:<>保存并重启 Core<RefreshCw size={13}/></>}</Button></div></div>}
    </form><aside className="space-y-3"><div className="rounded-2xl border border-slate-100 bg-white p-4"><span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={15}/></span><h3 className="mt-3 text-[10px] font-semibold">密钥安全边界</h3><p className="mt-2 text-[8.5px] leading-4 text-slate-400">API Key 使用 Electron `safeStorage` 加密。UI 只能知道是否已保存，无法读取原值。</p></div><div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4"><h3 className="text-[10px] font-semibold text-violet-800">本地优先</h3><p className="mt-2 text-[8.5px] leading-4 text-violet-600">未配置服务时，文件解析、全文索引、搜索和证据上下文仍可在本地运行。</p></div></aside></div>
  </div>
}

function SettingInput({label,value,placeholder,onChange}:{label:string;value:string;placeholder:string;onChange:(value:string)=>void}):React.JSX.Element { return <label className="block"><span className="mb-1.5 block text-[9px] font-semibold text-slate-600">{label}</span><input value={value} onChange={(e)=>onChange(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[10px] outline-none placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-50" placeholder={placeholder}/></label> }

function AiAssistantPage({core,workspace}:{core:ReturnType<typeof useWorkMuseCore>;workspace:WorkspaceHook}): React.JSX.Element {
  const [question,setQuestion] = useState('')
  const [answeredQuestion,setAnsweredQuestion] = useState('')
  const [answer,setAnswer] = useState<QuestionAnswer|null>(null)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState<string|null>(null)
  const ask = async (event:FormEvent):Promise<void> => {
    event.preventDefault()
    if(!question.trim()) return
    setLoading(true); setError(null); setAnswer(null)
    try { const prompt=question.trim(); setAnswer(await core.answer(prompt)); setAnsweredQuestion(prompt) }
    catch(error) { setError(error instanceof Error?error.message:String(error)) }
    finally { setLoading(false) }
  }
  return <div className="mx-auto flex min-h-full max-w-[980px] flex-col">
    <header className="mb-6"><p className="mb-1 text-[9px] font-semibold uppercase tracking-[.15em] text-violet-600">可追溯 AI 助手</p><h1 className="text-[24px] font-bold tracking-[-.04em]">基于你的工作材料提问</h1><p className="mt-2 text-[10px] text-slate-400">回答只使用当前本地资料库；关键结论附带可打开的原始来源。</p></header>
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_260px] gap-4">
      <section className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{loading?<div className="grid h-full place-items-center text-center"><div><LoaderCircle size={24} className="mx-auto animate-spin text-violet-600"/><p className="mt-3 text-[10px] text-slate-500">正在检索材料并核对依据…</p></div></div>:error?<ErrorState message={error}/>:!answer?<div className="grid h-full place-items-center text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Bot size={23}/></span><h2 className="mt-4 text-[13px] font-semibold">从一个工作问题开始</h2><p className="mt-2 text-[9px] leading-5 text-slate-400">例如：“这项任务在哪次会议中确定？”<br/>或“材料中有哪些关于激活率的观点？”</p></div></div>:<AnswerView answer={answer} question={answeredQuestion} workspace={workspace}/>}</div>
        <form onSubmit={(event)=>void ask(event)} className="shrink-0 border-t border-slate-100 p-4"><div className="rounded-2xl border border-slate-200 p-2 focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-50"><textarea value={question} onChange={(e)=>setQuestion(e.target.value)} rows={3} className="w-full resize-none bg-transparent px-2 py-1 text-[10.5px] leading-5 outline-none placeholder:text-slate-300" placeholder="输入问题，WorkMuse 会搜索有权限的本地材料…"/><div className="flex items-center justify-between"><span className="flex items-center gap-1 px-2 text-[8px] text-slate-400"><ShieldCheck size={11}/>默认仅本地处理</span><Button type="submit" disabled={loading||!question.trim()} className="h-8 px-3 text-[9px]">提问<ArrowRight size={12}/></Button></div></div></form>
      </section>
      <aside className="space-y-3"><div className={cn('rounded-2xl border p-4',core.status?.available?'border-emerald-100 bg-emerald-50/50':'border-amber-100 bg-amber-50/50')}><div className="flex items-center gap-2 text-[10px] font-semibold">{core.status?.available?<Database size={14} className="text-emerald-600"/>:<WifiOff size={14} className="text-amber-600"/>}资料范围</div><p className="mt-2 text-[8.5px] leading-4 text-slate-500">{core.status?.available?`${core.jobs.filter(j=>j.status==='succeeded'&&j.method==='resources.understand').length} 份已处理资料可用于检索`:'Core 当前不可用，无法访问本地资料。'}</p></div><div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="text-[9px] font-semibold text-slate-600">回答标识</p><div className="mt-3 space-y-2 text-[8.5px] text-slate-500"><p><span className="mr-2 rounded bg-blue-50 px-1.5 py-1 text-blue-600">原始事实</span>来自材料原文</p><p><span className="mr-2 rounded bg-violet-50 px-1.5 py-1 text-violet-600">AI 回答</span>模型综合判断</p><p><span className="mr-2 rounded bg-amber-50 px-1.5 py-1 text-amber-600">待确认</span>模型不可用或依据不足</p></div></div></aside>
    </div>
  </div>
}

function AnswerView({answer,question,workspace}:{answer:QuestionAnswer;question:string;workspace:WorkspaceHook}):React.JSX.Element {
  const answered = answer.status === 'answered' && answer.answer
  const [created,setCreated]=useState(false)
  const createTask = async ():Promise<void> => {
    const resourceSources=answer.context.blocks.slice(0,10).map((block)=>({kind:'resource',id:block.resourceId,label:block.title??'原始材料',evidenceBlockId:block.blockId}))
    await workspace.createTask({title:question.slice(0,120),description:answer.answer??question,expectedOutcome:'确认并落实该问题对应的行动',sources:[{kind:'ai-suggestion',label:`AI 问答：${question}`},...resourceSources]})
    setCreated(true)
  }
  return <div><div className="mb-4 flex items-center justify-between"><span className={cn('rounded-lg px-2 py-1 text-[8px] font-semibold',answered?'bg-violet-50 text-violet-600':'bg-amber-50 text-amber-700')}>{answered?'AI 回答':'待确认信息'}</span><span className="text-[8px] text-slate-400">{answer.citations.length} 条引用{answer.model?` · ${answer.model}`:''}</span></div><div className="rounded-2xl bg-slate-50 p-4"><p className="whitespace-pre-wrap text-[10.5px] leading-6 text-slate-700">{answer.answer??answer.message??'当前没有可用模型；下面仍提供本地检索到的原始证据。'}</p>{answer.context.blocks.length>0&&<button onClick={()=>void createTask().catch(()=>undefined)} disabled={workspace.saving||created} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-[8.5px] font-semibold text-white disabled:opacity-50"><ListTodo size={11}/>{created?'已创建待办任务':workspace.saving?'正在创建…':'转为待办任务'}</button>}</div><div className="mt-5"><h3 className="text-[10px] font-semibold">原始事实与来源</h3><div className="mt-3 space-y-2">{answer.context.blocks.length===0?<EmptyState title="没有找到证据" detail="请导入相关材料或调整问题。"/>:answer.context.blocks.map((block)=><article key={`${block.resourceId}:${block.blockId}`} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-[8px] text-slate-400"><span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-600">原始事实</span><span className="truncate">{block.title??'未命名资料'}</span><span className="ml-auto">{formatLocation(block.location)}</span></div><p className="mt-3 line-clamp-4 text-[9.5px] leading-5 text-slate-600">{block.text}</p><button onClick={() => void window.workmuseCore?.openSource(block.resourceId)} className="mt-3 text-[8.5px] font-medium text-violet-600">打开原材料 →</button></article>)}</div></div></div>
}

function FileCabinet({core,workspace}:{core:ReturnType<typeof useWorkMuseCore>;workspace:WorkspaceHook}): React.JSX.Element {
  const statusLabel = core.loading ? '正在连接' : core.status?.available ? 'Core 已连接' : '离线或不可用'
  const successful = core.jobs.filter((job) => job.status === 'succeeded' && job.method === 'resources.understand')
  const activeJobs = core.jobs.filter((job) => job.status === 'queued' || job.status === 'running')
  const extractedActions = successful.flatMap((job) => {
    const result = completedResource(job)
    return result ? result.content.semantics.actionItems.map((action) => ({ action, resource: result.content.resource, title: result.content.title ?? result.content.resource.fileName })) : []
  })
  const jobMetrics = [
    { value: successful.length, label: '已处理资料', Icon: CheckCircle2, tone: 'emerald' },
    { value: activeJobs.length, label: '处理中', Icon: LoaderCircle, tone: 'violet' },
    { value: core.jobs.filter((job) => job.status === 'failed' || job.status === 'interrupted').length, label: '需要处理', Icon: AlertTriangle, tone: 'amber' }
  ]
  return <div className="mx-auto max-w-[1080px]">
    <header className="mb-6 flex items-start justify-between gap-5"><div><p className="mb-1 text-[9px] font-semibold uppercase tracking-[.15em] text-violet-600">智能文件柜</p><h1 className="text-[24px] font-bold tracking-[-.04em]">资料与处理任务</h1><p className="mt-2 text-[10px] text-slate-400">导入本地材料，自动解析、建立索引并保留原始来源。</p></div><Button onClick={() => void core.importResource()} disabled={core.importing || !core.status?.available} className="h-10 text-[10px]">{core.importing?<><LoaderCircle size={14} className="animate-spin"/>正在导入</>:<><Upload size={14}/>上传材料</>}</Button></header>

    <section className={cn('mb-5 flex items-center gap-3 rounded-2xl border p-4',core.status?.available?'border-emerald-100 bg-emerald-50/50':'border-amber-100 bg-amber-50/50')}>
      <span className={cn('grid size-9 place-items-center rounded-xl',core.status?.available?'bg-emerald-100 text-emerald-600':'bg-amber-100 text-amber-600')}>{core.loading?<LoaderCircle size={16} className="animate-spin"/>:core.status?.available?<Database size={16}/>:<WifiOff size={16}/>}</span>
      <div className="min-w-0 flex-1"><p className="text-[10.5px] font-semibold">{statusLabel}</p><p className="mt-1 truncate text-[8.5px] text-slate-500">{core.status?.available?'所有资料默认在本机解析和索引；云端处理仅在设置中明确允许后启用。':core.error ?? core.status?.error ?? '无法读取 Core 状态'}</p></div><button onClick={() => void core.refresh()} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-violet-600" title="刷新状态"><RefreshCw size={14}/></button>
    </section>

    {core.lastImport && <section className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-violet-100 text-violet-600"><CheckCircle2 size={16}/></span><div className="min-w-0 flex-1"><p className="text-[10.5px] font-semibold">已导入：{core.lastImport.asset.originalName}</p><p className="mt-1 text-[8.5px] text-slate-500">{core.lastImport.processing ? `已索引 ${core.lastImport.processing.index?.indexedBlocks ?? core.lastImport.processing.content.blocks.length} 个内容块` : core.lastImport.error ?? '文件已保存，等待 Core 恢复后处理'}</p></div></div></section>}

    <div className="mb-3 grid grid-cols-3 gap-3">{jobMetrics.map(({value,label,Icon,tone}) => <article key={label} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between"><div><strong className="text-xl">{value}</strong><p className="mt-1 text-[9px] text-slate-400">{label}</p></div><span className={cn('grid size-8 place-items-center rounded-xl',toneClass[tone])}><Icon size={15} className={label==='处理中'&&value>0?'animate-spin':''}/></span></div></article>)}</div>

    {extractedActions.length>0&&<section className="mb-5"><div className="mb-3"><h2 className="text-[13px] font-bold">材料中的行动项</h2><p className="mt-1 text-[8.5px] text-slate-400">AI 提取结果，创建任务前请确认；任务会保留原始证据块。</p></div><div className="space-y-2">{extractedActions.slice(0,10).map(({action,resource,title})=>{const evidence=action.evidence[0];const created=evidence?workspace.data.tasks.some((task)=>task.sources.some((source)=>source.id===resource.id&&source.evidenceBlockId===evidence.blockId)):false;const dueDate=action.dueDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]??'';const create=():void=>{void workspace.createTask({title:action.text,owner:action.assignee??'',dueDate,expectedOutcome:action.text,sources:[{kind:'resource',id:resource.id,label:title,evidenceBlockId:evidence?.blockId}]}).catch(()=>undefined)};return <article key={`${resource.id}:${action.id}`} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><ClipboardCheck size={14}/></span><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-slate-700">{action.text}</p><p className="mt-1.5 text-[8px] text-slate-400">AI 提取 · 来源：{title}{action.assignee?` · 负责人 ${action.assignee}`:''}{dueDate?` · ${dueDate}`:''}</p></div><button onClick={create} disabled={created||workspace.saving} className="shrink-0 rounded-lg bg-violet-50 px-2.5 py-2 text-[8.5px] font-semibold text-violet-600 disabled:text-slate-400">{created?'已创建任务':'确认并创建任务'}</button></article>})}</div></section>}

    <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-[13px] font-bold">最近处理任务</h2><p className="mt-1 text-[8.5px] text-slate-400">任务状态来自本地 Worker，失败任务保留原因并可安全重试。</p></div></div>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">{core.loading?<LoadingRows/>:core.jobs.length===0?<EmptyState/>:core.jobs.slice(0,12).map((job,index) => <div key={job.id} className={cn('flex items-center gap-3 px-4 py-3.5',index<Math.min(core.jobs.length,12)-1&&'border-b border-slate-100')}><span className={cn('grid size-8 place-items-center rounded-xl',job.status==='succeeded'?'bg-emerald-50 text-emerald-600':job.status==='failed'||job.status==='interrupted'?'bg-red-50 text-red-600':'bg-violet-50 text-violet-600')}>{job.status==='succeeded'?<CheckCircle2 size={14}/>:job.status==='failed'||job.status==='interrupted'?<AlertTriangle size={14}/>:<LoaderCircle size={14} className="animate-spin"/>}</span><div className="min-w-0 flex-1"><p className="truncate text-[10.5px] font-medium">{job.method==='resources.understand'?'资料理解与索引':job.method}</p><p className="mt-1 text-[8px] text-slate-400">{new Date(job.updatedAt).toLocaleString()} · {job.error?.message ?? job.status}</p></div>{(job.status==='failed'||job.status==='interrupted')&&<button onClick={() => void window.workmuseCore?.retryJob(job.id).then(() => core.refresh())} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[8.5px] font-medium text-violet-600 hover:bg-violet-50"><RotateCcw size={11}/>重试</button>}</div>)}</div>
    </section>
  </div>
}

function SearchDialog({onClose,onSearch}:{onClose:()=>void;onSearch:(query:string)=>Promise<SearchResult[]>}): React.JSX.Element {
  const [query,setQuery] = useState('')
  const [results,setResults] = useState<SearchResult[]>([])
  const [loading,setLoading] = useState(false)
  const [searched,setSearched] = useState(false)
  const [error,setError] = useState<string|null>(null)
  const runSearch = async (event:FormEvent):Promise<void> => {
    event.preventDefault()
    if(!query.trim()) return
    setLoading(true)
    setError(null)
    try { setResults(await onSearch(query.trim())); setSearched(true) }
    catch(error) { setError(error instanceof Error?error.message:String(error)) }
    finally { setLoading(false) }
  }
  return <div className="fixed inset-0 z-[100] flex justify-center bg-slate-950/30 p-5 pt-[8vh] backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="全局搜索" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="flex max-h-[78vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[22px] border border-white bg-white shadow-[0_30px_100px_rgba(20,25,45,.3)]">
      <form onSubmit={(event)=>void runSearch(event)} className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-5"><Search size={18} className="text-violet-600"/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} className="min-w-0 flex-1 text-[13px] outline-none placeholder:text-slate-300" placeholder="搜索文件内容、会议观点或原始证据……"/><kbd className="rounded-md bg-slate-100 px-2 py-1 text-[8px] text-slate-400">Enter 搜索</kbd><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={15}/></button></form>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{loading?<LoadingRows/>:error?<ErrorState message={error}/>:!searched?<div className="grid min-h-[300px] place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><FileSearch size={20}/></span><h3 className="mt-4 text-[12px] font-semibold">搜索已导入的工作材料</h3><p className="mt-2 text-[9px] leading-5 text-slate-400">结果会显示原文片段、来源文件与页码、段落或时间位置。</p></div></div>:results.length===0?<EmptyState title="没有找到匹配内容" detail="尝试更换关键词，或先在文件柜导入相关资料。"/>:<div className="space-y-2">{results.map((result)=><article key={`${result.resourceId}:${result.blockId}`} className="rounded-2xl border border-slate-100 p-4 hover:border-violet-200"><div className="flex items-center gap-2 text-[8px] text-slate-400"><span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-600">原始材料</span><span className="truncate">{result.title??'未命名资料'}</span><span className="ml-auto shrink-0">相关度 {Math.round(result.score*100)}%</span></div><p className="mt-3 text-[10.5px] leading-5 text-slate-700">{result.text}</p><div className="mt-3 flex items-center justify-between text-[8px] text-slate-400"><span>{formatLocation(result.location)}</span><button onClick={() => void window.workmuseCore?.openSource(result.resourceId)} className="font-medium text-violet-600">打开原材料 →</button></div></article>)}</div>}</div>
    </section>
  </div>
}

function formatLocation(location:SearchResult['location']):string { if(location.kind==='page')return `第 ${location.page} 页`; if(location.kind==='time')return `${Math.floor(location.startMs/60000)}:${String(Math.floor(location.startMs/1000)%60).padStart(2,'0')}`; if(location.kind==='text')return `字符 ${location.start}–${location.end}`; return '资料级来源' }
function LoadingRows():React.JSX.Element { return <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100"/>)}</div> }
function EmptyState({title='暂无处理任务',detail='上传第一份材料后，解析和索引进度会显示在这里。'}:{title?:string;detail?:string}):React.JSX.Element { return <div className="grid min-h-[210px] place-items-center text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Archive size={18}/></span><p className="mt-3 text-[10.5px] font-semibold">{title}</p><p className="mt-1.5 text-[8.5px] text-slate-400">{detail}</p></div></div> }
function ErrorState({message}:{message:string}):React.JSX.Element { return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-[9px] text-red-700"><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={14}/>操作失败</div><p className="mt-2 leading-5">{message}</p></div> }

function HelpDialog({onClose}:{onClose:()=>void}):React.JSX.Element { return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/25 p-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="帮助与功能说明" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose()}}><section className="w-full max-w-[520px] rounded-[22px] border border-white bg-white p-5 shadow-[0_28px_90px_rgba(25,30,50,.24)]"><div className="flex items-start justify-between"><div><h2 className="text-[14px] font-bold">WorkMuse 使用说明</h2><p className="mt-1 text-[9px] text-slate-400">本地优先、来源可追溯的工作闭环</p></div><button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={15}/></button></div><div className="mt-5 grid grid-cols-2 gap-3">{[[Upload,'导入资料','在文件柜上传材料，Core 会解析、索引并保留原文。'],[Search,'搜索溯源','按 Ctrl/⌘ + K 搜索，结果可直接打开原材料。'],[Bot,'AI 问答','AI 回答与原始事实分开显示，回答可带证据转任务。'],[Target,'执行闭环','目标、任务和成果分别记录，差距显示计算依据。']].map(([Icon,title,detail])=><div key={title as string} className="rounded-2xl bg-slate-50 p-4"><Icon size={15} className="text-violet-600"/><h3 className="mt-3 text-[10px] font-semibold">{title as string}</h3><p className="mt-1.5 text-[8.5px] leading-4 text-slate-400">{detail as string}</p></div>)}</div><div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[8.5px] leading-4 text-amber-700">当前为单机私有工作区。微信、企业 SSO、团队共享和远程权限尚未启用；界面不会模拟这些能力。</div></section></div> }

function UpdateDialog({version,state,onClose,onCheck,onInstall}:{version:string;state:{status:string;message:string;percent?:number};onClose:()=>void;onCheck:()=>void;onInstall:()=>void}): React.JSX.Element {
  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'available' || state.status === 'protecting'
  const completed = state.status === 'downloaded' || state.status === 'not-available'
  const Icon = state.status === 'downloading' ? Download : busy ? LoaderCircle : completed ? CheckCircle2 : state.status === 'error' || state.status === 'disabled' ? AlertTriangle : RefreshCw
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/25 p-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="update-title" onMouseDown={(event) => {if(event.target===event.currentTarget) onClose()}}>
    <section className="w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white bg-white shadow-[0_28px_90px_rgba(25,30,50,.24)]">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-violet-100 text-violet-600"><RefreshCw size={16}/></span><div><h2 id="update-title" className="text-[12px] font-bold">WorkMuse 更新</h2><p className="mt-0.5 text-[8.5px] text-slate-400">保持应用安全、稳定并获得最新功能</p></div></div><button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15}/></button></header>
      <div className="p-5">
        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-200"><Sparkles size={20}/></div><div className="min-w-0 flex-1"><p className="text-[9px] text-slate-400">当前版本</p><p className="mt-1 text-[15px] font-bold">WorkMuse <span className="text-violet-600">v{version}</span></p><span className="mt-1 inline-flex items-center gap-1 text-[8px] text-emerald-600"><ShieldCheck size={10}/>自动验证安装包完整性</span></div></div>
        <div className={cn('relative overflow-hidden rounded-2xl border p-4',state.status==='error'||state.status==='disabled'?'border-amber-100 bg-amber-50/50':completed?'border-emerald-100 bg-emerald-50/40':'border-violet-100 bg-violet-50/40')}>
          <div className="flex items-start gap-3"><span className={cn('grid size-8 shrink-0 place-items-center rounded-xl',state.status==='error'||state.status==='disabled'?'bg-amber-100 text-amber-600':completed?'bg-emerald-100 text-emerald-600':'bg-violet-100 text-violet-600')}><Icon size={15} className={busy?'animate-spin':''}/></span><div className="min-w-0 flex-1"><p className="text-[10.5px] font-semibold text-slate-700">{state.message}</p><p className="mt-1.5 text-[8.5px] leading-4 text-slate-400">{state.status==='disabled'?'开发模式不会连接远程更新服务，请安装正式打包版本后测试。':state.status==='downloaded'?'更新已安全下载；点击安装后会先创建本地数据快照。':state.status==='protecting'?'正在停止后台写入并校验备份，完成前不会修改当前版本。':state.status==='downloading'?'下载将在后台进行，你可以继续使用 WorkMuse。':'检查过程不会上传你的工作数据。'}</p></div>{state.status==='downloading'&&<span className="text-[10px] font-bold text-violet-600">{Math.round(state.percent??0)}%</span>}</div>
          {state.status==='downloading'&&<div className="absolute inset-x-0 bottom-0 h-1 bg-violet-100"><div className="h-full rounded-r-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-[width]" style={{width:`${state.percent??0}%`}}/></div>}
        </div>
        <div className="mt-5 flex gap-2"><Button onClick={onClose} variant="secondary" className="flex-1 text-[10px]">稍后处理</Button>{state.status==='downloaded'?<Button onClick={onInstall} className="flex-[1.25] text-[10px]">重启并安装<ArrowRight size={13}/></Button>:<Button onClick={onCheck} disabled={busy} className="flex-[1.25] text-[10px]">{busy?<><LoaderCircle size={13} className="animate-spin"/>正在检查</>:<><RefreshCw size={13}/>检查更新</>}</Button>}</div>
        <p className="mt-4 text-center text-[8px] text-slate-300">安装前会备份并校验数据库、文件库与设置；失败时不会安装</p>
      </div>
    </section>
  </div>
}

function LoginScreen({configured,onLogin}:{configured:boolean;onLogin:(input:{email:string;password:string})=>Promise<void>}): React.JSX.Element {
  const [loginMode, setLoginMode] = useState<'email'|'wechat'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!email.trim()) { setError('请输入工作邮箱'); return }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('请输入有效的邮箱地址'); return }
    if (password.length < 8) { setError('密码至少需要 8 个字符'); return }
    setError('')
    setSubmitting(true)
    try { await onLogin({email:email.trim(),password}) }
    catch(reason) { setError(reason instanceof Error?reason.message:String(reason)); setSubmitting(false) }
  }

  return <main className="login-shell grid min-h-0 min-w-0 overflow-hidden bg-white">
    <section className="login-brand relative flex min-h-0 flex-col overflow-hidden bg-[#111327] p-10 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70"><div className="absolute -left-24 top-[18%] size-72 rounded-full bg-violet-600/30 blur-[90px]"/><div className="absolute -bottom-24 right-[-10%] size-80 rounded-full bg-indigo-500/25 blur-[100px]"/><div className="login-grid absolute inset-0"/></div>
      <div className="relative z-10 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-[13px] bg-gradient-to-br from-violet-500 to-indigo-400 shadow-lg shadow-violet-950"><Sparkles size={18}/></div><div><div className="text-[15px] font-bold">WorkMuse</div><div className="text-[9px] text-slate-400">可追溯 AI 工作台</div></div></div>
      <div className="relative z-10 my-auto max-w-[460px]"><span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[9px] text-violet-200"><Sparkles size={12}/>专业工作台 · 智能文件柜 · 可追溯 AI</span><h1 className="text-[34px] font-bold leading-[1.25] tracking-[-.045em]">让每一份信息，<br/>都成为下一步行动。</h1><p className="mt-5 max-w-[400px] text-[12px] leading-6 text-slate-400">连接会议、材料、目标、任务与成果，在一个安静、可靠的工作空间中持续推进真正重要的事情。</p>
        <div className="mt-9 grid max-w-[430px] grid-cols-3 gap-3">{[[Files,'材料可追溯'],[Target,'目标看得清'],[WandSparkles,'建议能执行']].map(([Icon,label]) => <div key={label as string} className="rounded-2xl border border-white/[.07] bg-white/[.04] p-3"><Icon size={16} className="mb-3 text-violet-300"/><span className="text-[9px] text-slate-300">{label as string}</span></div>)}</div>
      </div>
      <div className="relative z-10 flex items-center gap-2 text-[9px] text-slate-500"><ShieldCheck size={13}/>你的工作数据将在安全的工作空间中受到保护</div>
    </section>

    <section className="login-form-panel flex min-h-0 items-center justify-center overflow-y-auto bg-[#fbfbfd] px-8 py-7">
      <div className="w-full max-w-[380px]">
        <div className="mb-8"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-violet-600">{configured?'欢迎回来':'首次使用'}</p><h2 className="text-[25px] font-bold tracking-[-.04em] text-slate-900">{configured?'登录 WorkMuse':'创建本地账户'}</h2><p className="mt-2 text-[11px] text-slate-400">{configured?'验证本地账户后访问工作数据':'账户仅保存在本机，不会上传密码'}</p></div>
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setLoginMode('email')} className={cn('h-9 rounded-lg text-[10px] font-semibold transition',loginMode==='email'?'bg-white text-slate-900 shadow-sm':'text-slate-400 hover:text-slate-600')}><span className="inline-flex items-center gap-2"><LogIn size={13}/>邮箱登录</span></button><button type="button" onClick={() => setLoginMode('wechat')} className={cn('h-9 rounded-lg text-[10px] font-semibold transition',loginMode==='wechat'?'bg-white text-slate-900 shadow-sm':'text-slate-400 hover:text-slate-600')}><span className="inline-flex items-center gap-2"><Smartphone size={13}/>微信扫码</span></button></div>
        {loginMode === 'wechat' ? <div className="text-center">
          <div className="mx-auto grid size-[208px] place-items-center rounded-[22px] border border-dashed border-slate-300 bg-slate-50 text-slate-300"><div><Smartphone size={38} className="mx-auto"/><p className="mt-3 text-[9px]">二维码服务未配置</p></div></div>
          <h3 className="mt-5 text-[12px] font-semibold text-slate-800">微信扫码暂不可用</h3><p className="mt-2 text-[9px] leading-5 text-slate-400">需要微信开放平台 AppID、授权回调和服务端票据校验。<br/>WorkMuse 不会展示可伪造登录的演示二维码。</p>
          <div className="mt-5 rounded-xl bg-amber-50 px-3 py-2.5 text-[8.5px] text-amber-700"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={12}/>请先使用本地邮箱账户</span></div>
        </div> : <>
          <button type="button" disabled className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-400 opacity-70"><Building2 size={15}/>企业 SSO 尚未配置</button>
          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-slate-200"/><span className="text-[9px] text-slate-400">或使用工作邮箱</span><span className="h-px flex-1 bg-slate-200"/></div>
          <form onSubmit={submit} noValidate>
          <label className="mb-1.5 block text-[10px] font-semibold text-slate-600" htmlFor="email">工作邮箱</label>
          <div className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-50"><LogIn size={15} className="shrink-0 text-slate-400"/><input id="email" autoComplete="email" value={email} onChange={(e) => {setEmail(e.target.value);setError('')}} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-300" placeholder="name@company.com"/></div>
          <div className="mb-1.5 flex items-center justify-between"><label className="text-[10px] font-semibold text-slate-600" htmlFor="password">密码</label><span className="text-[8px] text-slate-400" title="本地账户没有远程找回服务">本地账户无法在线找回</span></div>
          <div className={cn('flex h-11 items-center gap-2 rounded-xl border bg-white px-3 transition focus-within:ring-4 focus-within:ring-violet-50',error ? 'border-red-300':'border-slate-200 focus-within:border-violet-400')}><LockKeyhole size={15} className="shrink-0 text-slate-400"/><input id="password" autoComplete="current-password" type={showPassword?'text':'password'} value={password} onChange={(e) => {setPassword(e.target.value);setError('')}} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-300" placeholder="输入密码"/><button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-slate-700" aria-label={showPassword?'隐藏密码':'显示密码'}>{showPassword?<EyeOff size={15}/>:<Eye size={15}/>}</button></div>
          <div className="mt-2 min-h-4">{error && <p role="alert" className="text-[9px] font-medium text-red-500">{error}</p>}</div>
          <div className="mb-5 mt-2 flex items-center justify-end"><span className="flex items-center gap-1 text-[8px] text-slate-400"><ShieldCheck size={11}/>密码使用 scrypt 加盐哈希保存</span></div>
          <Button type="submit" disabled={submitting} className="h-11 w-full text-[11px]">{submitting?'正在验证…':<>{configured?'登录并进入':'创建账户并进入'}<ArrowRight size={14}/></>}</Button>
          </form>
        </>}
        <p className="mt-8 text-center text-[8px] leading-4 text-slate-300">当前账户只保护本机工作区会话。<br/>微信与企业登录在配置真实身份服务后开放。</p>
      </div>
    </section>
  </main>
}

function SectionTitle({title,subtitle,action,onAction}:{title:string;subtitle:string;action:string;onAction?:()=>void}): React.JSX.Element {
  return <div className="mb-3 flex items-end justify-between"><div><h2 className="text-[13px] font-bold">{title}</h2><p className="mt-1 text-[8.5px] text-slate-400">{subtitle}</p></div><button onClick={onAction} className="text-[9px] font-medium text-violet-600 hover:text-violet-800">{action} →</button></div>
}

function AiCard({tone,title,text,meta,action}:{tone:string;title:string;text:string;meta:string;action:string}): React.JSX.Element {
  const icons = {red: AlertTriangle, violet: Sparkles, amber: Gauge}; const Icon = icons[tone as keyof typeof icons]
  return <article className="mt-3 rounded-2xl border border-slate-100 bg-white p-3.5"><div className="flex items-center gap-2 text-[10px] font-semibold"><span className={cn('grid size-6 place-items-center rounded-lg',toneClass[tone])}><Icon size={12}/></span>{title}</div><p className="mt-2.5 text-[9.5px] leading-[1.7] text-slate-600">{text}</p><p className="mt-2 text-[8px] text-slate-400">{meta}</p><button className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-[9px] font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">{action}</button></article>
}

function EmptyPage({title}:{title:string}): React.JSX.Element {
  return <div className="grid h-full place-items-center"><div className="max-w-sm text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-50 text-violet-600"><FilePlus2 size={23}/></div><h1 className="mt-4 text-lg font-bold">{title}</h1><p className="mt-2 text-[11px] leading-5 text-slate-400">页面骨架已接入统一导航与全局操作，将按 MVP 优先级继续实现详细内容。</p><Button className="mt-5 h-9 text-[10px]"><Plus size={14}/>创建{title}内容</Button></div></div>
}
