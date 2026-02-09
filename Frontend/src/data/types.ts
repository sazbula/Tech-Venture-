export type Severity = "green" | "yellow" | "orange" | "red" | "purple" | "gray";

export const severityLabel: Record<Severity, string> = {
  green: "No issues",
  yellow: "Low risk",
  orange: "Medium risk",
  red: "High risk",
  purple: "Critical",
  gray: "Not analyzed",
};

export const severityColor: Record<Severity, string> = {
  green: "severity-green",
  yellow: "severity-yellow",
  orange: "severity-orange",
  red: "severity-red",
  purple: "severity-purple",
  gray: "severity-gray",
};
