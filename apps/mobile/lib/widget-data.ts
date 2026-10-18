import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import { DAILY_HISTORY_LIMIT, type DailyBucket, todayKey } from "@/store/opencode-stats.store"

const CONNECTIONS_KEY = "crosscode-connections"
const SESSIONS_KEY = "crosscode-sessions"
const STATS_KEY = "crosscode-opencode-stats"
const QUESTIONS_KEY = "crosscode-questions"
const PROJECTS_KEY = "crosscode-projects"
/** widget instance (`"${widgetName}:${widgetId}"`) -> connection id chosen in the config screen. */
const WIDGET_CONNECTIONS_KEY = "crosscode-widget-connections"

type Persisted<T> = { state: T }

interface Connection {
  id: string
  url: string
  name: string
  healthy?: boolean | null
}

interface SessionSummary {
  additions: number
  deletions: number
  files: number
}

interface Session {
  id: string
  projectID: string
  directory: string
  title: string
  agent?: string
  time: { created: number; updated: number }
  summary?: SessionSummary
}

interface StoredProject {
  id: string
  name: string
  directory: string
  connectionId: string
}

interface ProjectStats {
  projectId: string
  projectName: string
  responseCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  lastResponseAt: string | null
  dailyHistory?: Record<string, DailyBucket>
}

async function readPersisted<T>(key: string): Promise<T | undefined> {
  try {
    // Connection/auth stores persist via secureStorage (SecureStore first,
    // AsyncStorage fallback). Check both so widgets don't go stale.
    if (key === CONNECTIONS_KEY) {
      try {
        if (await SecureStore.isAvailableAsync().catch(() => false)) {
          const secured = await SecureStore.getItemAsync(key)
          if (secured) {
            const parsed = JSON.parse(secured) as Persisted<T>
            if (parsed?.state !== undefined) return parsed.state
          }
        }
      } catch {}
    }
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Persisted<T>
    return parsed?.state
  } catch {
    return undefined
  }
}

function last7Days(): string[] {
  const days: string[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export interface ProjectWidgetData {
  id: string
  name: string
  responseCount: number
  inputTokens: number
  outputTokens: number
  cost: number
  lastResponseAt: string | null
  /** Output tokens per day for the trailing 7 days (oldest -> newest). */
  weekOutputTokens: number[]
}

export interface WidgetData {
  /** True when at least one connection is reachable. */
  connected: boolean
  connectedCount: number
  unreachableCount: number
  totalCount: number
  hasSession: boolean
  sessionTitle: string
  sessionAgent: string
  sessionAdditions: number
  sessionDeletions: number
  sessionFiles: number
  sessionUpdatedAt: number | null
  pendingQuestions: number
  todayInputTokens: number
  todayOutputTokens: number
  todayCost: number
  weekOutputTokens: number[]
  projects: ProjectWidgetData[]
}

export interface ConnectionWidgetData extends WidgetData {
  connectionId: string | null
  connectionName: string
  connectionHealthy: boolean | null
}

export function widgetInstanceKey(widgetName: string, widgetId: number): string {
  return `${widgetName}:${widgetId}`
}

async function readWidgetConnections(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_CONNECTIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export async function getWidgetConnectionId(
  widgetName: string,
  widgetId: number
): Promise<string | null> {
  const map = await readWidgetConnections()
  return map[widgetInstanceKey(widgetName, widgetId)] ?? null
}

export async function setWidgetConnectionId(
  widgetName: string,
  widgetId: number,
  connectionId: string | null
): Promise<void> {
  const map = await readWidgetConnections()
  const key = widgetInstanceKey(widgetName, widgetId)
  if (connectionId) {
    map[key] = connectionId
  } else {
    delete map[key]
  }
  await AsyncStorage.setItem(WIDGET_CONNECTIONS_KEY, JSON.stringify(map))
}

interface LoadedState {
  connections: Connection[]
  sessions: Session[]
  projectsMap: Record<string, ProjectStats>
  storedProjects: StoredProject[]
  pendingQuestions: number
}

async function loadState(): Promise<LoadedState> {
  const [connectionsState, sessionsState, statsState, questions, projectsState] =
    await Promise.all([
      readPersisted<{ connections: Connection[]; current: string | null }>(CONNECTIONS_KEY),
      readPersisted<{ sessions: Session[] }>(SESSIONS_KEY),
      readPersisted<{ projects: Record<string, ProjectStats> }>(STATS_KEY),
      readPersisted<{ questionsBySession: Record<string, unknown[]> }>(QUESTIONS_KEY),
      readPersisted<{ projects: StoredProject[] }>(PROJECTS_KEY),
    ])
  return {
    connections: connectionsState?.connections ?? [],
    sessions: sessionsState?.sessions ?? [],
    projectsMap: statsState?.projects ?? {},
    storedProjects: projectsState?.projects ?? [],
    pendingQuestions: questions
      ? Object.values(questions.questionsBySession ?? {}).reduce<number>(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        )
      : 0,
  }
}

function toProjectWidgets(
  stats: ProjectStats[],
  days: string[]
): ProjectWidgetData[] {
  return stats
    .map((p) => ({
      id: p.projectId,
      name: p.projectName,
      responseCount: p.responseCount,
      inputTokens: p.totalInputTokens,
      outputTokens: p.totalOutputTokens,
      cost: p.totalCost,
      lastResponseAt: p.lastResponseAt,
      weekOutputTokens: days.map((d) => p.dailyHistory?.[d]?.outputTokens ?? 0),
    }))
    .sort((a, b) => (b.lastResponseAt ?? "").localeCompare(a.lastResponseAt ?? ""))
    .slice(0, 5)
}

function aggregateHistory(stats: ProjectStats[]): Record<string, DailyBucket> {
  const globalHistory: Record<string, DailyBucket> = {}
  for (const p of stats) {
    for (const [day, bucket] of Object.entries(p.dailyHistory ?? {})) {
      const agg = globalHistory[day] ?? {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        responses: 0,
      }
      agg.inputTokens += bucket.inputTokens
      agg.outputTokens += bucket.outputTokens
      agg.cost += bucket.cost
      agg.responses += bucket.responses
      globalHistory[day] = agg
    }
  }
  return globalHistory
}

function buildData(
  connections: Connection[],
  sessions: Session[],
  stats: ProjectStats[],
  pendingQuestions: number
): WidgetData {
  const connectedCount = connections.filter((c) => c.healthy !== false && c.url).length
  const unreachableCount = connections.filter((c) => c.healthy === false).length

  const activeSession = sessions.length
    ? [...sessions].sort((a, b) => b.time.updated - a.time.updated)[0]
    : undefined

  const days = last7Days()
  const today = todayKey()
  const globalHistory = aggregateHistory(stats)
  const todayBucket = globalHistory[today] ?? {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    responses: 0,
  }

  return {
    connected: connectedCount > 0,
    connectedCount,
    unreachableCount,
    totalCount: connections.length,
    hasSession: Boolean(activeSession),
    sessionTitle: activeSession?.title ?? "",
    sessionAgent: activeSession?.agent ?? "",
    sessionAdditions: activeSession?.summary?.additions ?? 0,
    sessionDeletions: activeSession?.summary?.deletions ?? 0,
    sessionFiles: activeSession?.summary?.files ?? 0,
    sessionUpdatedAt: activeSession?.time.updated ?? null,
    pendingQuestions,
    todayInputTokens: todayBucket.inputTokens,
    todayOutputTokens: todayBucket.outputTokens,
    todayCost: todayBucket.cost,
    weekOutputTokens: days.map((d) => globalHistory[d]?.outputTokens ?? 0),
    projects: toProjectWidgets(stats, days),
  }
}

/** Overall stats across ALL connections. */
export async function buildWidgetData(): Promise<WidgetData> {
  const { connections, sessions, projectsMap, pendingQuestions } = await loadState()
  return buildData(connections, sessions, Object.values(projectsMap), pendingQuestions)
}

/**
 * Stats scoped to a single connection (chosen per widget instance in the
 * config screen). Falls back to the aggregate when the id is missing so the
 * widget never renders empty after a connection is deleted.
 */
export async function buildConnectionWidgetData(
  connectionId: string | null
): Promise<ConnectionWidgetData> {
  const { connections, sessions, projectsMap, storedProjects, pendingQuestions } =
    await loadState()
  const connection = connections.find((c) => c.id === connectionId) ?? null

  if (!connection) {
    return {
      ...(await buildWidgetData()),
      connectionId: null,
      connectionName: "",
      connectionHealthy: null,
    }
  }

  const ownedProjectIds = new Set(
    storedProjects.filter((p) => p.connectionId === connection.id).map((p) => p.id)
  )
  const ownedDirectories = new Set(
    storedProjects.filter((p) => p.connectionId === connection.id).map((p) => p.directory)
  )
  const ownSessions = sessions.filter(
    (s) => ownedProjectIds.has(s.projectID) || ownedDirectories.has(s.directory)
  )
  const ownStats = Object.values(projectsMap).filter((p) =>
    ownedProjectIds.has(p.projectId)
  )

  return {
    ...buildData([connection], ownSessions, ownStats, pendingQuestions),
    connectionId: connection.id,
    connectionName: connection.name,
    connectionHealthy: connection.healthy ?? null,
  }
}

export const WIDGET_DAILY_HISTORY_LIMIT = DAILY_HISTORY_LIMIT
