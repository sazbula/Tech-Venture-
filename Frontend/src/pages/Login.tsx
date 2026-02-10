import { motion } from "framer-motion";
import { Eye, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/contextify-logo.png";
import { useState, useRef, useEffect } from "react";
import { analyzeLocalRepo } from "@/services/api";

const API_BASE = "http://localhost:8000";

const Login = () => {
  const navigate = useNavigate();
  const [analyzingDemo, setAnalyzingDemo] = useState(false);
  const [progressPhase, setProgressPhase] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startLiveDemo = async () => {
    setAnalyzingDemo(true);
    setProgressPhase("Connecting...");
    setProgressPercent(5);

    try {
      const repoName = "demo_repo";

      // Connect to SSE first and wait for connection to establish
      const sseReady = new Promise<void>((resolve) => {
        connectSSE(repoName, resolve);
      });

      // Wait for SSE to be ready
      await sseReady;

      // Small delay to ensure SSE connection is fully established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Trigger actual RLM analysis on demo_repo - events will now be captured
      await analyzeLocalRepo(repoName, false, true);

      // Navigation happens when graph_complete event fires
    } catch (err) {
      console.error("Demo analysis failed:", err);
      setAnalyzingDemo(false);
      setProgressPhase("");
      setProgressPercent(0);
      // Close SSE on error
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  const connectSSE = (repoName: string, onConnected?: () => void) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    eventSourceRef.current = new EventSource(`${API_BASE}/rlm/stream/${repoName}`);

    eventSourceRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE Progress:", data);

        // Notify that connection is ready
        if (data.type === "connected") {
          setProgressPhase("Connected to analysis stream");
          setProgressPercent(10);
          if (onConnected) onConnected();
        }

        if (data.type === "graph_building") {
          setProgressPhase("Building dependency graph...");
          setProgressPercent(20);
        }

        // Navigate to dashboard as soon as the graph is built
        if (data.type === "graph_complete") {
          setProgressPhase(`Graph ready — ${data.nodes} nodes, ${data.edges} edges`);
          setProgressPercent(50);
          setTimeout(() => {
            localStorage.setItem("currentRepo", repoName);
            localStorage.setItem("rlmInProgress", "true");
            navigate("/dashboard");
          }, 800);
        }

        if (data.type === "collecting_files") {
          setProgressPhase("Collecting files for analysis...");
          setProgressPercent(55);
        }

        if (data.type === "files_collected") {
          setProgressPhase(`Found ${data.file_count} files to analyze`);
          setProgressPercent(60);
        }

        if (data.type === "rlm_started") {
          setProgressPhase("AI analysis starting...");
          setProgressPercent(65);
        }

        if (data.type === "batch_start") {
          setProgressPhase(`Analyzing batch ${data.batch}/${data.total_batches}...`);
          setProgressPercent(70);
        }

        // Mark RLM as complete
        if (data.type === "analysis_complete") {
          localStorage.setItem("rlmInProgress", "false");
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background grid effect */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow orbs */}
      <div
        className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-10 blur-[100px]"
        style={{ background: "hsl(var(--primary))" }}
      />
      <div
        className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full opacity-5 blur-[80px]"
        style={{ background: "hsl(200, 100%, 60%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
      {/* Logo */}
      <div className="mb-6 h-20 flex items-center justify-center">
        <img
          src={logo}
          alt="Contextify"
          draggable={false}
          className="h-8 scale-[7] origin-center object-contain select-none"
        />
      </div>
        <p className="text-muted-foreground text-sm mb-10">
          Analyze massive codebases without context loss.
        </p>

        {/* Login card */}
        <div className="w-full max-w-sm bg-card border border-border rounded-xl p-8 shadow-2xl">
          <h1 className="text-lg font-display font-semibold text-foreground text-center mb-6">
            Sign in to continue
          </h1>

          <Button
            variant="github"
            size="lg"
            className="w-full font-medium text-base h-12 gap-3"
            onClick={() => navigate("/import")}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
            We only request read access to repos you select.
          </p>

          <div className="mt-6 pt-5 border-t border-border flex flex-col gap-2">
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              onClick={startLiveDemo}
              disabled={analyzingDemo}
            >
              {analyzingDemo ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {progressPhase || "Starting analysis..."}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Try Live Demo
                </>
              )}
            </Button>

            {analyzingDemo && (
              <div className="mt-1 space-y-2">
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">{progressPhase}</p>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground gap-2"
              onClick={() => navigate("/dashboard")}
            >
              <Eye className="w-4 h-4" />
              View pre-analyzed demo
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground/50 mt-8">
          Powered by Recursive Language Models
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
