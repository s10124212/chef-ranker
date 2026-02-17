"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Newspaper,
  Search,
  RefreshCw,
  ExternalLink,
  Plus,
  Clock,
  Loader2,
  Mail,
  CheckCircle,
} from "lucide-react";
import { getImpactLevel } from "@/lib/utils";

const CATEGORIES = [
  { value: "RESTAURANT", label: "Restaurant Opening / Closing", emoji: "🍽️" },
  { value: "AWARD", label: "Award / Accolade", emoji: "🏆" },
  { value: "FEATURE", label: "Feature / Profile", emoji: "📰" },
  { value: "JOB_CHANGE", label: "Job Change / New Role", emoji: "💼" },
  { value: "TV_MEDIA", label: "TV / Media Appearance", emoji: "📺" },
  { value: "COOKBOOK", label: "Cookbook / Publication", emoji: "📖" },
  { value: "EVENT", label: "Event / Festival", emoji: "🌍" },
  { value: "INTERVIEW", label: "Interview / Quote", emoji: "💬" },
  { value: "INNOVATION", label: "Innovation / Technique", emoji: "🔬" },
  { value: "COLLABORATION", label: "Collaboration", emoji: "🤝" },
  { value: "OTHER", label: "Other", emoji: "📢" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  imageUrl: string | null;
  summary: string | null;
  category: string;
  publishedAt: string;
  fetchedAt: string;
  relevanceScore: number;
  isTasteRelevant: boolean;
  relevanceCategory: string | null;
  chefs: { chef: { name: string; slug: string } }[];
}

interface ChefOption {
  name: string;
  slug: string;
}

function getStoredTasteMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("news-taste-only") === "true";
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalTasteRelevant, setTotalTasteRelevant] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [chefFilter, setChefFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [impactFilter, setImpactFilter] = useState("");
  const [tasteOnly, setTasteOnly] = useState(getStoredTasteMode);

  const [chefOptions, setChefOptions] = useState<ChefOption[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Digest signup
  const [subEmail, setSubEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  // Form state for manual add
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSource, setFormSource] = useState("");
  const [formCategory, setFormCategory] = useState("OTHER");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formSummary, setFormSummary] = useState("");
  const [formChefSlug, setFormChefSlug] = useState("");
  const [formRelevance, setFormRelevance] = useState("50");

  useEffect(() => {
    fetch("/api/chefs?limit=100")
      .then((r) => r.json())
      .then((data) => setChefOptions(data.chefs.map((c: ChefOption) => ({ name: c.name, slug: c.slug }))));
  }, []);

  function handleTasteToggle(value: boolean) {
    setTasteOnly(value);
    setPage(1);
    localStorage.setItem("news-taste-only", String(value));
  }

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("search", search);
      if (selectedCategories.size > 0) params.set("category", Array.from(selectedCategories).join(","));
      if (chefFilter) params.set("chef", chefFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (sortBy !== "date") params.set("sortBy", sortBy);
      if (impactFilter) params.set("impactLevel", impactFilter);
      if (tasteOnly) params.set("tasteOnly", "true");

      const res = await fetch(`/api/news?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalTasteRelevant(data.totalTasteRelevant || 0);
      setLastFetched(data.lastFetched);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategories, chefFilter, sourceFilter, sortBy, impactFilter, tasteOnly]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/news/refresh", { method: "POST" });
      const data = await res.json();
      toast.success(
        `Fetched ${data.totalFetched} articles. ${data.totalTasteRelevant} marked as taste-relevant, ${data.totalGeneral} marked as general news. ${data.totalNew} new saved.`
      );
      fetchNews();
    } catch {
      toast.error("Failed to refresh news");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleManualAdd() {
    if (!formTitle || !formUrl || !formSource || !formCategory || !formDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          url: formUrl,
          source: formSource,
          category: formCategory,
          publishedAt: formDate,
          summary: formSummary || null,
          chefSlugs: formChefSlug ? [formChefSlug] : [],
          relevanceScore: parseInt(formRelevance),
          isTasteRelevant: parseInt(formRelevance) >= 40,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success("News item added");
      setAddDialogOpen(false);
      setFormTitle(""); setFormUrl(""); setFormSource(""); setFormSummary(""); setFormChefSlug(""); setFormRelevance("50");
      fetchNews();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleSubscribe() {
    if (!subEmail || !subEmail.includes("@")) {
      toast.error("Please enter a valid email");
      return;
    }
    setSubscribing(true);
    try {
      const res = await fetch("/api/digest/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to subscribe");
      setSubscribed(true);
      toast.success("Subscribed to daily digest!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubscribing(false);
    }
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
    setPage(1);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chef News</h1>
            {lastFetched && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last updated: {formatDate(lastFetched)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            {refreshing ? "Refreshing..." : "Refresh News"}
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Add Manually
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add News Item</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Headline *</Label>
                  <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
                </div>
                <div>
                  <Label>URL *</Label>
                  <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Source *</Label>
                    <Input value={formSource} onChange={(e) => setFormSource(e.target.value)} placeholder="e.g. Eater" />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category *</Label>
                    <Select value={formCategory} onValueChange={setFormCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Chef</Label>
                    <Select value={formChefSlug} onValueChange={setFormChefSlug}>
                      <SelectTrigger><SelectValue placeholder="Select chef..." /></SelectTrigger>
                      <SelectContent>
                        {chefOptions.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Relevance</Label>
                  <Select value={formRelevance} onValueChange={setFormRelevance}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80">High Impact</SelectItem>
                      <SelectItem value="50">Medium Impact</SelectItem>
                      <SelectItem value="25">Notable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Summary</Label>
                  <Textarea value={formSummary} onChange={(e) => setFormSummary(e.target.value)} rows={3} placeholder="Brief summary..." />
                </div>
                <Button onClick={handleManualAdd} className="w-full">Add News Item</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Digest Signup Bar */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">Daily Chef News Digest</p>
              <p className="text-xs text-muted-foreground">Get top stories delivered to your inbox every morning</p>
            </div>
          </div>
          <div className="flex-1" />
          {subscribed ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Subscribed!
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="your@email.com"
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
                className="w-56"
                onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
              />
              <Button size="sm" onClick={handleSubscribe} disabled={subscribing}>
                {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Taste Toggle — segmented button */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border bg-muted p-1">
          <button
            onClick={() => handleTasteToggle(false)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              !tasteOnly ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All News
          </button>
          <button
            onClick={() => handleTasteToggle(true)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tasteOnly ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Taste Signals Only
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {tasteOnly
            ? `Showing ${total} of ${total + (totalTasteRelevant < total ? 0 : totalTasteRelevant)} taste-relevant items`
            : `Showing ${total} items${totalTasteRelevant > 0 ? ` (${totalTasteRelevant} taste-relevant)` : ""}`
          }
        </p>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Badge
            key={cat.value}
            variant={selectedCategories.has(cat.value) ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => toggleCategory(cat.value)}
          >
            {cat.emoji} {cat.label}
          </Badge>
        ))}
      </div>

      {/* Sort & Impact Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Sort by</Label>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Most Recent</SelectItem>
              <SelectItem value="relevance">Highest Relevance</SelectItem>
              <SelectItem value="chefScore">Chef Score</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Impact</Label>
          <Select value={impactFilter || "__all__"} onValueChange={(v) => { setImpactFilter(v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Levels</SelectItem>
              <SelectItem value="high">High Impact</SelectItem>
              <SelectItem value="medium">Medium Impact</SelectItem>
              <SelectItem value="notable">Notable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search headlines & summaries..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={chefFilter} onValueChange={(v) => { setChefFilter(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger><SelectValue placeholder="All Chefs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Chefs</SelectItem>
            {chefOptions.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by source..."
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
        />
      </div>

      {/* News Feed */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
            </CardContent></Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Newspaper className="h-12 w-12 mx-auto mb-3 opacity-50" />
            {tasteOnly ? (
              <>
                <p className="font-medium">No taste-relevant news found yet</p>
                <p className="text-sm mt-1">Try refreshing or switch to All News to see everything.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => handleTasteToggle(false)}>
                  Switch to All News
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium">No news items yet</p>
                <p className="text-sm mt-1">Click &quot;Refresh News&quot; to fetch the latest articles, or add one manually.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.OTHER;
            const impact = item.isTasteRelevant ? getImpactLevel(item.relevanceScore) : null;
            return (
              <Card
                key={item.id}
                className={`hover:shadow-sm transition-shadow ${
                  item.isTasteRelevant ? "border-l-4 border-l-blue-400" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="w-24 h-16 object-cover rounded shrink-0 hidden sm:block"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {cat.emoji} {cat.value === "OTHER" ? "Other" : cat.label.split(" / ")[0]}
                        </Badge>
                        {item.isTasteRelevant && (
                          <Badge variant="outline" className="shrink-0 text-xs border border-blue-200 bg-blue-50 text-blue-700">
                            Taste Signal
                          </Badge>
                        )}
                        {impact && (
                          <Badge variant="outline" className={`shrink-0 text-xs border ${impact.color}`}>
                            {impact.icon} {impact.label}
                          </Badge>
                        )}
                        {item.relevanceCategory && (
                          <span className="text-xs text-muted-foreground">{item.relevanceCategory}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
                      </div>
                      <h3 className="font-medium leading-snug">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline underline-offset-2"
                        >
                          {item.title}
                          <ExternalLink className="inline ml-1 h-3 w-3 text-muted-foreground" />
                        </a>
                      </h3>
                      {item.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{item.summary}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{item.source}</span>
                        {item.chefs.length > 0 && (
                          <div className="flex items-center gap-1">
                            {item.chefs.map((c) => (
                              <Link
                                key={c.chef.slug}
                                href={`/chefs/${c.chef.slug}`}
                                className="text-primary hover:underline"
                              >
                                {c.chef.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
