import { registerWidgetTaskHandler, requestWidgetUpdate } from "react-native-android-widget"
import type { WidgetInfo } from "react-native-android-widget"
import {
  buildConnectionWidgetData,
  buildWidgetData,
  getWidgetConnectionId,
} from "@/lib/widget-data"
import SmallWidget from "@/widgets/SmallWidget"
import MediumWidget from "@/widgets/MediumWidget"
import LargeWidget from "@/widgets/LargeWidget"
import ConnectionWidget from "@/widgets/ConnectionWidget"

type AggregateData = Awaited<ReturnType<typeof buildWidgetData>>

function AggregateComponent(widgetName: string) {
  switch (widgetName) {
    case "MediumWidget":
      return MediumWidget
    case "LargeWidget":
      return LargeWidget
    default:
      return SmallWidget
  }
}

const AGGREGATE_WIDGETS = ["SmallWidget", "MediumWidget", "LargeWidget"]
const CONNECTION_WIDGETS = ["ConnectionWidget"]

let registered = false

export function registerCrossCodeWidgets() {
  if (registered) return
  registered = true

  registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, renderWidget }) => {
    if (widgetAction === "WIDGET_DELETED") return

    if ((CONNECTION_WIDGETS as string[]).includes(widgetInfo.widgetName)) {
      const connectionId = await getWidgetConnectionId(
        widgetInfo.widgetName,
        widgetInfo.widgetId
      ).catch(() => null)
      const data = await buildConnectionWidgetData(connectionId)
      renderWidget(
        (
          <ConnectionWidget
            {...data}
            widgetName={widgetInfo.widgetName}
            widgetId={widgetInfo.widgetId}
          />
        ) as never
      )
      return
    }

    if (!(AGGREGATE_WIDGETS as string[]).includes(widgetInfo.widgetName)) return
    const Component = AggregateComponent(widgetInfo.widgetName)
    const data = await buildWidgetData()
    renderWidget(<Component {...(data as AggregateData)} /> as never)
  })
}

async function renderAggregateWidget(info: WidgetInfo) {
  const Component = AggregateComponent(info.widgetName)
  const data = await buildWidgetData()
  return <Component {...(data as AggregateData)} /> as never
}

async function renderConnectionWidget(info: WidgetInfo) {
  const connectionId = await getWidgetConnectionId(info.widgetName, info.widgetId).catch(
    () => null
  )
  const data = await buildConnectionWidgetData(connectionId)
  return (
    <ConnectionWidget {...data} widgetName={info.widgetName} widgetId={info.widgetId} />
  ) as never
}

export async function refreshWidgets() {
  await Promise.all(
    [...AGGREGATE_WIDGETS, ...CONNECTION_WIDGETS].map((name) =>
      requestWidgetUpdate({
        widgetName: name,
        renderWidget: (info) =>
          (CONNECTION_WIDGETS as string[]).includes(name)
            ? renderConnectionWidget(info)
            : renderAggregateWidget(info),
      }).catch(() => {})
    )
  )
}

export async function refreshConnectionWidgets() {
  await Promise.all(
    CONNECTION_WIDGETS.map((name) =>
      requestWidgetUpdate({
        widgetName: name,
        renderWidget: renderConnectionWidget,
      }).catch(() => {})
    )
  )
}
