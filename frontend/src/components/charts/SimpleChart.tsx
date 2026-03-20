import ReactECharts from "echarts-for-react";

export function SimpleChart({ option, height = 320 }: { option: Record<string, unknown>; height?: number }) {
  return <ReactECharts option={option} style={{ height }} />;
}
