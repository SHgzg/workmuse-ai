import { useCallback, useEffect, useState } from 'react'
import type { QuestionAnswer, SearchResult } from '../../../core/content'
import type { CoreImportResult, CoreJob, CoreSettings, CoreStatus } from '../../../preload'

type CoreViewState = {
  status: CoreStatus | null
  jobs: CoreJob[]
  settings: CoreSettings | null
  loading: boolean
  importing: boolean
  error: string | null
  lastImport: CoreImportResult | null
}

const browserStatus: CoreStatus = {
  available: false,
  error: '浏览器预览未连接 Electron Core。请运行桌面应用以使用本地资料处理。',
  capabilities: null
}

export function useWorkMuseCore() {
  const [state, setState] = useState<CoreViewState>({ status: null, jobs: [], settings: null, loading: true, importing: false, error: null, lastImport: null })

  const refresh = useCallback(async () => {
    if (!window.workmuseCore) {
      setState((current) => ({ ...current, status: browserStatus, jobs: [], loading: false }))
      return
    }
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const [status, jobs, settings] = await Promise.all([window.workmuseCore.status(), window.workmuseCore.jobs(), window.workmuseCore.getSettings()])
      setState((current) => ({ ...current, status, jobs, settings, loading: false }))
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }))
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (!window.workmuseCore) return
    return window.workmuseCore.onEvent(() => void refresh())
  }, [refresh])

  const importResource = useCallback(async () => {
    if (!window.workmuseCore) return null
    setState((current) => ({ ...current, importing: true, error: null }))
    try {
      const result = await window.workmuseCore.importResource()
      const jobs = await window.workmuseCore.jobs()
      setState((current) => ({ ...current, importing: false, jobs, lastImport: result }))
      return result
    } catch (error) {
      setState((current) => ({ ...current, importing: false, error: error instanceof Error ? error.message : String(error) }))
      return null
    }
  }, [])

  const search = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!window.workmuseCore) throw new Error(browserStatus.error ?? 'Core 不可用')
    return window.workmuseCore.search(query, 30)
  }, [])

  const answer = useCallback(async (question: string): Promise<QuestionAnswer> => {
    if (!window.workmuseCore) throw new Error(browserStatus.error ?? 'Core 不可用')
    return window.workmuseCore.answer(question)
  }, [])

  return { ...state, refresh, importResource, search, answer }
}
