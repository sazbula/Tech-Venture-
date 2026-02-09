import type { Severity } from "@/data/types";
import { severityLabel } from "@/data/types";

interface GraphLegendProps {
  counts: Record<Severity, number>;
}

const items: { severity: Severity; dot: string }[] = [
  { severity: "green", dot: "severity-dot-green" },
  { severity: "yellow", dot: "severity-dot-yellow" },
  { severity: "orange", dot: "severity-dot-orange" },
  { severity: "red", dot: "severity-dot-red" },
  { severity: "purple", dot: "severity-dot-purple" },
  { severity: "gray", dot: "severity-dot-gray" },
];

const GraphLegend = ({ counts }: GraphLegendProps) => (
  <div className="absolute bottom-4 left-4 z-20 bg-card/90 backdrop-blur border border-border rounded-lg p-3">
    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Legend</p>
    <div className="space-y-1.5">
      {items.map(({ severity, dot }) => (
        <div key={severity} className="flex items-center gap-2 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
          <span className="text-foreground/80">{severityLabel[severity]}</span>
          <span className="text-muted-foreground ml-auto tabular-nums">{counts[severity]}</span>
        </div>
      ))}
    </div>
  </div>
);

export default GraphLegend;
