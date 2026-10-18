import * as React from "react"
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useColorScheme } from "nativewind"
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left"
import Check from "lucide-react-native/dist/esm/icons/check"
import Wifi from "lucide-react-native/dist/esm/icons/wifi"
import WifiOff from "lucide-react-native/dist/esm/icons/wifi-off"

import { Text } from "@/components/ui/text"
import { THEME } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { useConnections } from "@/store/connection.store"
import { setWidgetConnectionId } from "@/lib/widget-data"
import { refreshConnectionWidgets } from "@/lib/widget-task"

export default function WidgetConfigScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const theme = colorScheme ?? "light"
  const { widgetName, widgetId } = useLocalSearchParams<{
    widgetName?: string
    widgetId?: string
  }>()
  const connections = useConnections((s) => s.connections)

  const parsedWidgetId = Number(widgetId)
  const canSave =
    typeof widgetName === "string" &&
    widgetName.length > 0 &&
    Number.isFinite(parsedWidgetId)

  const [savingId, setSavingId] = React.useState<string | null>(null)

  const handleSelect = React.useCallback(
    async (connectionId: string) => {
      if (!canSave || savingId) return
      setSavingId(connectionId)
      try {
        await setWidgetConnectionId(widgetName as string, parsedWidgetId, connectionId)
        await refreshConnectionWidgets().catch(() => undefined)
      } finally {
        setSavingId(null)
      }
      router.back()
    },
    [canSave, parsedWidgetId, router, savingId, widgetName]
  )

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-4 pb-3 gap-1">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={22} color={THEME[theme].foreground} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-semibold tracking-tight">Widget connection</Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              Choose which connection this widget shows
            </Text>
          </View>
        </View>
      </View>

      {!canSave ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm text-muted-foreground text-center">
            Open this screen by tapping a connection widget on your home screen.
          </Text>
        </View>
      ) : connections.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm text-muted-foreground text-center">
            No connections yet. Add one first, then pick it here.
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
          {connections.map((c) => {
            const unreachable = c.healthy === false
            const checking = c.healthy == null
            const saving = savingId === c.id
            return (
              <Pressable
                key={c.id}
                onPress={() => handleSelect(c.id)}
                disabled={savingId !== null}
                className={cn(
                  "flex-row items-center gap-3 rounded-xl p-4",
                  unreachable
                    ? "bg-muted/30 active:bg-muted/50"
                    : "bg-muted/50 border border-border active:bg-muted/70"
                )}
                style={unreachable ? { opacity: 0.6 } : undefined}
              >
                <View
                  className={cn(
                    "w-10 h-10 rounded-xl items-center justify-center",
                    unreachable
                      ? "bg-destructive/15"
                      : checking
                        ? "bg-muted"
                        : "bg-green-500/20"
                  )}
                >
                  {unreachable ? (
                    <WifiOff size={18} color={THEME[theme].destructive} />
                  ) : (
                    <Wifi
                      size={18}
                      color={checking ? THEME[theme].mutedForeground : THEME[theme].foreground}
                    />
                  )}
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="font-semibold text-sm">{c.name}</Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {c.url.replace(/^https?:\/\//, "")}
                  </Text>
                </View>
                {saving ? (
                  <ActivityIndicator size="small" color={THEME[theme].mutedForeground} />
                ) : unreachable ? (
                  <View className="px-2 py-0.5 rounded-full bg-destructive/10">
                    <Text className="text-[10px] font-medium text-destructive">Unreachable</Text>
                  </View>
                ) : checking ? (
                  <View className="px-2 py-0.5 rounded-full bg-muted">
                    <Text className="text-[10px] font-medium text-muted-foreground">Checking…</Text>
                  </View>
                ) : (
                  <View className="px-2 py-0.5 rounded-full bg-green-500/15">
                    <Text className="text-[10px] font-medium text-green-500">Connected</Text>
                  </View>
                )}
                <Check size={18} color={THEME[theme].mutedForeground} />
              </Pressable>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}
