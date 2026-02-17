"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getCurrentMonth } from "@/lib/utils";
import {
  RefreshCw,
  Database,
  Calculator,
  Send,
  Newspaper,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  XCircle,
} from "lucide-react";

interface StepConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  endpoint: string;
  stepName: string;
}

const STEPS: StepConfig[] = [
  {
    id: "collect",
    label: "Collect Data",
    icon: Database,
    description: "Fetch latest data from Michelin, James Beard, World's 50 Best, and Instagram",
    endpoint: "/api/update/collect",
    stepName: "data_collection",
  },
  {
    id: "news",
    label: "Refresh News",
    icon: Newspaper,
    description: "Fetch latest news articles about chefs from Google News RSS",
    endpoint: "/api/update/news",
    stepName: "news_refresh",
  },
  {
    id: "recalculate",
    label: "Recalculate Scores",
    icon: Calculator,
    description: "Recompute all chef scores and rankings using current weights",
    endpoint: "/api/update/recalculate",
    stepName: "score_recalculation",
  },
  {
    id: "publish",
    label: "Publish Snapshot",
    icon: Send,
    description: "Save this month's ranking as an official snapshot",
    endpoint: "/api/update/publish",
    stepName: "publish_snapshot",
  },
];

interface StepState {
  status: "idle" | "running" | "complete" | "error";
  progress: number;
  total: number;
  message: string;
  resultSummary: string | null;
  lastRun: string | null;
  lastStatus: string | null;
  lastResult: string | null;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function UpdatePage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [notes, setNotes] = useState("");
  const abortControllers = useRef<Record<string, AbortController>>({});

  const [stepStates, setStepStates] = useState<Record<string, StepState>>(() => {
    const initial: Record<string, StepState> = {};
    for (const step of STEPS) {
      initial[step.id] = {
        status: "idle",
        progress: 0,
        total: 0,
        message: "",
        resultSummary: null,
        lastRun: null,
        lastStatus: null,
        lastResult: null,
      };
    }
    return initial;
  });

  // Load last-run info from the log API
  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/update/log");
      const logs = await res.json();
      setStepStates((prev) => {
        const next = { ...prev };
        for (const step of STEPS) {
          const log = logs[step.stepName];
          if (log) {
            next[step.id] = {
              ...next[step.id],
              lastRun: log.runAt,
              lastStatus: log.status,
              lastResult: log.resultSummary,
            };
          }
        }
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function updateStep(id: string, patch: Partial<StepState>) {
    setStepStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function runStep(step: StepConfig) {
    const controller = new AbortController();
    abortControllers.current[step.id] = controller;

    updateStep(step.id, { status: "running", progress: 0, total: 0, message: "Starting...", resultSummary: null });

    try {
      const fetchOptions: RequestInit = {
        method: "POST",
        signal: controller.signal,
      };

      // Publish step needs month/notes in body
      if (step.id === "publish") {
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify({ month, notes });
      }

      const res = await fetch(step.endpoint, fetchOptions);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "progress") {
              updateStep(step.id, {
                progress: data.current,
                total: data.total,
                message: data.message || "",
              });
            } else if (data.type === "complete") {
              updateStep(step.id, {
                status: "complete",
                progress: data.total || 1,
                total: data.total || 1,
                message: "",
                resultSummary: data.resultSummary || "Done",
                lastRun: new Date().toISOString(),
                lastStatus: "success",
                lastResult: data.resultSummary,
              });
              toast.success(`${step.label}: ${data.resultSummary || "Complete"}`);
            } else if (data.type === "error") {
              throw new Error(data.message || "Step failed");
            }
          } catch (e) {
            if ((e as Error).message && !(e as Error).message.includes("JSON")) {
              throw e;
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        updateStep(step.id, { status: "idle", message: "Cancelled" });
        toast.info(`${step.label} cancelled`);
      } else {
        const msg = (err as Error).message || "Step failed";
        updateStep(step.id, {
          status: "error",
          message: msg,
          resultSummary: msg,
          lastRun: new Date().toISOString(),
          lastStatus: "error",
          lastResult: msg,
        });
        toast.error(`${step.label}: ${msg}`);
      }
    } finally {
      delete abortControllers.current[step.id];
    }
  }

  function cancelStep(stepId: string) {
    const controller = abortControllers.current[stepId];
    if (controller) {
      controller.abort();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="h-6 w-6" /> Monthly Update
        </h1>
        <div className="flex items-center gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="YYYY-MM"
              className="w-32 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-64 h-8 text-sm"
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Each step runs independently. Click any card to start — no need to run them in order.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STEPS.map((step) => {
          const state = stepStates[step.id];
          const Icon = step.icon;
          const isRunning = state.status === "running";
          const isComplete = state.status === "complete";
          const isError = state.status === "error";
          const progressPercent = state.total > 0 ? Math.round((state.progress / state.total) * 100) : 0;

          return (
            <Card
              key={step.id}
              className={
                isComplete
                  ? "border-green-500/50"
                  : isError
                  ? "border-red-500/50"
                  : isRunning
                  ? "border-blue-500/50"
                  : ""
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {step.label}
                  </CardTitle>
                  {isComplete && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {isError && <AlertCircle className="h-5 w-5 text-red-500" />}
                  {isRunning && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                </div>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Progress bar */}
                {isRunning && (
                  <div className="space-y-1">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{state.message}</span>
                      <span>{progressPercent}%</span>
                    </div>
                  </div>
                )}

                {/* Result summary */}
                {(isComplete || isError) && state.resultSummary && (
                  <div
                    className={`text-sm px-3 py-2 rounded-md ${
                      isComplete
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {state.resultSummary}
                  </div>
                )}

                {/* Last run info */}
                {state.lastRun && !isRunning && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Last run: {formatTimeAgo(state.lastRun)}</span>
                    {state.lastStatus && (
                      <Badge
                        variant={state.lastStatus === "success" ? "secondary" : "destructive"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {state.lastStatus}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => runStep(step)}
                    disabled={isRunning}
                    className="flex-1"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        Running...
                      </>
                    ) : isComplete ? (
                      "Re-run"
                    ) : (
                      "Run"
                    )}
                  </Button>
                  {isRunning && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelStep(step.id)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
