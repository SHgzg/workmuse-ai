import { useEffect, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  AlertTriangle, Archive, ArrowRight, Bell, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, FilePlus2, Files,
  Flag, FolderKanban, Gauge, Home, Lightbulb, ListTodo, Menu, MessageSquareText, MoreHorizontal,
  Download, Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, Plus, RefreshCw, Search, Settings, ShieldCheck, Smartphone, Sparkles, Target, Trophy, Upload, Users, WandSparkles, X
} from 'lucide-react'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'

const nav = [
  ['首页', Home], ['AI 助手', Bot], ['项目', FolderKanban], ['会议', CalendarDays],
  ['文件柜', Archive], ['目标', Target], ['任务', ListTodo], ['成果', Trophy],
  ['知识库', BookOpen], ['通知', Bell], ['团队与设置', Users]
] as const

const createItems = [
  ['记录灵感', Lightbulb], ['创建项目', FolderKanban], ['创建会议', CalendarDays],
  ['上传材料', Upload], ['创建目标', Target], ['创建任务', ListTodo], ['登记成果', Trophy]
] as const

const metrics = [
  { label: '进行中的目标', value: '6', note: '2 项进度落后', icon: Target, tone: 'violet' },
  { label: '今日任务', value: '8', note: '3 项高优先级', icon: ClipboardCheck, tone: 'blue' },
  { label: '待确认会议纪要', value: '3', note: '共 11 个行动项', icon: MessageSquareText, tone: 'amber' },
  { label: '风险项目', value: '2', note: '1 项严重偏离', icon: AlertTriangle, tone: 'red' },
  { label: '待处理 AI 建议', value: '5', note: '预计节省 3.5 小时', icon: Sparkles, tone: 'purple' }
]

const actions = [
  { time: '09:30', title: '产品增长周会', detail: '增长实验项目 · 6 位参与人', type: '会议', tone: 'blue' },
  { time: '11:00', title: '确认 Q3 路线图优先级', detail: '产品战略目标 · 今天到期', type: '任务', tone: 'violet' },
  { time: '14:30', title: '审核用户研究成果', detail: '访谈洞察报告 v2', type: '成果', tone: 'emerald' },
  { time: '16:00', title: '补充竞品分析数据', detail: '缺少近 30 天活跃数据', type: '材料', tone: 'amber' }
]

const goals = [
  { name: '提升新用户激活率', owner: 'Mishu', current: '38%', target: '45%', actual: 68, plan: 74, gap: '-7%', risk: '有风险', next: '优化新手引导第 3 步' },
  { name: '完成企业版 MVP', owner: '陈一', current: '17/22', target: '22 项', actual: 77, plan: 72, gap: '+5%', risk: '正常', next: '完成权限模型评审' },
  { name: '建立用户洞察体系', owner: '林溪', current: '26', target: '30 份', actual: 86, plan: 83, gap: '+3%', risk: '正常', next: '确认最后 4 份访谈纪要' }
]

const toneClass: Record<string, string> = {
  violet: 'bg-violet-50 text-violet-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600', purple: 'bg-fuchsia-50 text-fuchsia-600', emerald: 'bg-emerald-50 text-emerald-600'
}

export function App(): React.JSX.Element {
  const [authenticated, setAuthenticated] = useState(false)
  return authenticated ? <Workspace/> : <LoginScreen onLogin={() => setAuthenticated(true)}/>
}

function Workspace(): React.JSX.Element {
  const [active, setActive] = useState('首页')
  const [newOpen, setNewOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)
  const [navOpen, setNavOpen] = useState(true)
  const [done, setDone] = useState<number[]>([])
  const [updateOpen, setUpdateOpen] = useState(false)
  const [version, setVersion] = useState('…')
  const [updateState, setUpdateState] = useState<{status:string;message:string;percent?:number}>({status:'idle',message:'准备检查更新'})

  useEffect(() => {
    if (!window.updater) {
      setVersion('0.1.0')
      setUpdateState({status:'disabled',message:'浏览器预览模式不支持应用更新'})
      return
    }
    void window.updater.getVersion().then(setVersion)
    return window.updater.onState((state) => setUpdateState(state))
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

  return (
    <div className="app-shell flex overflow-hidden bg-[#f4f5f8] text-slate-900">
      <aside className={cn('primary-nav relative flex shrink-0 flex-col border-r border-slate-200/70 bg-[#fafbfc] transition-[width] duration-200', navOpen ? 'w-[218px]' : 'w-[68px]')}>
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-200"><Sparkles size={17}/></div>
          {navOpen && <div className="nav-copy min-w-0"><div className="text-sm font-bold">WorkMuse</div><div className="truncate text-[9px] text-slate-400">可追溯 AI 工作台</div></div>}
        </div>
        <div className="mx-3 mb-3 h-px bg-slate-200/70"/>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {nav.map(([label, Icon], index) => <button key={label} onClick={() => setActive(label)} title={label} className={cn('group flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[11px] font-medium transition', active === label ? 'bg-violet-600 text-white shadow-sm shadow-violet-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900', index === 9 && 'mt-4')}><Icon size={15} className="shrink-0"/><span className={cn('nav-copy truncate transition-opacity', !navOpen && 'hidden')}>{label}</span>{label === '通知' && navOpen && <span className="nav-copy ml-auto grid size-4 place-items-center rounded-full bg-red-500 text-[8px] text-white">6</span>}</button>)}
        </nav>
        <div className="m-2.5 border-t border-slate-200/70 pt-2"><button className="flex h-11 w-full items-center gap-3 rounded-xl px-2 hover:bg-slate-100"><div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">M</div>{navOpen && <div className="nav-copy min-w-0 flex-1 text-left"><div className="truncate text-[11px] font-semibold">Mishu</div><div className="truncate text-[9px] text-slate-400">产品团队</div></div>}{navOpen && <MoreHorizontal size={14} className="nav-copy text-slate-400"/>}</button></div>
        <button onClick={() => setNavOpen(!navOpen)} className="absolute -right-3 top-[76px] z-20 grid size-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm hover:text-violet-600">{navOpen ? <ChevronLeft size={12}/> : <ChevronRight size={12}/>}</button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="global-header relative z-30 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200/70 bg-white px-6">
          <button className="workspace-switch flex min-w-[160px] items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"><span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-violet-600"><BriefcaseBusiness size={14}/></span><span className="workspace-copy min-w-0 flex-1"><span className="block text-[9px] text-slate-400">当前空间</span><span className="block truncate text-[11px] font-semibold">WorkMuse 产品团队</span></span><ChevronDown size={13} className="workspace-copy text-slate-400"/></button>
          <button className="global-search mx-auto flex h-9 min-w-0 w-full max-w-[560px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[11px] text-slate-400 transition hover:border-violet-200 hover:bg-white"><Search size={15} className="shrink-0"/><span className="min-w-0 flex-1 truncate text-left">搜索文件、会议、观点、任务，或直接提问……</span><kbd className="search-shortcut shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px]">⌘ K</kbd></button>
          <div className="relative">
            <Button onClick={() => setNewOpen(!newOpen)} className="h-9 rounded-xl px-3 text-[11px]"><Plus size={15}/>新建<ChevronDown size={12}/></Button>
            {newOpen && <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/60"><p className="px-2 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">快速新建</p>{createItems.map(([label, Icon]) => <button key={label} onClick={() => setNewOpen(false)} className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-[11px] text-slate-600 hover:bg-violet-50 hover:text-violet-700"><Icon size={14}/>{label}</button>)}</div>}
          </div>
          <Button variant="ghost" size="icon" className="size-9"><CircleHelp size={16}/></Button>
          <Button onClick={() => setUpdateOpen(true)} variant="ghost" size="icon" className="size-9" title="检查更新"><RefreshCw size={16}/></Button>
          <Button variant="ghost" size="icon" className="relative size-9"><Bell size={16}/><span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500 ring-2 ring-white"/></Button>
          <div className="grid size-8 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">M</div>
        </header>

        <div className="workspace-body flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main className="workspace-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-7 py-6">
            {active !== '首页' ? <EmptyPage title={active}/> : <>
              <section className="mb-6 flex items-start justify-between gap-6">
                <div><div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-violet-600"><span>2026年8月28日 · 星期五</span><span className="size-1 rounded-full bg-slate-300"/><span>产品团队</span></div><h1 className="text-[25px] font-bold tracking-[-.04em]">早上好，Mishu</h1><p className="mt-1.5 text-[11px] text-slate-400">今天有 3 件重要事项需要优先推进。</p></div>
                <div className="min-w-[310px] rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700"><Flag size={13}/>今天最重要的三件事</span><span className="text-[9px] text-violet-400">1 / 3 完成</span></div><div className="flex gap-1.5">{['确认路线图','审核研究成果','准备增长周会'].map((item,i) => <span key={item} className={cn('rounded-lg border px-2 py-1 text-[9px]', i === 0 ? 'border-violet-200 bg-white text-violet-700' : 'border-transparent bg-white/50 text-slate-500')}>{item}</span>)}</div></div>
              </section>

              <div className="mb-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_4px_16px_rgba(37,43,66,.04)] focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-50"><span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-500"><Lightbulb size={15}/></span><input className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-400" placeholder="快速记录灵感、想法或待办，AI 会帮你整理……"/><button className="rounded-lg px-3 py-2 text-[10px] font-medium text-violet-600 hover:bg-violet-50">记录</button></div>

              <section className="mb-7 grid grid-cols-5 gap-2.5">{metrics.map((item) => <article key={item.label} className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_5px_18px_rgba(33,38,60,.035)]"><div className="flex items-start justify-between"><div><p className="text-[9px] text-slate-400">{item.label}</p><strong className="mt-1 block text-[20px] tracking-tight">{item.value}</strong></div><span className={cn('grid size-8 place-items-center rounded-xl',toneClass[item.tone])}><item.icon size={15}/></span></div><p className={cn('mt-2 text-[8.5px]', item.tone === 'red' ? 'text-red-500' : 'text-slate-400')}>{item.note}</p></article>)}</section>

              <section className="mb-7 grid grid-cols-[1.05fr_.95fr] gap-5">
                <div><SectionTitle title="今日行动" subtitle="按时间与优先级排列" action="查看全部"/><div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">{actions.map((item,index) => { const isDone = done.includes(index); return <div key={item.title} className={cn('group flex items-center gap-3 px-4 py-3', index < actions.length-1 && 'border-b border-slate-100', isDone && 'opacity-55')}><button onClick={() => setDone((v) => v.includes(index) ? v.filter(x => x !== index) : [...v,index])} className={cn('grid size-5 place-items-center rounded-full border', isDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-violet-500')}><Check size={11}/></button><span className="w-10 text-[10px] font-semibold text-slate-500">{item.time}</span><div className="min-w-0 flex-1"><p className={cn('truncate text-[11px] font-medium',isDone && 'line-through')}>{item.title}</p><p className="mt-1 truncate text-[8.5px] text-slate-400">{item.detail}</p></div><span className={cn('rounded-md px-2 py-1 text-[8px] font-medium',toneClass[item.tone])}>{item.type}</span></div>})}</div></div>
                <div><SectionTitle title="最近内容" subtitle="你最近访问和更新的内容" action="更多"/><div className="grid grid-cols-2 gap-2.5">{[
                  ['增长周会纪要','会议 · 20 分钟前',MessageSquareText,'blue'],['用户洞察报告 v2','文件 · 2 小时前',Files,'amber'],['激活率优化方案','成果 · 昨天',Trophy,'emerald'],['企业版 MVP','项目 · 昨天',FolderKanban,'violet']
                ].map(([title,meta,Icon,tone]) => <button key={title as string} className="flex min-h-[76px] items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left transition hover:-translate-y-px hover:border-violet-100 hover:shadow-md"><span className={cn('grid size-8 shrink-0 place-items-center rounded-xl',toneClass[tone as string])}><Icon size={14}/></span><span className="min-w-0"><strong className="block truncate text-[10px]">{title as string}</strong><span className="mt-1.5 block text-[8.5px] text-slate-400">{meta as string}</span></span></button>)}</div></div>
              </section>

              <section><SectionTitle title="目标与成果概览" subtitle="对比计划与实际进度，及时发现差距" action="进入目标中心"/><div className="overflow-hidden rounded-2xl border border-slate-100 bg-white"><div className="grid grid-cols-[1.5fr_.7fr_1.2fr_.55fr_.65fr_1.3fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[8.5px] font-semibold text-slate-400"><span>目标</span><span>当前 / 目标</span><span>实际 / 计划进度</span><span>差距</span><span>状态</span><span>下一步建议</span></div>{goals.map((goal,index) => <div key={goal.name} className={cn('grid grid-cols-[1.5fr_.7fr_1.2fr_.55fr_.65fr_1.3fr] items-center gap-4 px-4 py-3.5',index < goals.length-1 && 'border-b border-slate-100')}><div className="min-w-0"><p className="truncate text-[10.5px] font-semibold">{goal.name}</p><p className="mt-1 text-[8px] text-slate-400">负责人 · {goal.owner}</p></div><span className="text-[9px] font-medium">{goal.current} / {goal.target}</span><div><div className="mb-1.5 flex justify-between text-[8px] text-slate-400"><span>实际 {goal.actual}%</span><span>计划 {goal.plan}%</span></div><div className="relative h-1.5 rounded-full bg-slate-100"><div className={cn('absolute h-full rounded-full',goal.actual < goal.plan ? 'bg-amber-400' : 'bg-emerald-500')} style={{width:`${goal.actual}%`}}/><span className="absolute top-[-2px] h-2.5 w-px bg-slate-500" style={{left:`${goal.plan}%`}}/></div></div><span className={cn('text-[9px] font-semibold',goal.gap.startsWith('-') ? 'text-red-500':'text-emerald-600')}>{goal.gap}</span><span className={cn('w-fit rounded-md px-2 py-1 text-[8px] font-medium',goal.risk === '有风险' ? 'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700')}>{goal.risk}</span><span className="truncate text-[9px] text-slate-500">{goal.next}</span></div>)}</div></section>
            </>}
          </main>

          {aiOpen ? <aside className="ai-panel flex min-h-0 w-[302px] shrink-0 flex-col border-l border-slate-200/70 bg-[#fcfcfe]"><div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-4"><div className="flex items-center gap-2 text-[11px] font-bold"><span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-violet-600"><Bot size={14}/></span>AI 今日建议</div><button onClick={() => setAiOpen(false)} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={14}/></button></div><div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-4 text-white shadow-lg shadow-violet-100"><div className="flex items-center gap-2 text-[10px] font-semibold"><WandSparkles size={14}/>今日重点</div><p className="mt-2.5 text-[10px] leading-5 text-violet-100">激活率目标落后计划 6 个百分点。建议优先确认新手引导改版范围，避免影响下周实验。</p><div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3 text-[8px] text-violet-200"><span>基于 12 份材料 · 刚刚生成</span><button className="text-white underline underline-offset-2">查看依据</button></div></div>
            <AiCard tone="red" title="风险提醒" text="增长实验项目有 2 个任务阻塞超过 3 天，可能使里程碑延迟。" meta="3 个来源 · 10 分钟前" action="查看风险"/>
            <AiCard tone="violet" title="可执行建议" text="将“补充竞品数据”拆分给研究与数据团队并行处理，预计可提前 1.5 天完成。" meta="AI 判断 · 需你确认" action="采纳并创建任务"/>
            <AiCard tone="amber" title="待确认信息" text="会议中提到的激活率口径与当前目标指标可能不一致。" meta="来源：增长周会 18:42" action="打开原始发言"/>
          </div><div className="shrink-0 border-t border-slate-100 p-3"><button className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-100"><Bot size={14}/>继续询问 AI</button></div></aside> : <button onClick={() => setAiOpen(true)} className="m-3 grid size-9 shrink-0 place-items-center self-start rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200" title="展开 AI 建议"><Bot size={16}/></button>}
          <button className="responsive-ai-trigger fixed bottom-4 right-4 z-40 hidden size-10 place-items-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-300" title="打开 AI 助手"><Bot size={17}/></button>
        </div>
      </div>
      {updateOpen && <UpdateDialog version={version} state={updateState} onClose={() => setUpdateOpen(false)} onCheck={() => void checkUpdate()} onInstall={() => void window.updater?.install()}/>} 
    </div>
  )
}

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

function LoginScreen({onLogin}:{onLogin:()=>void}): React.JSX.Element {
  const [loginMode, setLoginMode] = useState<'email'|'wechat'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [qrSeed, setQrSeed] = useState(() => Date.now())

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!email.trim()) { setError('请输入工作邮箱'); return }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('请输入有效的邮箱地址'); return }
    if (password.length < 6) { setError('密码至少需要 6 个字符'); return }
    setError('')
    setSubmitting(true)
    window.setTimeout(onLogin, 450)
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
        <div className="mb-8"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-violet-600">欢迎回来</p><h2 className="text-[25px] font-bold tracking-[-.04em] text-slate-900">登录 WorkMuse</h2><p className="mt-2 text-[11px] text-slate-400">继续进入你的团队工作空间</p></div>
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setLoginMode('email')} className={cn('h-9 rounded-lg text-[10px] font-semibold transition',loginMode==='email'?'bg-white text-slate-900 shadow-sm':'text-slate-400 hover:text-slate-600')}><span className="inline-flex items-center gap-2"><LogIn size={13}/>邮箱登录</span></button><button type="button" onClick={() => setLoginMode('wechat')} className={cn('h-9 rounded-lg text-[10px] font-semibold transition',loginMode==='wechat'?'bg-white text-slate-900 shadow-sm':'text-slate-400 hover:text-slate-600')}><span className="inline-flex items-center gap-2"><Smartphone size={13}/>微信扫码</span></button></div>
        {loginMode === 'wechat' ? <div className="text-center">
          <div className="mx-auto w-fit rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_35px_rgba(37,43,66,.08)]"><div className="relative overflow-hidden rounded-xl bg-white p-2"><QRCodeSVG value={`https://workmuse.local/auth/wechat?ticket=demo-${qrSeed}`} size={176} level="H" bgColor="#ffffff" fgColor="#161827"/><div className="absolute inset-0 grid place-items-center"><span className="grid size-9 place-items-center rounded-xl border-4 border-white bg-[#07c160] text-white shadow-sm"><MessageSquareText size={17} fill="currentColor"/></span></div></div></div>
          <h3 className="mt-5 text-[12px] font-semibold text-slate-800">使用微信扫码登录</h3><p className="mt-2 text-[9px] leading-5 text-slate-400">打开微信扫一扫，扫描二维码后<br/>请在手机上确认登录</p>
          <button type="button" onClick={() => setQrSeed(Date.now())} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-medium text-violet-600 hover:bg-violet-50"><RefreshCw size={12}/>刷新二维码</button>
          <div className="mt-5 flex items-center justify-center gap-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-[8.5px] text-emerald-700"><span className="flex items-center gap-1.5"><ShieldCheck size={12}/>二维码一次有效</span><span className="h-3 w-px bg-emerald-200"/><span>2 分钟后过期</span></div>
          <Button type="button" onClick={onLogin} variant="secondary" className="mt-4 h-9 w-full text-[9px]">模拟扫码成功并进入</Button>
        </div> : <>
          <button type="button" onClick={onLogin} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/30"><Building2 size={15} className="text-violet-600"/>使用企业 SSO 登录</button>
          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-slate-200"/><span className="text-[9px] text-slate-400">或使用工作邮箱</span><span className="h-px flex-1 bg-slate-200"/></div>
          <form onSubmit={submit} noValidate>
          <label className="mb-1.5 block text-[10px] font-semibold text-slate-600" htmlFor="email">工作邮箱</label>
          <div className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-50"><LogIn size={15} className="shrink-0 text-slate-400"/><input id="email" autoComplete="email" value={email} onChange={(e) => {setEmail(e.target.value);setError('')}} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-300" placeholder="name@company.com"/></div>
          <div className="mb-1.5 flex items-center justify-between"><label className="text-[10px] font-semibold text-slate-600" htmlFor="password">密码</label><button type="button" className="text-[9px] font-medium text-violet-600 hover:text-violet-800">忘记密码？</button></div>
          <div className={cn('flex h-11 items-center gap-2 rounded-xl border bg-white px-3 transition focus-within:ring-4 focus-within:ring-violet-50',error ? 'border-red-300':'border-slate-200 focus-within:border-violet-400')}><LockKeyhole size={15} className="shrink-0 text-slate-400"/><input id="password" autoComplete="current-password" type={showPassword?'text':'password'} value={password} onChange={(e) => {setPassword(e.target.value);setError('')}} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-300" placeholder="输入密码"/><button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-slate-700" aria-label={showPassword?'隐藏密码':'显示密码'}>{showPassword?<EyeOff size={15}/>:<Eye size={15}/>}</button></div>
          <div className="mt-2 min-h-4">{error && <p role="alert" className="text-[9px] font-medium text-red-500">{error}</p>}</div>
          <div className="mb-5 mt-2 flex items-center justify-between"><label className="flex cursor-pointer items-center gap-2 text-[9px] text-slate-500"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-3.5 accent-violet-600"/>在此设备上保持登录</label><span className="flex items-center gap-1 text-[8px] text-slate-400"><ShieldCheck size={11}/>安全连接</span></div>
          <Button type="submit" disabled={submitting} className="h-11 w-full text-[11px]">{submitting?'正在登录…':<>登录并进入工作空间<ArrowRight size={14}/></>}</Button>
          </form>
        </>}
        <p className="mt-6 text-center text-[9px] text-slate-400">还没有账号？ <button className="font-semibold text-violet-600 hover:text-violet-800">申请加入工作空间</button></p>
        <p className="mt-8 text-center text-[8px] leading-4 text-slate-300">登录即表示你同意《服务条款》和《隐私政策》<br/>当前为 UI 演示，未连接真实账号服务</p>
      </div>
    </section>
  </main>
}

function SectionTitle({title,subtitle,action}:{title:string;subtitle:string;action:string}): React.JSX.Element {
  return <div className="mb-3 flex items-end justify-between"><div><h2 className="text-[13px] font-bold">{title}</h2><p className="mt-1 text-[8.5px] text-slate-400">{subtitle}</p></div><button className="text-[9px] font-medium text-violet-600 hover:text-violet-800">{action} →</button></div>
}

function AiCard({tone,title,text,meta,action}:{tone:string;title:string;text:string;meta:string;action:string}): React.JSX.Element {
  const icons = {red: AlertTriangle, violet: Sparkles, amber: Gauge}; const Icon = icons[tone as keyof typeof icons]
  return <article className="mt-3 rounded-2xl border border-slate-100 bg-white p-3.5"><div className="flex items-center gap-2 text-[10px] font-semibold"><span className={cn('grid size-6 place-items-center rounded-lg',toneClass[tone])}><Icon size={12}/></span>{title}</div><p className="mt-2.5 text-[9.5px] leading-[1.7] text-slate-600">{text}</p><p className="mt-2 text-[8px] text-slate-400">{meta}</p><button className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-[9px] font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-700">{action}</button></article>
}

function EmptyPage({title}:{title:string}): React.JSX.Element {
  return <div className="grid h-full place-items-center"><div className="max-w-sm text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-50 text-violet-600"><FilePlus2 size={23}/></div><h1 className="mt-4 text-lg font-bold">{title}</h1><p className="mt-2 text-[11px] leading-5 text-slate-400">页面骨架已接入统一导航与全局操作，将按 MVP 优先级继续实现详细内容。</p><Button className="mt-5 h-9 text-[10px]"><Plus size={14}/>创建{title}内容</Button></div></div>
}
