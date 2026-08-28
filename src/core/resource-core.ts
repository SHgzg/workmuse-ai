import type {
  QuestionAnswer,
  SearchContext,
  SearchResult,
  UnderstandResourceParams,
  UnderstandResourceResult
} from './content'
import { CONTENT_SCHEMA_VERSION } from './content'
import { PythonWorkerClient } from './worker'

export class ResourceCore {
  constructor(private readonly worker: PythonWorkerClient) {}

  async understand(params: UnderstandResourceParams): Promise<UnderstandResourceResult> {
    if (!params.path || !params.outputDirectory) {
      throw new Error('Resource path and output directory are required.')
    }

    const result = await this.worker.request<UnderstandResourceResult>('resources.understand', {
      path: params.path,
      outputDirectory: params.outputDirectory,
      quality: params.quality ?? 'balanced',
      language: params.language,
      allowCloud: params.allowCloud ?? false
    })

    if (result.content.schema !== CONTENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported content schema: ${String(result.content.schema)}`)
    }
    if (!Array.isArray(result.content.blocks) || !result.content.resource?.checksum) {
      throw new Error('Worker returned an invalid normalized content document.')
    }
    return result
  }

  listCapabilities(): Promise<unknown> {
    return this.worker.request('tools.list', {}, 30_000)
  }

  inspectRuntime(): Promise<unknown> {
    return this.worker.request('runtime.inspect', {}, 10_000)
  }

  search(query: string, limit = 20, resourceIds?: string[], allowCloud = false): Promise<SearchResult[]> {
    return this.worker.request('search.query', { query, limit, resourceIds, allowCloud }, 10_000)
  }

  buildContext(
    query: string,
    maxCharacters = 12_000,
    resourceIds?: string[],
    allowCloud = false
  ): Promise<SearchContext> {
    return this.worker.request('search.context', { query, maxCharacters, resourceIds, allowCloud }, 10_000)
  }

  answer(question: string, options?: { allowCloud?: boolean; resourceIds?: string[] }): Promise<QuestionAnswer> {
    return this.worker.request('questions.answer', {
      question,
      allowCloud: options?.allowCloud ?? false,
      resourceIds: options?.resourceIds
    })
  }

  rebuildIndex(): Promise<{ indexedResources: number; indexedBlocks: number; failures: unknown[] }> {
    return this.worker.request('index.rebuild', {}, 300_000)
  }
}
