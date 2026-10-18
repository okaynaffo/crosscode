import { useDebugLogs, type DebugLogEntry, type LogLevel } from "@/store/debug-logs.store"
import { AppState } from "react-native"
import { useAuth } from "@/store/auth.store"
import { useConnections } from "@/store/connection.store"
import { useSessions } from "@/store/sessions.store"
import { useProjects } from "@/store/projects.store"
import { useRecents } from "@/store/recents.store"
import { useMessages } from "@/store/messages.store"
import { useChatStore } from "@/store/chat.store"
import { useModels } from "@/store/models.store"
import { useAgents } from "@/store/agents.store"
import { usePermissions } from "@/store/permissions.store"
import { useQuestions } from "@/store/questions.store"
import { useNotifications } from "@/store/notifications.store"
import { useSettings } from "@/store/settings.store"
import { useGitStore } from "@/store/git.store"
import { useDiffStore } from "@/store/diff.store"
import { useBrowserStore } from "@/store/browser.store"
import { usePaywall } from "@/store/paywall.store"
import { useOpencodeStats } from "@/store/opencode-stats.store"
import { useQuickPromptsStore } from "@/store/quick-prompts.store"

const SESSION_START = Date.now()
const MAX_MESSAGE = 2000
const STORE_LOG_WINDOW = 250

let lastTime = SESSION_START
let seq = 0
let writing = false
let installed = false

function safeString(value: unknown): string {
    if (value === null || value === undefined) return String(value)
    if (typeof value === "string") return value
    try {
        return JSON.stringify(value) ?? String(value)
    } catch {
        return String(value)
    }
}

function truncate(text: string, max = MAX_MESSAGE): string {
    return text.length > max ? `${text.slice(0, max)}… (+${text.length - max})` : text
}

/** Append a single debug entry. Never throws and never re-enters itself. */
export function log(tag: string, message: string, level: LogLevel = "info", extra?: unknown): void {
    if (writing) return
    writing = true
    try {
        const now = Date.now()
        const text = extra === undefined ? message : `${message} ${safeString(extra)}`
        const entry: DebugLogEntry = {
            id: ++seq,
            time: now,
            total: (now - SESSION_START) / 1000,
            delta: (now - lastTime) / 1000,
            tag,
            message: truncate(text),
            level,
        }
        lastTime = now
        useDebugLogs.getState().add(entry)
    } catch {
        // Logging must never break the app.
    } finally {
        writing = false
    }
}

export const debug = (tag: string, message: string, extra?: unknown) => log(tag, message, "debug", extra)
export const info = (tag: string, message: string, extra?: unknown) => log(tag, message, "info", extra)
export const warn = (tag: string, message: string, extra?: unknown) => log(tag, message, "warn", extra)
export const error = (tag: string, message: string, extra?: unknown) => log(tag, message, "error", extra)

/** Strip query/hash so tokens or secrets in the URL never reach the log. */
function redactUrl(input: string): string {
    if (!input) return ""
    try {
        const url = new URL(input)
        return `${url.host}${url.pathname}`
    } catch {
        const cut = input.indexOf("?")
        return cut === -1 ? input : input.slice(0, cut)
    }
}

function installFetchLogging(): void {
    const g = globalThis as unknown as { fetch: typeof fetch; __ccFetchPatched?: boolean }
    if (g.__ccFetchPatched || typeof g.fetch !== "function") return
    g.__ccFetchPatched = true
    const original = g.fetch
    g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const start = Date.now()
        let method = "GET"
        let rawUrl = ""
        try {
            if (typeof input === "string") {
                rawUrl = input
                method = (init?.method ?? "GET").toUpperCase()
            } else if (input instanceof URL) {
                rawUrl = input.toString()
                method = (init?.method ?? "GET").toUpperCase()
            } else if (input && typeof input === "object") {
                rawUrl = (input as Request).url ?? ""
                method = (init?.method ?? (input as Request).method ?? "GET").toUpperCase()
            }
        } catch {
            // ignore introspection failures
        }
        const target = redactUrl(rawUrl)
        log("HTTP", `${method} ${target}`, "debug")
        try {
            const res = await original(input as RequestInfo, init)
            const ms = Date.now() - start
            const level: LogLevel = res.ok ? "debug" : res.status >= 500 ? "error" : "warn"
            log("HTTP", `${res.status} ${method} ${target} (${ms}ms)`, level)
            return res
        } catch (err) {
            const ms = Date.now() - start
            const aborted = (err as Error)?.name === "AbortError"
            const reason = (err as Error)?.message ?? safeString(err)
            log(
                "HTTP",
                `${aborted ? "ABORTED" : "FAILED"} ${method} ${target} (${ms}ms) ${reason}`,
                aborted ? "debug" : "error"
            )
            throw err
        }
    }) as typeof fetch
}

const CONSOLE_LEVELS: Record<string, LogLevel> = {
    log: "debug",
    info: "info",
    debug: "debug",
    warn: "warn",
    error: "error",
}

function installConsoleLogging(): void {
    const g = globalThis as unknown as { __ccConsolePatched?: boolean }
    if (g.__ccConsolePatched) return
    g.__ccConsolePatched = true
    const target = console as unknown as Record<string, (...args: unknown[]) => void>
    for (const method of Object.keys(CONSOLE_LEVELS)) {
        const original = target[method]
        if (typeof original !== "function") continue
        const level = CONSOLE_LEVELS[method]!
        target[method] = (...args: unknown[]) => {
            try {
                log("console", args.map((a) => (typeof a === "string" ? a : safeString(a))).join(" "), level)
            } catch {
                // ignore
            }
            original.apply(console, args)
        }
    }
}

let lifecycleInstalled = false

function installLifecycleLogging(): void {
    if (lifecycleInstalled) return
    lifecycleInstalled = true
    try {
        AppState.addEventListener("change", (state) => log("app", `state: ${state}`, "info"))
    } catch {
        // AppState unavailable (e.g. non-RN runtime)
    }
}

let errorsInstalled = false

function installErrorLogging(): void {
    if (errorsInstalled) return
    errorsInstalled = true
    const g = globalThis as unknown as {
        ErrorUtils?: {
            getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void
            setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void
        }
        addEventListener?: (type: string, listener: (event: unknown) => void) => void
    }
    if (g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === "function") {
        const prev = g.ErrorUtils.getGlobalHandler?.()
        g.ErrorUtils.setGlobalHandler((err: unknown, isFatal?: boolean) => {
            const e = err as { message?: string; stack?: string }
            log("error", `${isFatal ? "FATAL " : ""}${e?.message ?? safeString(err)}`, "error")
            if (e?.stack) log("error", e.stack, "error")
            if (typeof prev === "function") prev(err, isFatal)
        })
    }
    if (typeof g.addEventListener === "function") {
        try {
            g.addEventListener("unhandledrejection", (event: unknown) => {
                const reason = (event as { reason?: unknown })?.reason
                const e = reason as { message?: string }
                log("error", `Unhandled rejection: ${e?.message ?? safeString(reason)}`, "error")
            })
        } catch {
            // ignore
        }
    }
}

type AnyStore = {
    getState: () => Record<string, unknown>
    subscribe: (listener: (state: Record<string, unknown>, prev: Record<string, unknown>) => void) => () => void
}

const STORES: Array<[string, AnyStore]> = [
    ["auth", useAuth as unknown as AnyStore],
    ["connections", useConnections as unknown as AnyStore],
    ["sessions", useSessions as unknown as AnyStore],
    ["projects", useProjects as unknown as AnyStore],
    ["recents", useRecents as unknown as AnyStore],
    ["messages", useMessages as unknown as AnyStore],
    ["chat", useChatStore as unknown as AnyStore],
    ["models", useModels as unknown as AnyStore],
    ["agents", useAgents as unknown as AnyStore],
    ["permissions", usePermissions as unknown as AnyStore],
    ["questions", useQuestions as unknown as AnyStore],
    ["notifications", useNotifications as unknown as AnyStore],
    ["settings", useSettings as unknown as AnyStore],
    ["git", useGitStore as unknown as AnyStore],
    ["diff", useDiffStore as unknown as AnyStore],
    ["browser", useBrowserStore as unknown as AnyStore],
    ["paywall", usePaywall as unknown as AnyStore],
    ["opencode-stats", useOpencodeStats as unknown as AnyStore],
    ["quick-prompts", useQuickPromptsStore as unknown as AnyStore],
]

function shortValue(value: unknown): string {
    if (value === null || value === undefined) return ""
    const type = typeof value
    if (type === "number" || type === "boolean") return String(value)
    if (type === "string") {
        const s = value as string
        return JSON.stringify(s.length > 60 ? `${s.slice(0, 60)}…` : s)
    }
    return ""
}

let storesInstalled = false

function installStoreLogging(): void {
    if (storesInstalled) return
    storesInstalled = true
    for (const [name, store] of STORES) {
        const pending = new Set<string>()
        let timer: ReturnType<typeof setTimeout> | null = null
        const flush = () => {
            timer = null
            if (pending.size === 0) return
            const state = store.getState()
            const parts: string[] = []
            for (const key of pending) {
                const value = shortValue(state[key])
                parts.push(value ? `${key}=${value}` : key)
            }
            pending.clear()
            log(name, parts.join(", "), "debug")
        }
        try {
            store.subscribe((state, prev) => {
                let changed = false
                for (const key of Object.keys(state)) {
                    if (typeof state[key] === "function") continue
                    if (state[key] !== prev[key]) {
                        pending.add(key)
                        changed = true
                    }
                }
                if (!changed || timer) return
                timer = setTimeout(flush, STORE_LOG_WINDOW)
            })
        } catch {
            // ignore stores that cannot be subscribed to
        }
    }
}

/** Installs all automatic debug logging. Safe to call multiple times. */
export function installDebugLogging(): void {
    if (installed) return
    installed = true
    log("app", "Initializing app", "info")
    installFetchLogging()
    installConsoleLogging()
    installLifecycleLogging()
    installErrorLogging()
    installStoreLogging()
    log("app", "Debug logging installed", "debug")
}
