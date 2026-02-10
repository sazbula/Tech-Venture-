import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Lock, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/layout/AppHeader";
import { analyzeRepo, analyzeLocalRepo } from "@/services/api";

const steps = [
  { label: "Cloning", description: "Fetching repository..." },
  { label: "Building Graph", description: "Mapping dependencies..." },
  { label: "RLM Analysis", description: "AI-powered code review..." },
  { label: "Complete", description: "Ready to explore!" },
];

const RepoImport = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [repoName, setRepoName] = useState("");
  const analysisStarted = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isValidUrl = url.match(/^(https?:\/\/)?(www\.)?github\.com\/.+\/.+/);

  const loadDemoRepo = () => {
    // Load the existing demo repo directly without analyzing
    localStorage.setItem("currentRepo", "demo_repo");
    localStorage.setItem("rlmInProgress", "false");
    navigate("/dashboard");
  };

  const startLiveDemoAnalysis = async () => {
    // Run live analysis on demo_repo
    if (analysisStarted.current) return;
    analysisStarted.current = true;

    setAnalyzing(true);
    setCurrentStep(0);
    setProgress(10);
    setError(null);
    setStatusText("Connecting to analysis stream...");
    setRepoName("demo_repo");

    try {
      // Connect to SSE first and wait for connection to establish
      const sseReady = new Promise<void>((resolve) => {
        connectSSE("demo_repo", () => {
          setStatusText("Starting live demo analysis...");
          resolve();
        });
      });

      // Wait for SSE to be ready before triggering analysis
      await sseReady;

      // Small delay to ensure SSE connection is fully established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Trigger local repo analysis - events will now be captured
      await analyzeLocalRepo("demo_repo", false, true);

      // Navigation happens when batch_start event fires
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalyzing(false);
      setCurrentStep(-1);
      setProgress(0);
      analysisStarted.current = false;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  const connectSSE = (repoName: string, onConnected?: () => void) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const API_BASE = "http://localhost:8000";
    eventSourceRef.current = new EventSource(`${API_BASE}/rlm/stream/${repoName}`);

    eventSourceRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE Progress:", data);

        // Update progress based on event type
        switch (data.type) {
          case "connected":
            setStatusText("Connected to analysis stream");
            // Notify that connection is ready
            if (onConnected) {
              onConnected();
            }
            break;

          case "graph_building":
            setCurrentStep(1);
            setProgress(33);
            setStatusText("Building code dependency graph...");
            break;

          case "graph_complete":
            setCurrentStep(1);
            setProgress(50);
            setStatusText(`Graph built: ${data.nodes} nodes, ${data.edges} edges`);

            // Navigate to dashboard immediately - graph is ready to display
            const currentRepoName = repoName || (url ? url.split('/').pop()?.replace('.git', '') : '') || '';
            localStorage.setItem("currentRepo", currentRepoName);
            localStorage.setItem("rlmInProgress", "true");
            setTimeout(() => {
              navigate("/dashboard");
            }, 800);
            break;

          case "collecting_files":
            setProgress(55);
            setStatusText("Collecting Python files...");
            break;

          case "files_collected":
            setCurrentStep(2);
            setProgress(60);
            setStatusText(`Found ${data.file_count} Python files`);
            break;

          case "rlm_started":
            setCurrentStep(2);
            setProgress(65);
            setStatusText("AI analysis starting...");
            break;

          case "batch_start":
            setProgress(70);
            setStatusText(`Analyzing code batch ${data.batch || 1}...`);
            break;

          case "batch_complete":
            // Only update progress if we haven't navigated yet
            const batchProgress = 70 + (data.batch / data.total_batches) * 25;
            setProgress(batchProgress);
            setStatusText(`Batch ${data.batch}/${data.total_batches} complete - ${data.summary?.total_issues || 0} issues found`);
            break;

          case "analysis_complete":
            setCurrentStep(3);
            setProgress(100);
            setStatusText(`Analysis complete! Found ${data.issues_found} issues`);

            // Mark RLM as complete
            localStorage.setItem("rlmInProgress", "false");

            // Close SSE connection
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
            break;

          case "stream_end":
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
            break;
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSourceRef.current.onerror = (error) => {
      console.error("SSE error:", error);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  };

  const startAnalysis = async () => {
    if (analysisStarted.current) return;
    analysisStarted.current = true;

    setAnalyzing(true);
    setCurrentStep(0);
    setProgress(10);
    setError(null);
    setStatusText("Connecting to analysis stream...");

    try {
      // Normalize URL: ensure https:// prefix for the backend
      let normalizedUrl = url.trim();
      if (!normalizedUrl.match(/^https?:\/\//)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      // Extract repo name for SSE
      const urlParts = normalizedUrl.split('/');
      const repoName = urlParts.pop()?.replace('.git', '') || '';

      // Connect to SSE first and wait for connection to establish
      const sseReady = new Promise<void>((resolve) => {
        connectSSE(repoName, () => {
          setStatusText("Cloning repository...");
          resolve();
        });
      });

      // Wait for SSE to be ready
      await sseReady;

      // Small delay to ensure SSE connection is fully established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Call the backend API - events will now be captured
      await analyzeRepo(normalizedUrl, false, true);

      // Navigation to dashboard happens when batch_start event fires
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalyzing(false);
      setCurrentStep(-1);
      setProgress(0);
      analysisStarted.current = false;

      // Close SSE on error
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      analysisStarted.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader backTo="/" backAriaLabel="Back to login" />

      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {!analyzing ? (
            <>
              <h1 className="text-2xl font-display font-bold mb-2">
                Open a repository
              </h1>
              <p className="text-sm text-muted-foreground mb-8">
                Paste a GitHub repo URL. We clone and analyze it securely.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    placeholder="https://github.com/org/repo"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="h-12 font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={startLiveDemoAnalysis}
                  >
                    Load Demo Repository
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Private repo</span>
                  </div>
                  <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                </div>

                <Button
                  variant="glow"
                  size="lg"
                  className="w-full h-12"
                  disabled={!isValidUrl}
                  onClick={startAnalysis}
                >
                  Clone & Analyze
                </Button>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">
                  Analyzing repository
                </h2>
                <p className="text-sm text-muted-foreground font-mono">{url}</p>
              </div>

              <div className="space-y-2">
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                {statusText && (
                  <p className="text-xs text-muted-foreground text-center">
                    {statusText}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div
                    key={step.label}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-muted">
                      {currentStep > i ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RepoImport;
