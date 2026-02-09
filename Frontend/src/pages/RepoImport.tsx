import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitBranch, ArrowLeft, Lock, Loader2, Check, Copy, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";

const steps = [
  { label: "Cloning", description: "Fetching repository..." },
  { label: "Indexing", description: "Building file index..." },
  { label: "RLM Context Map", description: "Mapping dependencies with RLM..." },
  { label: "Analysis Complete", description: "Ready to explore!" },
];

const RepoImport = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [progress, setProgress] = useState(0);

  const isValidUrl = url.match(/^https?:\/\/github\.com\/.+\/.+/);

  const startAnalysis = () => {
    setAnalyzing(true);
    setCurrentStep(0);
    setProgress(0);
  };

  useEffect(() => {
    if (!analyzing) return;
    const stepDurations = [1500, 2000, 2500, 500];
    let totalElapsed = 0;

    const timers: ReturnType<typeof setTimeout>[] = [];
    stepDurations.forEach((duration, i) => {
      totalElapsed += duration;
      timers.push(setTimeout(() => {
        setCurrentStep(i + 1);
        setProgress(((i + 1) / steps.length) * 100);
        if (i === steps.length - 1) {
          setTimeout(() => navigate("/dashboard"), 800);
        }
      }, totalElapsed));
    });

    // Animate progress smoothly
    const progressInterval = setInterval(() => {
      setProgress(p => {
        const target = ((currentStep + 1) / steps.length) * 100;
        if (p >= target) return p;
        return Math.min(p + 0.5, target);
      });
    }, 50);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(progressInterval);
    };
  }, [analyzing]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold">ContextGraph</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {!analyzing ? (
            <>
              <h1 className="text-2xl font-display font-bold text-foreground mb-2">Open a repository</h1>
              <p className="text-sm text-muted-foreground mb-8">
                Paste a GitHub repo URL. We clone and analyze it securely.
              </p>

              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="https://github.com/org/repo"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="h-12 font-mono text-sm bg-card border-border"
                  />
                  {url && !isValidUrl && (
                    <p className="text-xs text-destructive mt-1.5">Enter a valid GitHub URL</p>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Private repo</span>
                  </div>
                  <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                </div>
                {isPrivate && (
                  <p className="text-xs text-muted-foreground pl-1">
                    Requires additional GitHub permissions.
                  </p>
                )}

                <Button
                  variant="glow"
                  size="lg"
                  className="w-full h-12 font-medium"
                  disabled={!isValidUrl}
                  onClick={startAnalysis}
                >
                  Clone & Analyze
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground mb-1">Analyzing repository</h2>
                <p className="text-sm text-muted-foreground font-mono">{url}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "hsl(var(--primary))" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {steps.map((step, i) => {
                  const isComplete = currentStep > i;
                  const isCurrent = currentStep === i;
                  return (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isComplete ? "border-severity-green/30 bg-severity-green/5" :
                        isCurrent ? "border-primary/40 bg-primary/5" :
                        "border-border bg-card"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                        isComplete ? "bg-severity-green/20 text-severity-green" :
                        isCurrent ? "bg-primary/20 text-primary" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {isComplete ? <Check className="w-3.5 h-3.5" /> :
                         isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                         <span>{i + 1}</span>}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isComplete || isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RepoImport;
