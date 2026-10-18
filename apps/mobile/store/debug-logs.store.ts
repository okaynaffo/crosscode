import { create } from "zustand"

export type LogLevel = "debug" | "info" | "warn" | "error"

export type DebugLogEntry = {
    id: number
    time: number
    total: number
    delta: number
    tag: string
    message: string
    level: LogLevel
}

const MAX_ENTRIES = 1000

type DebugLogsStore = {
    entries: DebugLogEntry[]
    max: number
    add: (entry: DebugLogEntry) => void
    clear: () => void
}

export const useDebugLogs = create<DebugLogsStore>((set) => ({
    entries: [],
    max: MAX_ENTRIES,
    add: (entry) =>
        set((state) => {
            const overflow = state.entries.length - state.max + 1
            const entries = overflow > 0 ? state.entries.slice(overflow) : state.entries.slice()
            entries.push(entry)
            return { entries }
        }),
    clear: () => set({ entries: [] }),
}))
