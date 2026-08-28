export const CONTENT_SCHEMA_VERSION = 'workmuse.content.v1' as const

export type ResourceKind =
  | 'text'
  | 'document'
  | 'image'
  | 'audio'
  | 'video'
  | 'unknown'

export type SourceLocation =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'page'; page: number; bbox?: [number, number, number, number] }
  | { kind: 'time'; startMs: number; endMs: number; speaker?: string }
  | { kind: 'resource' }

export type EvidenceReference = {
  resourceId: string
  blockId: string
  location: SourceLocation
}

export type SemanticBlock = {
  id: string
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'image' | 'transcript' | 'metadata'
  text: string
  location: SourceLocation
  metadata?: Record<string, unknown>
}

export type ResourceDescriptor = {
  id: string
  path: string
  fileName: string
  mimeType: string
  kind: ResourceKind
  size: number
  checksum: string
}

export type NormalizedContent = {
  schema: typeof CONTENT_SCHEMA_VERSION
  resource: ResourceDescriptor
  title?: string
  language?: string
  blocks: SemanticBlock[]
  metadata: Record<string, unknown>
  semantics: {
    summary?: string
    entities: Array<{
      id: string
      name: string
      type: string
      evidence: EvidenceReference[]
    }>
    claims: Array<{
      id: string
      text: string
      evidence: EvidenceReference[]
    }>
    actionItems: Array<{
      id: string
      text: string
      assignee?: string
      dueDate?: string
      evidence: EvidenceReference[]
    }>
  }
  provenance: Array<{
    stage: string
    adapter: string
    version?: string
    createdAt: string
  }>
  warnings: Array<{ code: string; message: string }>
}

export type UnderstandResourceParams = {
  path: string
  outputDirectory: string
  quality?: 'fast' | 'balanced' | 'accurate'
  language?: string
  allowCloud?: boolean
}

export type UnderstandResourceResult = {
  content: NormalizedContent
  artifactPath: string
  index?: { resourceId: string; indexedBlocks: number; indexedEmbeddings?: number }
}

export type SearchResult = {
  resourceId: string
  blockId: string
  type: SemanticBlock['type']
  text: string
  title?: string
  path: string
  location: SourceLocation
  score: number
  evidence: EvidenceReference
}

export type SearchContext = {
  query: string
  blocks: SearchResult[]
  characterCount: number
  citations: EvidenceReference[]
}

export type QuestionAnswer = {
  status: 'answered' | 'model-unavailable' | 'cloud-processing-denied'
  answer: string | null
  citations: EvidenceReference[]
  followUps?: string[]
  context: SearchContext
  model?: string
  message?: string
}
