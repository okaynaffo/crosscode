import { useConnections } from "@/store/connection.store"
import { useProjects } from "@/store/projects.store"

/**
 * Resolve the connection that owns a project.
 *
 * Multi-connection: every project records `connectionId`, so screens under
 * `/project/[projectId]/...` must use the owning connection — not a global
 * "current"/selected connection. Falls back to the legacy `current` id for
 * deep links / screens that don't know their project yet.
 */
export function useProjectConnection(projectId?: string | null) {
    const connections = useConnections((s) => s.connections)
    const current = useConnections((s) => s.current)
    const project = useProjects((s) =>
        projectId ? (s.projects.find((p) => p.id === projectId) ?? null) : null
    )
    const connection =
        connections.find((c) => c.id === (project?.connectionId ?? current)) ?? null
    return { project, connection }
}
