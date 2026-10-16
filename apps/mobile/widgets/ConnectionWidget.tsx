"use no memo";
import { FlexWidget, TextWidget } from "react-native-android-widget"
import type { ConnectionWidgetData } from "../lib/widget-data"
import {
  BarChart,
  COLORS,
  ConnectionStatusRow,
  formatCost,
  formatNumber,
  formatRelativeTime,
} from "./shared"

function configUri(widgetName: string, widgetId: number): string {
  return `crosscode://widget-config?widgetName=${encodeURIComponent(widgetName)}&widgetId=${widgetId}`
}

export default function ConnectionWidget(
  props: ConnectionWidgetData & { widgetName: string; widgetId: number }
) {
  if (!props.connectionId) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: configUri(props.widgetName, props.widgetId) }}
        style={{
          flexDirection: "column",
          padding: 14,
          backgroundColor: COLORS.bg,
          borderRadius: 16,
          flexGap: 8,
        }}
      >
        <TextWidget
          text="Choose a connection"
          style={{ color: COLORS.text, fontSize: 15, fontWeight: "bold" }}
        />
        <TextWidget
          text="Tap here to pick which connection this widget shows."
          style={{ color: COLORS.muted, fontSize: 12 }}
        />
      </FlexWidget>
    )
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        flexDirection: "column",
        padding: 14,
        backgroundColor: COLORS.bg,
        borderRadius: 16,
        flexGap: 10,
      }}
    >
      <ConnectionStatusRow
        name={props.connectionName}
        healthy={props.connectionHealthy}
        pendingQuestions={props.pendingQuestions}
      />

      {props.hasSession ? (
        <FlexWidget style={{ flexDirection: "column", flexGap: 2 }}>
          <TextWidget
            text={props.sessionTitle || "Untitled session"}
            style={{ color: COLORS.text, fontSize: 15, fontWeight: "bold" }}
            maxLines={1}
            truncate="END"
          />
          <TextWidget
            text={`${props.sessionAgent || "agent"} · ${formatRelativeTime(props.sessionUpdatedAt)}`}
            style={{ color: COLORS.muted, fontSize: 12 }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
      ) : (
        <TextWidget text="No active session" style={{ color: COLORS.muted, fontSize: 13 }} />
      )}

      <FlexWidget
        style={{
          flexDirection: "column",
          backgroundColor: COLORS.surface,
          borderRadius: 12,
          padding: 10,
          flexGap: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: "row", flexGap: 14 }}>
          <FlexWidget style={{ flexDirection: "column", flexGap: 2 }}>
            <TextWidget text="Today tokens" style={{ color: COLORS.muted, fontSize: 11 }} />
            <TextWidget
              text={`${formatNumber(props.todayInputTokens)} in · ${formatNumber(props.todayOutputTokens)} out`}
              style={{ color: COLORS.text, fontSize: 13, fontWeight: "bold" }}
            />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: "column", flexGap: 2 }}>
            <TextWidget text="Today cost" style={{ color: COLORS.muted, fontSize: 11 }} />
            <TextWidget
              text={formatCost(props.todayCost)}
              style={{ color: COLORS.text, fontSize: 13, fontWeight: "bold" }}
            />
          </FlexWidget>
        </FlexWidget>

        <BarChart values={props.weekOutputTokens} height={34} />
        <TextWidget text="Output tokens · last 7 days" style={{ color: COLORS.muted, fontSize: 10 }} />
      </FlexWidget>

      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: configUri(props.widgetName, props.widgetId) }}
        style={{ flexDirection: "row" }}
      >
        <TextWidget text="Change connection" style={{ color: COLORS.muted, fontSize: 11 }} />
      </FlexWidget>
    </FlexWidget>
  )
}
