interface CodeViewerProps {
  code: string;
  startLine: number;
  file: string;
}

const CodeViewer = ({ code, startLine, file }: CodeViewerProps) => {
  const lines = code.split("\n");
  const lineStart = isNaN(startLine) ? 1 : startLine;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* File header */}
      <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground truncate">{file}</span>
        <span className="text-xs text-muted-foreground/50 ml-auto">Ln {lineStart}</span>
      </div>

      {/* Code lines */}
      <div className="overflow-x-auto">
        <pre className="text-xs leading-6 font-mono p-0">
          {lines.map((line, i) => {
            const lineNum = lineStart + i;
            const isHighlighted = line.includes("//") && (line.includes("WARNING") || line.includes("CRITICAL") || line.includes("should"));
            return (
              <div
                key={i}
                className={`flex ${isHighlighted ? "bg-severity-red/8" : "hover:bg-muted/20"}`}
              >
                <span className="w-12 shrink-0 text-right pr-3 py-0 select-none text-muted-foreground/40 border-r border-border">
                  {lineNum}
                </span>
                <span className={`px-3 py-0 flex-1 whitespace-pre ${isHighlighted ? "text-severity-yellow" : "text-foreground/90"}`}>
                  {line}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
};

export default CodeViewer;
