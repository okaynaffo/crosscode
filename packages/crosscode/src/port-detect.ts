import { ChildProcess, execFile } from "child_process"
import http from "http"

const PORT_PATTERNS = [
    /opencode server listening on \S*?:(\d+)/i,
    // v2 prints "server listening on http://127.0.0.1:PORT" (no "opencode" prefix)
    /server listening on \S*?:(\d+)/i,
    /listening on (?:https?:\/\/)?[^\s"']*?:(\d+)/i,
]

function probePort(port: number, healthPath: string, sessionToken?: string): Promise<boolean> {
    return new Promise((resolve) => {
        const headers = sessionToken ? {
            Authorization: `Basic ${Buffer.from(`opencode:${sessionToken}`).toString("base64")}`,
        } : undefined
        const req = http.get({ host: "127.0.0.1", port, path: healthPath, headers, timeout: 700 }, (res) => {
            res.resume()
            resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300)
        })
        req.on("timeout", () => {
            req.destroy()
            resolve(false)
        })
        req.on("error", () => resolve(false))
    })
}

function execAsync(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
        execFile(cmd, args, { encoding: "utf8", timeout: 5000 }, (err, stdout) => {
            resolve(err ? "" : stdout)
        })
    })
}

async function getListeningPorts(pid?: number): Promise<number[]> {
    if (!pid) return []
    try {
        if (process.platform === "win32") {
            const out = await execAsync("netstat", ["-ano"])
            const ports: number[] = []
            for (const line of out.split("\n")) {
                const cols = line.trim().split(/\s+/)
                if (cols.length >= 5 && cols[0] === "TCP" && cols[3] === "LISTENING" && cols[4] === String(pid)) {
                    const m = cols[1].match(/:(\d+)$/)
                    if (m) ports.push(parseInt(m[1], 10))
                }
            }
            return [...new Set(ports)]
        }
        const out = await execAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", String(pid)])
        const ports: number[] = []
        for (const match of out.matchAll(/:(\d+)\s+\(LISTEN\)/g)) {
            ports.push(parseInt(match[1], 10))
        }
        if (ports.length > 0) return [...new Set(ports)]
    } catch {}
    try {
        if (process.platform === "linux") {
            const out = await execAsync("ss", ["-tlnp"])
            const ports: number[] = []
            for (const line of out.split("\n")) {
                if (!line.includes(`pid=${pid},`)) continue
                const m = line.match(/:(\d+)\s/)
                if (m) ports.push(parseInt(m[1], 10))
            }
            return [...new Set(ports)]
        }
    } catch {}
    return []
}

export function waitForOpencodePort(opts: {
    proc: ChildProcess
    requestedPort: number
    healthPath?: string
    sessionToken?: string
    onData?: (data: Buffer) => void
    timeoutMs?: number
}): Promise<number> {
    const { proc, requestedPort, healthPath = "/global/health", sessionToken, onData, timeoutMs = 15_000 } = opts

    let buffer = ""
    let resolved = false
    let probing = false

    const collect = (data: Buffer) => {
        if (onData) onData(data)
        if (!resolved) buffer += data.toString()
    }
    proc.stdout?.on("data", collect)
    proc.stderr?.on("data", collect)

    const fromLogs = (): number | null => {
        for (const pattern of PORT_PATTERNS) {
            const match = buffer.match(pattern)
            if (match) return parseInt(match[1], 10)
        }
        return null
    }

    return new Promise<number>((resolve, reject) => {
        const cleanup = () => {
            clearInterval(interval)
            clearTimeout(timeout)
            proc.removeListener("exit", onExit)
            proc.removeListener("error", onError)
        }
        const finish = (port: number) => {
            if (resolved) return
            resolved = true
            cleanup()
            resolve(port)
        }
        const fail = (err: Error) => {
            if (resolved) return
            resolved = true
            cleanup()
            reject(err)
        }
        const onExit = (code: number | null) => {
            fail(new Error(`opencode exited with code ${code} before the server was ready`))
        }
        const onError = (err: Error) => {
            fail(new Error(`Failed to start opencode serve: ${err.message}`))
        }

        const interval = setInterval(async () => {
            if (resolved || probing) return
            probing = true
            const logged = fromLogs()
            const candidate = logged ?? requestedPort
            const alive = await probePort(candidate, healthPath, sessionToken)
            probing = false
            if (alive) finish(candidate)
        }, 250)

        const timeout = setTimeout(async () => {
            // Never hand back a dead port: verify each candidate with the
            // version-correct health endpoint first. Handing back an
            // unverified port is what produced a scannable-but-dead QR
            // in #128.
            const logged = fromLogs()
            if (logged && await probePort(logged, healthPath, sessionToken)) return finish(logged)
            if (resolved) return
            const ports = (await getListeningPorts(proc.pid)).filter((p) => p > 0 && p <= 65535)
            for (const p of ports) {
                if (resolved) return
                if (await probePort(p, healthPath, sessionToken)) return finish(p)
            }
            if (await probePort(requestedPort, healthPath, sessionToken)) return finish(requestedPort)
            fail(new Error(`Timed out waiting for opencode to become ready on port ${logged ?? requestedPort}`))
        }, timeoutMs)

        proc.once("exit", onExit)
        proc.once("error", onError)
        if (proc.exitCode !== null || proc.signalCode !== null) onExit(proc.exitCode)
    })
}
