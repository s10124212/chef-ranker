"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Link from "next/link";
import {
  HeartPulse,
  Database,
  Newspaper,
  Globe,
  Server,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Play,
  Clock,
  Download,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────

interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  detail: string;
  responseTimeMs?: number;
  lastFetch?: string | null;
  extra?: Record<string, unknown>;
}

interface DataHealth {
  chefs: { total: number; scored: number; insufficient: number };
  news: { total: number; tasteRelevant: number };
  outreach: { total: number; sent: number; pending: number };
  contactCoverage: string;
  warnings: string[];
  passes: string[];
  staleChefs: number;
}

interface DashboardData {
  services: ServiceStatus[];
  dataHealth: DataHealth;
  dbFileSize: string;
  checkedAt: string;
}

interface HealthLog {
  id: string;
  category: string;
  checkName: string;
  status: string;
  totalChecks: number | null;
  passedChecks: number | null;
  failedChecks: number | null;
  details: string | null;
  duration: number | null;
  runAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === "healthy" || status === "pass") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "degraded" || status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "healthy" || status === "pass" ? "bg-green-500"
    : status === "degraded" || status === "warning" ? "bg-yellow-500"
    : "bg-red-500";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

function ServiceIcon({ name }: { name: string }) {
  if (name.includes("Database")) return <Database className="h-5 w-5" />;
  if (name.includes("News")) return <Newspaper className="h-5 w-5" />;
  if (name.includes("Wikipedia")) return <Globe className="h-5 w-5" />;
  return <Server className="h-5 w-5" />;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatCheckName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Check Definitions ────────────────────────────────────────

interface CheckDef {
  id: string;
  label: string;
  description: string;
  category: string;
}

const DATA_CHECKS: CheckDef[] = [
  { id: "data_completeness", label: "Data Completeness", description: "Profile fill rates for all chefs", category: "data_health" },
  { id: "stale_data", label: "Stale Data", description: "Chefs not updated in 60+ days", category: "data_health" },
  { id: "orphaned_records", label: "Orphaned Records", description: "News/accolades with no linked profile", category: "data_health" },
  { id: "contact_coverage", label: "Contact Coverage", description: "Email/contact info availability", category: "data_health" },
];

const SCORING_CHECKS: CheckDef[] = [
  { id: "floor_ceiling", label: "Floor/Ceiling Tests", description: "Scoring rule violations", category: "scoring" },
  { id: "weight_validation", label: "Weight Validation", description: "Scoring weights validity", category: "scoring" },
  { id: "score_distribution", label: "Score Distribution", description: "Score spread and clustering", category: "scoring" },
  { id: "rank_volatility", label: "Rank Volatility", description: "Ranking changes vs last snapshot", category: "scoring" },
  { id: "empty_breakdown", label: "Empty Breakdown", description: "Chefs with < 2 scoring categories", category: "scoring" },
];

const NEWS_CHECKS: CheckDef[] = [
  { id: "news_freshness", label: "News Freshness", description: "Last fetch times and stale coverage", category: "news_quality" },
  { id: "duplicate_articles", label: "Duplicate Articles", description: "Similar/duplicate news items", category: "news_quality" },
];

const CONNECTOR_CHECKS: CheckDef[] = [
  { id: "connector_michelin", label: "Michelin Guide", description: "Ping guide.michelin.com search endpoint", category: "connectors" },
  { id: "connector_james_beard", label: "James Beard Awards", description: "Ping jamesbeard.org awards search", category: "connectors" },
  { id: "connector_worlds_50_best", label: "World's 50 Best", description: "Ping theworlds50best.com list page", category: "connectors" },
  { id: "connector_instagram", label: "Instagram", description: "Test public profile scraping (~50% failure expected)", category: "connectors" },
  { id: "connector_news_ai", label: "News AI Extractor", description: "Check Anthropic API key and unprocessed queue", category: "connectors" },
];

const E2E_TESTS: CheckDef[] = [
  { id: "chef_lifecycle", label: "Chef Lifecycle", description: "Create, score, and delete a test chef", category: "e2e_workflow" },
  { id: "score_recalculation", label: "Score Recalculation", description: "Add/remove accolade and verify score changes", category: "e2e_workflow" },
  { id: "snapshot_test", label: "Snapshot Publish", description: "Create and delete a test snapshot", category: "e2e_workflow" },
];

// ─── Status Dashboard Tab ──────────────────────────────────────

function StatusDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health/status");
      setData(await res.json());
    } catch {
      toast.error("Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-muted-foreground">Failed to load.</p>;

  return (
    <div className="space-y-6">
      {/* Infrastructure Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.services.map((svc) => (
          <Card key={svc.name}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ServiceIcon name={svc.name} />
                  <span className="font-medium text-sm">{svc.name}</span>
                </div>
                <StatusDot status={svc.status} />
              </div>
              <p className="text-sm text-muted-foreground">{svc.detail}</p>
              {svc.extra && svc.name === "Database" && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>{(svc.extra as Record<string, number>).chefs} chefs</p>
                  <p>{(svc.extra as Record<string, number>).news} news items</p>
                  <p>{(svc.extra as Record<string, number>).accolades} accolades</p>
                  <p>Size: {data.dbFileSize}</p>
                </div>
              )}
              {svc.extra && svc.name === "API Routes" && (
                <p className="text-xs text-muted-foreground">
                  {(svc.extra as Record<string, number>).passing}/{(svc.extra as Record<string, number>).total} routes OK
                </p>
              )}
              {svc.lastFetch && (
                <p className="text-xs text-muted-foreground">Last fetch: {formatTimeAgo(svc.lastFetch)}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Health Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Data Health</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Chefs</p>
              <p className="font-medium">{data.dataHealth.chefs.total} total | {data.dataHealth.chefs.scored} scored | {data.dataHealth.chefs.insufficient} insufficient</p>
            </div>
            <div>
              <p className="text-muted-foreground">News</p>
              <p className="font-medium">{data.dataHealth.news.total} items | {data.dataHealth.news.tasteRelevant} taste-relevant</p>
            </div>
            <div>
              <p className="text-muted-foreground">Outreach</p>
              <p className="font-medium">{data.dataHealth.outreach.total} drafts | {data.dataHealth.outreach.sent} sent | {data.dataHealth.outreach.pending} pending</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contact Coverage</p>
              <p className="font-medium">{data.dataHealth.contactCoverage} of chefs</p>
            </div>
          </div>

          <div className="border-t pt-3 space-y-1">
            {data.dataHealth.warnings.map((w, i) => (
              <p key={i} className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                {w}
              </p>
            ))}
            {data.dataHealth.passes.map((p, i) => (
              <p key={i} className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {p}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh Status
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `health-report-${new Date().toISOString().slice(0, 10)}.json`; a.click();
          URL.revokeObjectURL(url);
        }}>
          <Download className="h-4 w-4 mr-1" /> Export Report
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Last checked: {formatTimeAgo(data.checkedAt)}</p>
    </div>
  );
}

// ─── Run Checks Tab ────────────────────────────────────────────

function CheckSection({ title, checks, isE2e }: { title: string; checks: CheckDef[]; isE2e?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, unknown>>({});

  async function runCheck(check: CheckDef) {
    setRunning((p) => ({ ...p, [check.id]: true }));
    try {
      const endpoint = isE2e ? "/api/health/e2e" : "/api/health/checks";
      const body = isE2e ? { test: check.id } : { check: check.id };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status})`);
      }
      setResults((p) => ({ ...p, [check.id]: data }));
      if (data.error) toast.error(`${check.label}: ${data.error}`);
      else toast.success(`${check.label} complete (${data.duration}ms)`);
    } catch (err) {
      toast.error(`${check.label} failed: ${(err as Error).message}`);
    } finally {
      setRunning((p) => ({ ...p, [check.id]: false }));
    }
  }

  async function runAll() {
    for (const check of checks) {
      await runCheck(check);
    }
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{checks.length} checks</Badge>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          <Button size="sm" variant="outline" onClick={runAll} disabled={Object.values(running).some(Boolean)}>
            <Play className="h-4 w-4 mr-1" /> Run All
          </Button>
          <div className="space-y-2">
            {checks.map((check) => {
              const result = results[check.id] as Record<string, unknown> | undefined;
              const isRunning = running[check.id];

              return (
                <div key={check.id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{check.label}</p>
                      <p className="text-xs text-muted-foreground">{check.description}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => runCheck(check)} disabled={isRunning}>
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                  </div>

                  {result && (
                    <div className="mt-2 text-sm">
                      {result.duration != null && (
                        <p className="text-xs text-muted-foreground mb-1">Completed in {result.duration as number}ms</p>
                      )}
                      <CheckResult checkId={check.id} result={result} isE2e={isE2e} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CheckResult({ checkId, result, isE2e }: { checkId: string; result: Record<string, unknown>; isE2e?: boolean }) {
  if (result.error) {
    return <p className="text-red-600 text-sm">{result.error as string}</p>;
  }

  if (isE2e) {
    const steps = (result.steps || []) as { step: number; description: string; passed: boolean; detail?: string }[];
    const passed = result.passed as boolean;
    return (
      <div className="space-y-1">
        <Badge variant={passed ? "secondary" : "destructive"} className="text-xs mb-1">
          {passed ? "PASS" : "FAIL"}
        </Badge>
        {steps.map((step) => (
          <div key={step.step} className="flex items-center gap-2 text-xs">
            {step.passed ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
            <span>{step.step}. {step.description}</span>
            {step.detail && <span className="text-muted-foreground">({step.detail})</span>}
          </div>
        ))}
      </div>
    );
  }

  const data = result.result as Record<string, unknown> | undefined;
  if (!data) return null;

  // Render based on check type
  switch (checkId) {
    case "data_completeness": {
      const avg = data.averageCompleteness as number;
      const insufficient = data.insufficientCount as number;
      const items = (data.results as { name: string; completeness: number; missing: string[] }[]).slice(0, 10);
      return (
        <div>
          <p>Average completeness: <strong>{avg}%</strong> | {insufficient} below 40%</p>
          <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
            {items.map((r) => (
              <div key={r.name} className="flex justify-between text-xs">
                <span>{r.name}</span>
                <span className={r.completeness < 40 ? "text-red-600" : "text-muted-foreground"}>{r.completeness}%</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "stale_data": {
      const items = data as unknown as { name: string; daysSinceUpdate: number }[];
      return (
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {Array.isArray(items) && items.length === 0 && <p className="text-green-600">No stale profiles found</p>}
          {Array.isArray(items) && items.map((r) => (
            <div key={r.name} className="flex justify-between text-xs">
              <span>{r.name}</span>
              <span className="text-red-600">{r.daysSinceUpdate}d ago</span>
            </div>
          ))}
        </div>
      );
    }
    case "orphaned_records": {
      const d = data as { orphanedNews: number; orphanedAccolades: number };
      return (
        <div className="space-y-0.5">
          <p>Unlinked news items: <strong>{d.orphanedNews}</strong></p>
          <p>Orphaned accolades: <strong>{d.orphanedAccolades}</strong></p>
        </div>
      );
    }
    case "contact_coverage": {
      const d = data as { coveragePercent: number; total: number; withContact: number };
      return <p>{d.coveragePercent}% coverage ({d.withContact}/{d.total} chefs have contact info)</p>;
    }
    case "floor_ceiling": {
      const d = data as { rules: { rule: string; passed: boolean }[]; violations: { rule: string; chef: string; score: number }[] };
      return (
        <div className="space-y-1">
          {d.rules.map((r) => (
            <div key={r.rule} className="flex items-center gap-2 text-xs">
              {r.passed ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
              <span>{r.rule}</span>
            </div>
          ))}
          {d.violations.length > 0 && (
            <div className="mt-1 border-t pt-1">
              <p className="text-xs font-medium text-red-600">Violations:</p>
              {d.violations.slice(0, 10).map((v, i) => (
                <p key={i} className="text-xs">{v.chef}: {v.rule} (score: {v.score.toFixed(1)})</p>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "weight_validation": {
      const d = data as { sum: number; valid: boolean; issues: string[] };
      return (
        <div>
          <p>Weights sum: <strong>{d.sum}%</strong> {d.valid ? <CheckCircle2 className="h-3 w-3 text-green-500 inline" /> : <XCircle className="h-3 w-3 text-red-500 inline" />}</p>
          {d.issues.map((issue, i) => <p key={i} className="text-xs text-yellow-600">{issue}</p>)}
        </div>
      );
    }
    case "score_distribution": {
      const d = data as { buckets: { range: string; count: number }[]; stats: { mean: number; median: number; min: number; max: number; total: number }; warnings: string[] };
      return (
        <div className="space-y-1">
          <div className="flex gap-2">
            {d.buckets.map((b) => (
              <div key={b.range} className="text-center text-xs">
                <div className="bg-muted rounded-sm w-10" style={{ height: `${Math.max(4, b.count * 3)}px` }} />
                <p>{b.range}</p>
                <p className="font-medium">{b.count}</p>
              </div>
            ))}
          </div>
          <p className="text-xs">Mean: {d.stats.mean} | Median: {d.stats.median} | Min: {d.stats.min} | Max: {d.stats.max}</p>
          {d.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-600">{w}</p>)}
        </div>
      );
    }
    case "rank_volatility": {
      const d = data as { changes: { name: string; previousRank: number; currentRank: number; change: number }[]; snapshotMonth: string | null };
      if (!d.snapshotMonth) return <p className="text-muted-foreground">No previous snapshot to compare</p>;
      return (
        <div>
          <p className="text-xs text-muted-foreground mb-1">vs. {d.snapshotMonth} snapshot</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {d.changes.length === 0 && <p className="text-green-600 text-xs">No rank changes</p>}
            {d.changes.slice(0, 15).map((c) => (
              <div key={c.name} className="flex justify-between text-xs">
                <span>{c.name}</span>
                <span className={c.change > 0 ? "text-green-600" : "text-red-600"}>
                  #{c.previousRank} → #{c.currentRank} ({c.change > 0 ? "+" : ""}{c.change})
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "empty_breakdown": {
      const items = data as unknown as { name: string; filledCategories: number; score: number }[];
      if (!Array.isArray(items)) return null;
      return (
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {items.length === 0 && <p className="text-green-600 text-xs">All chefs have 2+ scoring categories</p>}
          {items.slice(0, 15).map((r) => (
            <div key={r.name} className="flex justify-between text-xs">
              <span>{r.name}</span>
              <span className="text-yellow-600">{r.filledCategories}/4 categories (score: {r.score.toFixed(1)})</span>
            </div>
          ))}
        </div>
      );
    }
    case "news_freshness": {
      const d = data as { lastRefresh: string | null; chefsWithNoRecentNewsCount: number };
      return (
        <div>
          <p>Last refresh: {d.lastRefresh ? formatTimeAgo(d.lastRefresh) : "Never"}</p>
          <p>{d.chefsWithNoRecentNewsCount} chefs with no news in 90+ days</p>
        </div>
      );
    }
    case "duplicate_articles": {
      const d = data as { count: number; duplicates: { titleA: string; sourceA: string; sourceB: string }[] };
      return (
        <div>
          <p>{d.count} duplicate articles found</p>
          {d.duplicates.slice(0, 5).map((dup, i) => (
            <p key={i} className="text-xs text-muted-foreground truncate">{dup.titleA} ({dup.sourceA} / {dup.sourceB})</p>
          ))}
        </div>
      );
    }
    case "connector_michelin":
    case "connector_james_beard":
    case "connector_worlds_50_best":
    case "connector_instagram":
    case "connector_news_ai": {
      const d = data as {
        status: string;
        httpStatus?: number;
        responseTimeMs?: number;
        error?: string;
        note?: string;
        hasAnthropicKey?: boolean;
        canExtractFollowers?: boolean;
        hasContent?: boolean;
        hasSearchForm?: boolean;
        hasListItems?: boolean;
        existingInstagramSignals?: number;
        unprocessedItems?: number;
        processedItems?: number;
        lastProcessed?: string | null;
      };
      const statusColor = d.status === "reachable" ? "text-green-600" : d.status === "degraded" ? "text-yellow-600" : "text-red-600";
      return (
        <div className="space-y-0.5">
          <p className={statusColor}>
            {d.status === "reachable" ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : d.status === "degraded" ? <AlertTriangle className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
            {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
            {d.httpStatus != null && ` (HTTP ${d.httpStatus})`}
            {d.responseTimeMs != null && ` — ${d.responseTimeMs}ms`}
          </p>
          {d.error && <p className="text-xs text-red-600">{d.error}</p>}
          {d.hasAnthropicKey != null && (
            <p className="text-xs">{d.hasAnthropicKey ? <CheckCircle2 className="h-3 w-3 text-green-500 inline mr-1" /> : <XCircle className="h-3 w-3 text-red-500 inline mr-1" />}Anthropic API key</p>
          )}
          {d.canExtractFollowers != null && (
            <p className="text-xs">{d.canExtractFollowers ? <CheckCircle2 className="h-3 w-3 text-green-500 inline mr-1" /> : <AlertTriangle className="h-3 w-3 text-yellow-500 inline mr-1" />}Follower extraction {d.canExtractFollowers ? "working" : "blocked this session"}</p>
          )}
          {d.existingInstagramSignals != null && <p className="text-xs text-muted-foreground">{d.existingInstagramSignals} existing Instagram signals</p>}
          {d.unprocessedItems != null && <p className="text-xs text-muted-foreground">{d.unprocessedItems} unprocessed / {d.processedItems} processed</p>}
          {d.lastProcessed && <p className="text-xs text-muted-foreground">Last processed: {formatTimeAgo(d.lastProcessed)}</p>}
          {d.note && <p className="text-xs text-yellow-600">{d.note}</p>}
        </div>
      );
    }
    default:
      return <pre className="text-xs max-h-48 overflow-auto">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function RunChecksTab() {
  const [runningAll, setRunningAll] = useState(false);

  async function runAllChecks() {
    setRunningAll(true);
    try {
      // Run checks first, then E2E (sequential to avoid data conflicts)
      const checksRes = await fetch("/api/health/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: "all" }),
      });
      const checksText = await checksRes.text();
      let checks: Record<string, unknown>;
      try {
        checks = JSON.parse(checksText);
      } catch {
        throw new Error(`Checks returned non-JSON (${checksRes.status})`);
      }

      const e2eRes = await fetch("/api/health/e2e", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "all" }),
      });
      const e2eText = await e2eRes.text();
      let e2e: Record<string, unknown>;
      try {
        e2e = JSON.parse(e2eText);
      } catch {
        throw new Error(`E2E tests returned non-JSON (${e2eRes.status})`);
      }

      const totalPassed = ((checks.totalPassed as number) || 0) + ((e2e.totalPassed as number) || 0);
      const totalFailed = ((checks.totalFailed as number) || 0) + ((e2e.totalFailed as number) || 0);
      toast.success(`All checks complete: ${totalPassed} passed, ${totalFailed} failed`);
    } catch (err) {
      toast.error(`Run all failed: ${(err as Error).message}`);
    } finally {
      setRunningAll(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Button onClick={runAllChecks} disabled={runningAll}>
          {runningAll ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
          Run All Checks
        </Button>
      </div>

      <CheckSection title="Data Health Checks" checks={DATA_CHECKS} />
      <CheckSection title="Scoring Sanity Checks" checks={SCORING_CHECKS} />
      <CheckSection title="News Quality Checks" checks={NEWS_CHECKS} />
      <CheckSection title="Data Connector Health" checks={CONNECTOR_CHECKS} />
      <CheckSection title="End-to-End Workflow Tests" checks={E2E_TESTS} isE2e />
    </div>
  );
}

// ─── Test Log Tab ──────────────────────────────────────────────

function TestLogTab() {
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (filter) params.set("category", filter);
        const res = await fetch(`/api/health/log?${params}`);
        const data = await res.json();
        setLogs(data.logs);
      } catch {
        toast.error("Failed to load log");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  const categories = ["all", "data_health", "scoring", "news_quality", "connectors", "api_infra", "e2e_workflow"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={filter === cat || (cat === "all" && !filter) ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(cat === "all" ? null : cat)}
          >
            {formatCheckName(cat)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No check logs yet. Run some checks first.</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Timestamp</th>
                <th className="text-left px-3 py-2 font-medium">Check</th>
                <th className="text-left px-3 py-2 font-medium">Result</th>
                <th className="text-left px-3 py-2 font-medium">Details</th>
                <th className="text-right px-3 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.runAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{log.category}</Badge>
                      <span className="text-xs">{formatCheckName(log.checkName)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={log.status === "pass" ? "secondary" : log.status === "warning" ? "outline" : "destructive"}
                      className="text-xs"
                    >
                      {log.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {log.totalChecks != null && `${log.passedChecks}/${log.totalChecks} passed`}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-muted-foreground">
                    {log.duration != null ? `${log.duration}ms` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => {
          const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `health-log-${new Date().toISOString().slice(0, 10)}.json`; a.click();
          URL.revokeObjectURL(url);
        }}>
          <Download className="h-4 w-4 mr-1" /> Export Log
        </Button>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function HealthPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <HeartPulse className="h-6 w-6" /> System Health
      </h1>

      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">Status Dashboard</TabsTrigger>
          <TabsTrigger value="checks">Run Checks</TabsTrigger>
          <TabsTrigger value="log">Test Log</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4">
          <StatusDashboard />
        </TabsContent>

        <TabsContent value="checks" className="mt-4">
          <RunChecksTab />
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <TestLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
