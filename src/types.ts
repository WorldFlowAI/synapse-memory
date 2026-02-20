// ---------------------------------------------------------------------------
// Agent identification (multi-tool support)
// ---------------------------------------------------------------------------

export type AgentType =
  | 'claude-code'
  | 'cursor'
  | 'aider'
  | 'openclaw'
  | 'unknown';

export interface AgentInfo {
  readonly agentType: AgentType;
  readonly displayName: string;
  readonly agentVersion?: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly totalSessions: number;
}

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface Session {
  readonly sessionId: string;
  readonly projectPath: string;
  readonly branch: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly status: SessionStatus;
  readonly summary?: string;
  readonly gitCommitStart?: string;
  readonly gitCommitEnd?: string;
  readonly agentType?: AgentType;
  readonly agentVersion?: string;
}

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface SessionEvent {
  readonly eventId: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly eventType: EventType;
  readonly category: EventCategory;
  readonly detail: EventDetail;
}

export type EventType =
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'tool_call'
  | 'decision'
  | 'pattern'
  | 'error_resolved'
  | 'milestone';

export type EventCategory =
  | 'read'
  | 'search'
  | 'edit'
  | 'execute'
  | 'agent'
  | 'other';

export type EventDetail =
  | FileOpDetail
  | ToolCallDetail
  | DecisionDetail
  | PatternDetail
  | ErrorResolvedDetail
  | MilestoneDetail;

export interface FileOpDetail {
  readonly type: 'file_op';
  readonly path: string;
  readonly operation: 'read' | 'write' | 'edit';
}

export interface ToolCallDetail {
  readonly type: 'tool_call';
  readonly toolName: string;
  readonly params?: string;
}

export interface DecisionDetail {
  readonly type: 'decision';
  readonly title: string;
  readonly rationale: string;
}

export interface PatternDetail {
  readonly type: 'pattern';
  readonly description: string;
  readonly files: readonly string[];
}

export interface ErrorResolvedDetail {
  readonly type: 'error_resolved';
  readonly error: string;
  readonly resolution: string;
  readonly files: readonly string[];
}

export interface MilestoneDetail {
  readonly type: 'milestone';
  readonly summary: string;
}

export interface SessionMetrics {
  readonly sessionId: string;
  readonly durationSecs: number;
  readonly eventsTotal: number;
  readonly eventsByCategory: {
    readonly read: number;
    readonly search: number;
    readonly edit: number;
    readonly execute: number;
    readonly agent: number;
    readonly other: number;
  };
  readonly filesRead: number;
  readonly filesModified: number;
  readonly decisionsRecorded: number;
  readonly patternsDiscovered: number;
  readonly errorsResolved: number;
}

export interface CreateSessionInput {
  readonly projectPath: string;
  readonly branch?: string;
  readonly gitCommit?: string;
  readonly agentType?: AgentType;
  readonly agentVersion?: string;
}

export interface EndSessionInput {
  readonly sessionId: string;
  readonly summary?: string;
  readonly gitCommit?: string;
}

export interface RecordEventInput {
  readonly sessionId: string;
  readonly eventType: EventType;
  readonly detail: EventDetail;
}

export interface RecallInput {
  readonly projectPath: string;
  readonly query?: string;
  readonly branch?: string;
  readonly eventType?: EventType;
  readonly limit?: number;
}

export interface StatsInput {
  readonly projectPath: string;
  readonly period?: StatsPeriod;
}

export type StatsPeriod = 'day' | 'week' | 'month' | 'all';

// ---------------------------------------------------------------------------
// Synapse integration types
//
// These types provide the upgrade path from local synapse-memory to the
// hosted Synapse platform. They align with the Rust types in:
//   synapse-types/src/memory.rs  (PromotedKnowledge, MemoryMilestone)
//   synapse-types/src/context.rs (SessionMetrics)
// ---------------------------------------------------------------------------

export type KnowledgeType = 'decision' | 'pattern' | 'error_resolved' | 'milestone';

/**
 * Promoted knowledge — session findings elevated to project-level persistence.
 * Maps to Synapse's PromotedKnowledge (synapse-types/src/memory.rs).
 *
 * When synced to Synapse, `synapseKnowledgeId` is populated with the remote ID.
 */
export interface PromotedKnowledge {
  readonly knowledgeId: string;
  readonly projectPath: string;
  readonly sessionId?: string;
  readonly sourceEventId?: string;
  readonly title: string;
  readonly content: string;
  readonly knowledgeType: KnowledgeType;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly syncedAt?: string;
  readonly synapseKnowledgeId?: string;
  readonly branch?: string;
  readonly contentHash?: string;
  readonly usageCount?: number;
  readonly supersededBy?: string;
}

/**
 * Synapse sync configuration per project.
 * Stores the connection details for optional sync to a Synapse instance.
 *
 * Maps to Synapse tenant/project model:
 *   - tenantId  -> Synapse tenant isolation boundary
 *   - synapseProjectId -> Synapse MemoryProject.project_id
 *   - apiKeyEnvVar -> env var name holding the Synapse API key (never stored)
 */
export interface SynapseSyncConfig {
  readonly projectPath: string;
  readonly synapseEndpoint?: string;
  readonly synapseProjectId?: string;
  readonly tenantId?: string;
  readonly apiKeyEnvVar: string;
  readonly autoSyncPromoted: boolean;
  readonly lastSyncedAt?: string;
}

/**
 * Synapse-compatible session metrics.
 * When synced, these fields map 1:1 to synapse-types SessionMetrics:
 *   - eventsTotal        -> tool_calls_total
 *   - eventsByCategory.* -> tool_calls_read/search/edit/execute/agent
 *   - durationSecs       -> session_duration_secs
 */
export interface SynapseSessionExport {
  readonly sessionId: string;
  readonly projectPath: string;
  readonly branch: string;
  readonly agentType: 'claude-code';
  readonly metrics: SessionMetrics;
  readonly promotedKnowledge: readonly PromotedKnowledge[];
  readonly summary?: string;
  readonly startedAt: string;
  readonly endedAt?: string;
}

// ---------------------------------------------------------------------------
// v0.2: Value tracking and analytics
// ---------------------------------------------------------------------------

/**
 * File importance scoring — tracks which files are most important to a project
 * based on read/edit frequency and recency.
 */
export interface FileImportance {
  readonly projectPath: string;
  readonly filePath: string;
  readonly readCount: number;
  readonly editCount: number;
  readonly lastAccessedAt: string;
  readonly importanceScore: number;
}

/**
 * Knowledge usage tracking — records when knowledge is surfaced or recalled,
 * proving the value synapse-memory provides.
 */
export interface KnowledgeUsage {
  readonly usageId: string;
  readonly knowledgeId: string;
  readonly sessionId: string;
  readonly usageType: 'surfaced' | 'recalled' | 'applied';
  readonly timestamp: string;
}

/**
 * Aggregate value metrics per project — tracks how much value synapse-memory
 * provides over time.
 */
export interface ValueMetrics {
  readonly projectPath: string;
  readonly totalSessions: number;
  readonly contextReuseCount: number;
  readonly knowledgeSurfacedCount: number;
  readonly decisionsRecalledCount: number;
  readonly patternsAppliedCount: number;
  readonly errorsPreventedCount: number;
  readonly estimatedTimeSavedSecs: number;
  readonly updatedAt: string;
}

/**
 * Scored knowledge item for ranking in context injection.
 */
export interface ScoredKnowledge {
  readonly knowledge: PromotedKnowledge;
  readonly relevanceScore: number;
  readonly branchWeight: number;
  readonly recencyWeight: number;
}

/**
 * Duplicate detection result.
 */
export interface DuplicateCandidate {
  readonly existingKnowledge: PromotedKnowledge;
  readonly similarityScore: number;
  readonly matchType: 'exact_hash' | 'title_match';
}

/**
 * Context budget configuration for session_start output.
 */
export interface ContextBudgetConfig {
  readonly maxSessions?: number;      // default: 5
  readonly maxKnowledge?: number;     // default: 15
  readonly maxFiles?: number;         // default: 10
}

/**
 * Time savings estimates per action type (in seconds).
 */
export interface TimeSavingsEstimates {
  readonly knowledgeSurface: number;    // 60 seconds (1 min)
  readonly decisionRecall: number;      // 180 seconds (3 min)
  readonly patternApplied: number;      // 300 seconds (5 min)
  readonly errorPrevented: number;      // 900 seconds (15 min)
}
