"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScoreRadar } from "@/components/charts/score-radar";
import { ScoreBar } from "@/components/charts/score-bar";
import { ScoreHistory } from "@/components/charts/score-history";
import { calculateBreakdownClient } from "@/lib/scoring-client";
import { formatScore, getImpactLevel } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  Award,
  Briefcase,
  Star,
  ExternalLink,
  Newspaper,
  Mail,
  Phone,
  Pencil,
  Copy,
  Linkedin,
  Sparkles,
  Loader2,
  RefreshCw,
  ClipboardCopy,
  Check,
} from "lucide-react";

interface ChefDetail {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  currentRestaurant: string | null;
  cuisineSpecialties: string | null;
  yearsExperience: number | null;
  bio: string | null;
  totalScore: number;
  rank: number | null;
  accolades: { id: string; type: string; detail: string | null; year: number | null; sourceUrl: string | null }[];
  careerEntries: { id: string; role: string; restaurant: string; city: string | null; startYear: number | null; endYear: number | null; isCurrent: boolean }[];
  recognitions: { id: string; title: string; category: string | null; year: number | null }[];
  publicSignals: { id: string; platform: string; metric: string | null; value: number | null }[];
  peerStandings: { id: string; type: string; detail: string | null; relatedChef: string | null }[];
  snapshotEntries: { rank: number; totalScore: number; breakdown: string | null; delta: number | null; snapshot: { month: string } }[];
  newsItems: { newsItem: { id: string; title: string; url: string; source: string; category: string; publishedAt: string; summary: string | null; relevanceScore: number; isTasteRelevant: boolean } }[];
  contact: {
    email: string | null;
    agentName: string | null;
    agentEmail: string | null;
    restaurantEmail: string | null;
    phone: string | null;
    preferredContactMethod: string | null;
    linkedinUrl: string | null;
    notes: string | null;
  } | null;
  outreachDrafts: {
    id: string;
    subject: string;
    status: string;
    createdAt: string;
  }[];
}

function accoladeLabel(type: string, detail: string | null): string {
  switch (type) {
    case "MICHELIN_STAR": return `Michelin ${detail || "Star"}`;
    case "JAMES_BEARD": return detail || "James Beard Award";
    case "WORLDS_50_BEST": return detail || "World's 50 Best";
    case "BOCUSE_DOR": return detail || "Bocuse d'Or";
    default: return detail || type;
  }
}

export default function ChefDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [chef, setChef] = useState<ChefDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    email: "", agentName: "", agentEmail: "", restaurantEmail: "",
    phone: "", preferredContactMethod: "", linkedinUrl: "", notes: "",
  });
  const [generating, setGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<{
    id: string; subject: string; body: string; dataPointsUsed: string[]; confidence: string;
  } | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/chefs/${slug}`)
      .then((r) => r.json())
      .then((data) => { setChef(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!chef) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Chef not found.</p>
        <Link href="/chefs"><Button variant="link">Back to chefs</Button></Link>
      </div>
    );
  }

  const cuisines: string[] = chef.cuisineSpecialties ? JSON.parse(chef.cuisineSpecialties) : [];
  const breakdown = calculateBreakdownClient(chef);
  const historyData = chef.snapshotEntries.map((e) => ({
    month: e.snapshot.month,
    score: e.totalScore,
    rank: e.rank,
  })).reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/chefs">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{chef.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {chef.currentRestaurant && <span>{chef.currentRestaurant}</span>}
            {(chef.city || chef.country) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[chef.city, chef.country].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="default" className="gap-1" disabled={generating} onClick={async () => {
            setGenerating(true);
            try {
              const res = await fetch("/api/outreach/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chefId: chef.id }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Failed to generate draft");
              setGeneratedDraft({
                id: data.draft.id,
                subject: data.draft.subject,
                body: data.draft.body,
                dataPointsUsed: data.dataPointsUsed,
                confidence: data.confidence,
              });
              setDraftSubject(data.draft.subject);
              setDraftBody(data.draft.body);
              setShowDraftDialog(true);
              toast.success("Draft generated!");
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setGenerating(false);
            }
          }}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating..." : "Generate Draft"}
          </Button>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{formatScore(chef.totalScore)}</div>
            {chef.rank && <div className="text-sm text-muted-foreground">Rank #{chef.rank}</div>}
          </div>
        </div>
      </div>

      {/* Cuisines */}
      {cuisines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cuisines.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
        </div>
      )}

      {chef.bio && <p className="text-sm text-muted-foreground">{chef.bio}</p>}

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Score Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ScoreBar breakdown={breakdown} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Score Profile</CardTitle></CardHeader>
          <CardContent>
            <ScoreRadar data={[{ name: chef.name, breakdown }]} />
          </CardContent>
        </Card>
      </div>

      {/* Score History */}
      {historyData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Score History</CardTitle></CardHeader>
          <CardContent>
            <ScoreHistory data={historyData} />
          </CardContent>
        </Card>
      )}

      {/* Accolades */}
      {chef.accolades.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4" /> Accolades</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {chef.accolades.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">{accoladeLabel(a.type, a.detail)}</span>
                    {a.year && <span className="text-sm text-muted-foreground">({a.year})</span>}
                  </div>
                  {a.sourceUrl && (
                    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Career Timeline */}
      {chef.careerEntries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> Career</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {chef.careerEntries.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <div className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <div className="font-medium">{c.role} at {c.restaurant}</div>
                    <div className="text-sm text-muted-foreground">
                      {c.city && <span>{c.city} &middot; </span>}
                      {c.startYear && <span>{c.startYear}</span>}
                      {c.startYear && <span> – </span>}
                      {c.isCurrent ? <span>Present</span> : c.endYear && <span>{c.endYear}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recognition & Public Signals side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {chef.recognitions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Industry Recognition</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {chef.recognitions.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span>{r.title}</span>
                    <div className="flex items-center gap-2">
                      {r.category && <Badge variant="outline" className="text-xs">{r.category}</Badge>}
                      {r.year && <span className="text-muted-foreground">{r.year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {chef.publicSignals.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Public Signals</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {chef.publicSignals.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <Badge variant="secondary">{s.platform}</Badge>
                    <span className="text-muted-foreground">{s.metric || (s.value ? s.value.toLocaleString() : "—")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Peer Standings */}
      {chef.peerStandings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Peer Standing</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {chef.peerStandings.map((p) => (
                <div key={p.id} className="text-sm">
                  <Badge variant="outline" className="mr-2">{p.type}</Badge>
                  {p.detail}
                  {p.relatedChef && <span className="text-muted-foreground"> — {p.relatedChef}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Contact Info</span>
            <Button variant="ghost" size="sm" onClick={() => {
              if (chef.contact) {
                setContactForm({
                  email: chef.contact.email || "",
                  agentName: chef.contact.agentName || "",
                  agentEmail: chef.contact.agentEmail || "",
                  restaurantEmail: chef.contact.restaurantEmail || "",
                  phone: chef.contact.phone || "",
                  preferredContactMethod: chef.contact.preferredContactMethod || "",
                  linkedinUrl: chef.contact.linkedinUrl || "",
                  notes: chef.contact.notes || "",
                });
              } else {
                setContactForm({ email: "", agentName: "", agentEmail: "", restaurantEmail: "", phone: "", preferredContactMethod: "", linkedinUrl: "", notes: "" });
              }
              setEditingContact(true);
            }}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chef.contact && (chef.contact.email || chef.contact.agentEmail || chef.contact.restaurantEmail) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {chef.contact.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span>{chef.contact.email}</span>
                </div>
              )}
              {chef.contact.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>{chef.contact.phone}</span>
                </div>
              )}
              {chef.contact.agentName && (
                <div>
                  <span className="text-muted-foreground">Agent: </span>
                  <span>{chef.contact.agentName}</span>
                  {chef.contact.agentEmail && <span className="text-muted-foreground"> ({chef.contact.agentEmail})</span>}
                </div>
              )}
              {chef.contact.restaurantEmail && (
                <div>
                  <span className="text-muted-foreground">Restaurant: </span>
                  <span>{chef.contact.restaurantEmail}</span>
                </div>
              )}
              {chef.contact.linkedinUrl && (
                <div className="flex items-center gap-2">
                  <Linkedin className="h-3 w-3 text-muted-foreground" />
                  <a href={chef.contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{chef.contact.linkedinUrl}</a>
                </div>
              )}
              {chef.contact.preferredContactMethod && (
                <div>
                  <span className="text-muted-foreground">Preferred: </span>
                  <Badge variant="outline" className="text-xs">{chef.contact.preferredContactMethod}</Badge>
                </div>
              )}
              {chef.contact.notes && (
                <div className="md:col-span-2 text-muted-foreground italic">{chef.contact.notes}</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contact info yet. Click Edit to add.</p>
          )}
        </CardContent>
      </Card>

      {/* Outreach History */}
      {chef.outreachDrafts && chef.outreachDrafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Outreach History</span>
              <Link href={`/outreach?compose=${chef.slug}`}>
                <Button variant="link" size="sm" className="text-xs">New draft</Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {chef.outreachDrafts.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span className="font-medium truncate mr-2">{d.subject}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={
                      d.status === "sent" ? "default" :
                      d.status === "replied" ? "default" :
                      d.status === "confirmed" ? "default" :
                      d.status === "declined" ? "destructive" :
                      "secondary"
                    } className="text-xs">{d.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact Edit Dialog */}
      <Dialog open={editingContact} onOpenChange={setEditingContact}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Contact Info — {chef.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="chef@example.com" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Agent Name</Label><Input value={contactForm.agentName} onChange={(e) => setContactForm({ ...contactForm, agentName: e.target.value })} /></div>
              <div><Label>Agent Email</Label><Input value={contactForm.agentEmail} onChange={(e) => setContactForm({ ...contactForm, agentEmail: e.target.value })} /></div>
            </div>
            <div><Label>Restaurant Email</Label><Input value={contactForm.restaurantEmail} onChange={(e) => setContactForm({ ...contactForm, restaurantEmail: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
              <div><Label>Preferred Contact</Label><Input value={contactForm.preferredContactMethod} onChange={(e) => setContactForm({ ...contactForm, preferredContactMethod: e.target.value })} placeholder="e.g. Through agent" /></div>
            </div>
            <div><Label>LinkedIn URL</Label><Input value={contactForm.linkedinUrl} onChange={(e) => setContactForm({ ...contactForm, linkedinUrl: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} rows={2} placeholder="Any notes about contacting this chef..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(false)}>Cancel</Button>
            <Button onClick={async () => {
              const res = await fetch(`/api/chefs/${slug}/contact`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(contactForm),
              });
              if (res.ok) {
                const updated = await res.json();
                setChef({ ...chef, contact: updated });
                setEditingContact(false);
                toast.success("Contact info saved");
              } else {
                toast.error("Failed to save contact info");
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent News */}
      {chef.newsItems && chef.newsItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Newspaper className="h-4 w-4" /> Recent News</span>
              <Link href={`/news?chef=${chef.slug}`}>
                <Button variant="link" size="sm" className="text-xs">View all news</Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {chef.newsItems.slice(0, 5).map((n) => {
                const impact = n.newsItem.isTasteRelevant ? getImpactLevel(n.newsItem.relevanceScore) : null;
                return (
                  <div key={n.newsItem.id} className="border-b last:border-0 pb-2 last:pb-0">
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="shrink-0 text-xs mt-0.5">{n.newsItem.category}</Badge>
                      {n.newsItem.isTasteRelevant && impact && (
                        <Badge variant="outline" className={`shrink-0 text-xs border mt-0.5 ${impact.color}`}>
                          {impact.icon} {impact.label}
                        </Badge>
                      )}
                      <div className="min-w-0">
                        <a href={n.newsItem.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline underline-offset-2 line-clamp-1">
                          {n.newsItem.title}
                          <ExternalLink className="inline ml-1 h-3 w-3 text-muted-foreground" />
                        </a>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{n.newsItem.source}</span>
                          <span>{new Date(n.newsItem.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        </div>
                      </div>
                    </div>
                    {n.newsItem.isTasteRelevant && n.newsItem.relevanceScore >= 70 && (
                      <div
                        className="mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 cursor-pointer hover:bg-amber-100 transition-colors"
                        onClick={() => toast.info(`Consider reviewing ${chef.name}'s score based on this high-impact news.`)}
                      >
                        This may impact {chef.name}&apos;s ranking. <strong>Review score</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Generated Draft Dialog */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Generated Draft for {chef.name}
              {generatedDraft?.confidence && (
                <Badge variant={generatedDraft.confidence === "high" ? "default" : generatedDraft.confidence === "medium" ? "secondary" : "destructive"} className="text-xs ml-2">
                  {generatedDraft.confidence} confidence
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={12} className="font-mono text-sm" />
            </div>
            {generatedDraft?.dataPointsUsed && generatedDraft.dataPointsUsed.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Data points referenced: </span>
                {generatedDraft.dataPointsUsed.join(" | ")}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" disabled={generating} onClick={async () => {
              if (!generatedDraft) return;
              setGenerating(true);
              try {
                const res = await fetch("/api/outreach/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chefId: chef.id, previousDraftId: generatedDraft.id }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to regenerate");
                setGeneratedDraft({
                  id: data.draft.id,
                  subject: data.draft.subject,
                  body: data.draft.body,
                  dataPointsUsed: data.dataPointsUsed,
                  confidence: data.confidence,
                });
                setDraftSubject(data.draft.subject);
                setDraftBody(data.draft.body);
                toast.success("New draft generated!");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setGenerating(false);
              }
            }}>
              {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Try Again
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={async () => {
              await navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftBody}`);
              setCopied(true);
              toast.success("Copied to clipboard!");
              setTimeout(() => setCopied(false), 2000);
            }}>
              {copied ? <Check className="h-3 w-3 mr-1" /> : <ClipboardCopy className="h-3 w-3 mr-1" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button size="sm" onClick={async () => {
              if (!generatedDraft) return;
              // Update the draft if user edited it
              if (draftSubject !== generatedDraft.subject || draftBody !== generatedDraft.body) {
                await fetch(`/api/outreach/drafts/${generatedDraft.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ subject: draftSubject, body: draftBody }),
                });
              }
              setShowDraftDialog(false);
              toast.success("Draft saved!");
              // Refresh chef data to show in outreach history
              fetch(`/api/chefs/${slug}`).then((r) => r.json()).then(setChef);
            }}>
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
