import * as React from "react"
import { FlatList, Pressable, Share, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Clipboard from "expo-clipboard"
import { useRouter } from "expo-router"
import { useColorScheme } from "nativewind"

import { Text } from "@/components/ui/text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left"
import Search from "lucide-react-native/dist/esm/icons/search"
import Funnel from "lucide-react-native/dist/esm/icons/funnel"
import Copy from "lucide-react-native/dist/esm/icons/copy"
import Check from "lucide-react-native/dist/esm/icons/check"
import ShareIcon from "lucide-react-native/dist/esm/icons/share"
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2"
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down"
import X from "lucide-react-native/dist/esm/icons/x"

import { THEME } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { useDebugLogs, type DebugLogEntry, type LogLevel } from "@/store/debug-logs.store"

type LevelFilter = "all" | LogLevel

const LEVEL_FILTERS: { key: LevelFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "debug", label: "Debug" },
  { key: "info", label: "Info" },
  { key: "warn", label: "Warn" },
  { key: "error", label: "Error" },
]

function levelColor(theme: "light" | "dark", level: LogLevel): string {
  switch (level) {
    case "error":
      return THEME[theme].destructive
    case "warn":
      return "#f59e0b"
    case "info":
      return THEME[theme].foreground
    default:
      return THEME[theme].mutedForeground
  }
}

function formatTimestamp(entry: DebugLogEntry): string {
  const iso = new Date(entry.time).toISOString()
  return `${iso} Σ:${entry.total.toFixed(3)}s, Δ:${entry.delta.toFixed(3)}s`
}

function formatEntry(entry: DebugLogEntry): string {
  return `${formatTimestamp(entry)}\n[${entry.tag}]: ${entry.message}`
}

const LogRow = React.memo(function LogRow({
  entry,
  theme,
}: {
  entry: DebugLogEntry
  theme: "light" | "dark"
}) {
  return (
    <View className="px-4 py-2">
      <Text className="font-mono text-[11px] leading-4 text-muted-foreground">
        {formatTimestamp(entry)}
      </Text>
      <Text className="font-mono text-[12px] leading-5" style={{ color: levelColor(theme, entry.level) }}>
        <Text className="font-mono text-[12px] font-semibold text-primary">{`[${entry.tag}]`}</Text>
        {`: ${entry.message}`}
      </Text>
    </View>
  )
})

export default function DebugLogsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const theme = useColorScheme().colorScheme ?? "dark"

  const entries = useDebugLogs((s) => s.entries)
  const clear = useDebugLogs((s) => s.clear)

  const [query, setQuery] = React.useState("")
  const [useRegex, setUseRegex] = React.useState(true)
  const [caseSensitive, setCaseSensitive] = React.useState(false)
  const [level, setLevel] = React.useState<LevelFilter>("all")
  const [showOptions, setShowOptions] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const listRef = React.useRef<FlatList<DebugLogEntry>>(null)
  const atBottomRef = React.useRef(true)
  const [atBottom, setAtBottom] = React.useState(true)

  const matcher = React.useMemo(() => {
    const q = query.trim()
    if (!q) return null
    if (useRegex) {
      try {
        const re = new RegExp(q, caseSensitive ? "" : "i")
        return (text: string) => re.test(text)
      } catch {
        return "invalid" as const
      }
    }
    const needle = caseSensitive ? q : q.toLowerCase()
    return (text: string) => (caseSensitive ? text : text.toLowerCase()).includes(needle)
  }, [query, useRegex, caseSensitive])

  const filtered = React.useMemo(() => {
    const byLevel = level === "all" ? entries : entries.filter((e) => e.level === level)
    if (!matcher || matcher === "invalid") return byLevel
    return byLevel.filter((e) => matcher(`[${e.tag}]: ${e.message}`))
  }, [entries, level, matcher])

  const scrollToBottom = React.useCallback((animated = true) => {
    atBottomRef.current = true
    setAtBottom(true)
    listRef.current?.scrollToEnd({ animated })
  }, [])

  React.useEffect(() => {
    if (atBottomRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    }
  }, [filtered.length])

  const handleScroll = React.useCallback((event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const next = contentOffset.y + layoutMeasurement.height >= contentSize.height - 24
    atBottomRef.current = next
    setAtBottom((prev) => (prev === next ? prev : next))
  }, [])

  const copyAll = React.useCallback(async () => {
    const text = filtered.map(formatEntry).join("\n\n")
    if (!text) return
    await Clipboard.setStringAsync(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [filtered])

  const shareAll = React.useCallback(async () => {
    const text = filtered.map(formatEntry).join("\n\n")
    if (!text) return
    try {
      await Share.share({ message: text })
    } catch {
      // user dismissed
    }
  }, [filtered])

  const clearAll = React.useCallback(() => {
    clear()
  }, [clear])

  const headerActions = (
    <View className="flex-row items-center">
      <Button variant="ghost" size="icon" onPress={copyAll} disabled={filtered.length === 0}>
        {copied ? (
          <Check size={20} color={THEME[theme].primary} />
        ) : (
          <Copy size={20} color={THEME[theme].foreground} />
        )}
      </Button>
      <Button variant="ghost" size="icon" onPress={shareAll} disabled={filtered.length === 0}>
        <ShareIcon size={20} color={THEME[theme].foreground} />
      </Button>
      <Button variant="ghost" size="icon" onPress={clearAll} disabled={entries.length === 0}>
        <Trash2 size={20} color={THEME[theme].destructive} />
      </Button>
    </View>
  )

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 p-4">
        <Button variant="ghost" className="w-10 h-10" onPress={() => router.back()}>
          <ArrowLeft size={25} color={THEME[theme].foreground} />
        </Button>
        <Text className="text-2xl font-semibold tracking-tight">Debug Logs</Text>
        <View className="flex-1" />
        {headerActions}
      </View>

      <View className="px-4 pb-3 gap-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 relative justify-center">
            <View className="absolute left-3 z-10">
              <Search size={16} color={THEME[theme].mutedForeground} />
            </View>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Filter (regex)"
              autoCapitalize="none"
              autoCorrect={false}
              className="pl-9 pr-9"
              placeholderTextColor={THEME[theme].mutedForeground}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={10}
                className="absolute right-3 z-10 active:opacity-60"
              >
                <X size={16} color={THEME[theme].mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Button
            variant={showOptions ? "secondary" : "ghost"}
            size="icon"
            onPress={() => setShowOptions((v) => !v)}
          >
            <Funnel size={18} color={THEME[theme].foreground} />
          </Button>
        </View>

        {showOptions ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <FilterChip
              active={useRegex}
              label="Regex"
              theme={theme}
              onPress={() => setUseRegex((v) => !v)}
            />
            <FilterChip
              active={caseSensitive}
              label="Aa"
              theme={theme}
              onPress={() => setCaseSensitive((v) => !v)}
            />
          </View>
        ) : null}

        <View className="flex-row flex-wrap items-center gap-1.5">
          {LEVEL_FILTERS.map((option) => (
            <FilterChip
              key={option.key}
              active={level === option.key}
              label={option.label}
              theme={theme}
              onPress={() => setLevel(option.key)}
            />
          ))}
          <View className="flex-1" />
          <Text className="text-[11px] text-muted-foreground">
            {filtered.length === entries.length
              ? `${entries.length} entries`
              : `${filtered.length} / ${entries.length}`}
          </Text>
        </View>

        {matcher === "invalid" ? (
          <Text className="text-xs text-destructive">Invalid regular expression</Text>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <LogRow entry={item} theme={theme} />}
        onScroll={handleScroll}
        scrollEventThrottle={64}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View className="items-center gap-2 px-8 pt-16">
            <Text className="text-sm text-muted-foreground text-center">
              {entries.length === 0
                ? "No activity recorded yet."
                : "No entries match the current filter."}
            </Text>
          </View>
        }
      />

      {!atBottom && filtered.length > 0 ? (
        <Pressable
          onPress={() => scrollToBottom()}
          className="absolute self-center bottom-6 flex-row items-center gap-1.5 rounded-full bg-primary px-4 py-2 active:opacity-80"
          style={{ bottom: insets.bottom + 20 }}
        >
          <ChevronDown size={16} color={THEME[theme].primaryForeground} />
          <Text className="text-xs font-medium text-primary-foreground">Latest</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function FilterChip({
  active,
  label,
  theme,
  onPress,
}: {
  active: boolean
  label: string
  theme: "light" | "dark"
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "rounded-full border px-3 py-1 active:opacity-70",
        active ? "border-primary bg-primary/10" : "border-border bg-transparent"
      )}
    >
      <Text
        className={cn("text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}
        style={label === "Aa" ? { color: active ? THEME[theme].primary : THEME[theme].mutedForeground } : undefined}
      >
        {label}
      </Text>
    </Pressable>
  )
}
