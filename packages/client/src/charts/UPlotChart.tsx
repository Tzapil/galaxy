import { useEffect, useRef, type ReactElement } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export interface PlotSeries {
  readonly label: string;
  readonly values: readonly number[];
  readonly color: string;
}

export function UPlotChart({
  ticks,
  series,
  height = 260
}: {
  readonly ticks: readonly number[];
  readonly series: readonly PlotSeries[];
  readonly height?: number;
}): ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = host.current;
    if (element === null || ticks.length === 0) return;
    const data: uPlot.AlignedData = [
      ticks as number[],
      ...series.map((item) => item.values as number[])
    ];
    const plot = new uPlot(
      {
        width: Math.max(320, element.clientWidth),
        height,
        cursor: { drag: { x: true, y: false, setScale: true } },
        scales: { x: { time: false } },
        axes: [
          { stroke: "#7890aa", grid: { stroke: "#1e2d40" }, label: "simulation tick" },
          { stroke: "#7890aa", grid: { stroke: "#1e2d40" } }
        ],
        series: [
          {},
          ...series.map((item) => ({
            label: item.label,
            stroke: item.color,
            width: 1.5,
            points: { show: false }
          }))
        ]
      },
      data,
      element
    );
    const observer = new ResizeObserver(() => {
      plot.setSize({ width: Math.max(320, element.clientWidth), height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      plot.destroy();
    };
  }, [height, series, ticks]);
  return <div className="uplot-host" ref={host} />;
}
