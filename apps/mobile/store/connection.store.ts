import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { secureStorage } from "../lib/secure-storage"
import { clearAuthCache } from "../lib/utils"

const uid = () => {
    try {
        const c = globalThis.crypto as Crypto | undefined
        if (c && typeof c.randomUUID === "function") return c.randomUUID()
    } catch {}
    return `${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

export type Connection = {
    id: string
    url: string
    token: string
    name: string
    added: number
    healthy?: boolean | null
    // Detected opencode API major (1 = classic paths, 2 = /api/* paths).
    // Unknown means v1 so old CLIs keep working untouched.
    serverVersion?: 1 | 2 | null
}

type ConnectionStore = {
    connections: Connection[]
    /**
     * @deprecated No selected-connection concept anymore. Kept as a
     * last-used fallback for legacy deep links / not-yet-migrated screens.
     * New code must resolve the connection from route params or
     * `project.connectionId` instead.
     */
    current: string | null
    addConnection: (con: Omit<Connection, "id" | "added" | "healthy">) => string
    removeConnection: (id: string) => void
    updateConnection: (id: string, updates: Partial<Omit<Connection, "id" | "added">>) => void
    setCurrent: (id: string) => void
    setConnectionHealth: (id: string, healthy: boolean) => void
}

export const useConnections = create<ConnectionStore>()(
    persist(
        (set, get) => ({
            connections: [],
            current: null,
            addConnection: (con) => {
                const existing = get().connections.find((c) => c.url === con.url)
                if (existing) {
                    if (existing.token !== con.token) clearAuthCache(existing.token)
                    set((state) => ({
                        connections: state.connections.map((c) =>
                            c.id === existing.id ? { ...c, ...con } : c
                        ),
                        current: existing.id,
                    }))
                    return existing.id
                }
                const newCon = { ...con, id: uid(), added: Date.now(), healthy: null }
                set((state) => ({
                    connections: [...state.connections, newCon],
                    current: newCon.id,
                }))
                return newCon.id
            },
            removeConnection: (id) => {
                const conn = get().connections.find((c) => c.id === id)
                if (conn) clearAuthCache(conn.token)
                set((state) => ({
                    connections: state.connections.filter((c) => c.id !== id),
                    current: state.current === id ? null : state.current,
                }))
            },
            updateConnection: (id, updates) =>
                set((state) => ({
                    connections: state.connections.map((c) =>
                        c.id === id ? { ...c, ...updates } : c
                    ),
                })),
            setCurrent: (id) => set({ current: id }),
            setConnectionHealth: (id, healthy) =>
                set((state) => {
                    const conn = state.connections.find((c) => c.id === id)
                    if (conn && conn.healthy === healthy) return state
                    return {
                        connections: state.connections.map((c) =>
                            c.id === id ? { ...c, healthy } : c
                        ),
                    }
                }),
        }),
        {
            name: "crosscode-connections",
            storage: createJSONStorage(() => secureStorage),
            partialize: (state) => ({
                connections: state.connections.map(({ healthy, ...rest }) => rest),
                current: state.current,
            }),
        }
    )
)