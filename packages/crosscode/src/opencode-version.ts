import { spawnCmd } from "./util"

export type OpencodeMajor = 1 | 2

let cached: { bin: string; major: OpencodeMajor } | null = null

export function getCachedOpencodeMajor(): OpencodeMajor | null {
    return cached?.major ?? null
}

function parseMajor(output: string): OpencodeMajor {
    const match = output.match(/(\d+)\.\d+\.\d+/)
    if (match && parseInt(match[1], 10) >= 2) return 2
    return 1
}

// `opencode --version` prints e.g. "1.15.7" (v1) or "opencode v2.0.6" (v2).
// Defaults to 1 when the binary is missing or the output is unrecognized,
// so old setups keep working.
export function detectOpencodeMajor(bin = "opencode"): Promise<OpencodeMajor> {
    if (cached && cached.bin === bin) return Promise.resolve(cached.major)
    return new Promise((resolve) => {
        const proc = spawnCmd(bin, ["--version"], { timeout: 8000, stdio: ["ignore", "pipe", "pipe"] })
        let stdout = ""
        let stderr = ""
        proc.stdout?.on("data", data => { stdout += data.toString() })
        proc.stderr?.on("data", data => { stderr += data.toString() })
        proc.once("error", () => resolve(1))
        proc.once("close", code => {
            const major = parseMajor(code === 0 ? stdout + stderr : "")
            cached = { bin, major }
            resolve(major)
        })
    })
}
