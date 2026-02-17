"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Save, Download, Upload, RotateCcw, User, Sparkles, Mail, Send, Trash2 } from "lucide-react";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "@/types";

const WEIGHT_LABELS: Record<string, string> = {
  formalAccolades: "Formal Accolades",
  careerTrack: "Career Track Record",
  publicSignals: "Public Signals",
  peerStanding: "Peer Standing",
};

export default function SettingsPage() {
  const [weights, setWeights] = useState<ScoringWeights | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sender, setSender] = useState({ name: "", title: "", company: "", email: "" });
  const [savingSender, setSavingSender] = useState(false);
  const [outreach, setOutreach] = useState({ purpose: "", tone: "warm", maxWords: 150 });
  const [savingOutreach, setSavingOutreach] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [digest, setDigest] = useState({ fromEmail: "digest@chefranker.com", fromName: "Chef Ranker", sendHour: 8, sendMinute: 0, timezone: "America/New_York" });
  const [savingDigest, setSavingDigest] = useState(false);
  const [subscribers, setSubscribers] = useState<{ email: string; isActive: boolean; subscribedAt: string }[]>([]);
  const [subCount, setSubCount] = useState({ active: 0, total: 0 });
  const [digestHistory, setDigestHistory] = useState<{ id: string; sentAt: string; recipientCount: number; storyCount: number; subject: string }[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [stats, setStats] = useState<{
    totalChefs: number;
    totalAccolades: number;
    totalSnapshots: number;
    averageScore: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/scoring").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/settings/sender").then((r) => r.json()),
      fetch("/api/outreach/settings").then((r) => r.json()),
      fetch("/api/digest/settings").then((r) => r.json()),
      fetch("/api/digest/subscribers").then((r) => r.json()),
      fetch("/api/digest/history").then((r) => r.json()),
    ]).then(([w, s, snd, os, ds, subs, hist]) => {
      setWeights(w);
      setStats(s);
      setSender({ name: snd.name || "", title: snd.title || "", company: snd.company || "", email: snd.email || "" });
      setOutreach({ purpose: os.purpose || "", tone: os.tone || "warm", maxWords: os.maxWords || 150 });
      setDigest({
        fromEmail: ds.fromEmail || "digest@chefranker.com",
        fromName: ds.fromName || "Chef Ranker",
        sendHour: ds.sendHour ?? 8,
        sendMinute: ds.sendMinute ?? 0,
        timezone: ds.timezone || "America/New_York",
      });
      setSubscribers(subs.subscribers || []);
      setSubCount({ active: subs.activeCount || 0, total: subs.total || 0 });
      setDigestHistory(hist || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveWeights() {
    if (!weights) return;
    setSaving(true);
    try {
      await fetch("/api/scoring", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weights),
      });
      toast.success("Weights saved and scores recalculated.");
    } catch {
      toast.error("Failed to save weights");
    } finally {
      setSaving(false);
    }
  }

  function resetWeights() {
    setWeights({ ...DEFAULT_WEIGHTS });
    toast.info("Weights reset to defaults (not yet saved)");
  }

  function updateWeight(key: string, value: number) {
    if (!weights) return;
    setWeights({ ...weights, [key]: value });
  }

  const totalWeight = weights
    ? Object.values(weights).reduce((sum, v) => sum + v, 0)
    : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" /> Settings
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Scoring Weights
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={resetWeights}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                  <Button size="sm" onClick={saveWeights} disabled={saving}>
                    <Save className="h-3 w-3 mr-1" /> {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {weights && Object.entries(WEIGHT_LABELS).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>{label}</Label>
                    <span className="font-mono text-muted-foreground">
                      {(weights[key as keyof ScoringWeights] * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={[weights[key as keyof ScoringWeights] * 100]}
                    onValueChange={([v]) => updateWeight(key, v / 100)}
                    max={50}
                    step={1}
                  />
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-sm font-medium">
                <span>Total</span>
                <span className={totalWeight > 1.01 || totalWeight < 0.99 ? "text-destructive" : "text-green-600"}>
                  {(totalWeight * 100).toFixed(0)}%
                </span>
              </div>
              {(totalWeight > 1.01 || totalWeight < 0.99) && (
                <p className="text-xs text-destructive">Weights should sum to 100%.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Outreach AI Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Anthropic API Key</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..." />
                <p className="text-xs text-muted-foreground mt-1">Set in .env as ANTHROPIC_API_KEY. This field shows the current value for reference only.</p>
              </div>
              <div>
                <Label>Outreach Purpose</Label>
                <Textarea value={outreach.purpose} onChange={(e) => setOutreach({ ...outreach, purpose: e.target.value })} rows={3} placeholder="What are you reaching out about?" />
              </div>
              <div>
                <Label>Tone</Label>
                <Select value={outreach.tone} onValueChange={(v) => setOutreach({ ...outreach, tone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Max Email Length</Label>
                  <span className="font-mono text-muted-foreground">{outreach.maxWords} words</span>
                </div>
                <Slider
                  value={[outreach.maxWords]}
                  onValueChange={([v]) => setOutreach({ ...outreach, maxWords: v })}
                  min={100}
                  max={250}
                  step={10}
                />
              </div>
              <Button size="sm" className="w-full" disabled={savingOutreach} onClick={async () => {
                setSavingOutreach(true);
                try {
                  await fetch("/api/outreach/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(outreach),
                  });
                  toast.success("Outreach settings saved");
                } catch { toast.error("Failed to save"); }
                finally { setSavingOutreach(false); }
              }}>
                <Save className="h-3 w-3 mr-1" /> {savingOutreach ? "Saving..." : "Save Outreach Settings"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> My Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Name</Label><Input value={sender.name} onChange={(e) => setSender({ ...sender, name: e.target.value })} placeholder="Your name" /></div>
              <div><Label>Title / Role</Label><Input value={sender.title} onChange={(e) => setSender({ ...sender, title: e.target.value })} placeholder="e.g. Event Director" /></div>
              <div><Label>Company</Label><Input value={sender.company} onChange={(e) => setSender({ ...sender, company: e.target.value })} placeholder="Your company" /></div>
              <div><Label>Email</Label><Input value={sender.email} onChange={(e) => setSender({ ...sender, email: e.target.value })} placeholder="you@company.com" /></div>
              <Button size="sm" className="w-full" disabled={savingSender} onClick={async () => {
                setSavingSender(true);
                try {
                  await fetch("/api/settings/sender", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(sender),
                  });
                  toast.success("Sender info saved");
                } catch { toast.error("Failed to save"); }
                finally { setSavingSender(false); }
              }}>
                <Save className="h-3 w-3 mr-1" /> {savingSender ? "Saving..." : "Save My Info"}
              </Button>
              <p className="text-xs text-muted-foreground">Used to fill merge fields in outreach email templates.</p>
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader><CardTitle className="text-base">Database Stats</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Total Chefs</span><span className="font-mono">{stats.totalChefs}</span></div>
                <div className="flex justify-between"><span>Total Accolades</span><span className="font-mono">{stats.totalAccolades}</span></div>
                <div className="flex justify-between"><span>Snapshots</span><span className="font-mono">{stats.totalSnapshots}</span></div>
                <div className="flex justify-between"><span>Avg Score</span><span className="font-mono">{stats.averageScore}</span></div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Data Management</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <a href="/api/export?format=csv" download>
                <Button variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
              </a>
              <a href="/api/export?format=json" download>
                <Button variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" /> Export JSON
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Digest Settings */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" /> Digest Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label>From Name</Label><Input value={digest.fromName} onChange={(e) => setDigest({ ...digest, fromName: e.target.value })} /></div>
              <div><Label>From Email</Label><Input value={digest.fromEmail} onChange={(e) => setDigest({ ...digest, fromEmail: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Send Hour</Label><Input type="number" min={0} max={23} value={digest.sendHour} onChange={(e) => setDigest({ ...digest, sendHour: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Minute</Label><Input type="number" min={0} max={59} value={digest.sendMinute} onChange={(e) => setDigest({ ...digest, sendMinute: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div>
                <Label>Timezone</Label>
                <Select value={digest.timezone} onValueChange={(v) => setDigest({ ...digest, timezone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern</SelectItem>
                    <SelectItem value="America/Chicago">Central</SelectItem>
                    <SelectItem value="America/Denver">Mountain</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Europe/Paris">Paris</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="w-full" disabled={savingDigest} onClick={async () => {
                setSavingDigest(true);
                try {
                  await fetch("/api/digest/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(digest),
                  });
                  toast.success("Digest settings saved");
                } catch { toast.error("Failed to save"); }
                finally { setSavingDigest(false); }
              }}>
                <Save className="h-3 w-3 mr-1" /> {savingDigest ? "Saving..." : "Save Digest Settings"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Subscribers ({subCount.active} active / {subCount.total} total)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {subscribers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscribers yet.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {subscribers.map((sub) => (
                    <div key={sub.email} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <div>
                        <span className={sub.isActive ? "" : "text-muted-foreground line-through"}>{sub.email}</span>
                        {!sub.isActive && <span className="text-xs text-muted-foreground ml-1">(unsubscribed)</span>}
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={async () => {
                        await fetch("/api/digest/subscribers", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: sub.email }),
                        });
                        setSubscribers((prev) => prev.filter((s) => s.email !== sub.email));
                        setSubCount((prev) => ({ active: prev.active - (sub.isActive ? 1 : 0), total: prev.total - 1 }));
                        toast.success("Subscriber removed");
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Send Test Digest
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Test Email</Label>
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@email.com" />
              </div>
              <Button size="sm" className="w-full" disabled={sendingTest} onClick={async () => {
                if (!testEmail) { toast.error("Enter a test email"); return; }
                setSendingTest(true);
                try {
                  const res = await fetch("/api/digest/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ testEmail }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Failed to send");
                  toast.success(data.message || `Test digest sent with ${data.storyCount} stories`);
                } catch (err) { toast.error((err as Error).message); }
                finally { setSendingTest(false); }
              }}>
                <Send className="h-3 w-3 mr-1" /> {sendingTest ? "Sending..." : "Send Test"}
              </Button>
            </CardContent>
          </Card>

          {digestHistory.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recent Digests</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {digestHistory.slice(0, 10).map((log) => (
                  <div key={log.id} className="text-sm border-b last:border-0 pb-1">
                    <p className="font-medium truncate">{log.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.sentAt).toLocaleString()} · {log.recipientCount} recipients · {log.storyCount} stories
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
