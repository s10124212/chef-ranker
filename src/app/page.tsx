"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  ChevronUp,
  ChevronDown,
  Minus,
  Search,
  Trophy,
  ArrowUpDown,
  Newspaper,
  ExternalLink,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { RankingEntry } from "@/types";
import { formatScore, getCurrentMonth } from "@/lib/utils";

type SortField = "rank" | "name" | "score";
type SortDirection = "asc" | "desc";

interface Filters {
  search: string;
  cuisine: string;
  country: string;
  scoreMin: string;
  scoreMax: string;
}

function parseCuisines(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function HomePage() {
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    cuisine: "",
    country: "",
    scoreMin: "",
    scoreMax: "",
  });
  const [latestNews, setLatestNews] = useState<{ id: string; title: string; url: string; source: string; publishedAt: string; category: string; chefs: { chef: { name: string; slug: string } }[] }[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);

  const currentMonth = getCurrentMonth();

  // Derive unique cuisines and countries from fetched data
  const { cuisineOptions, countryOptions } = useMemo(() => {
    const cuisines = new Set<string>();
    const countries = new Set<string>();
    for (const entry of rankings) {
      const c = parseCuisines(entry.chef.cuisineSpecialties);
      c.forEach((cuisine) => cuisines.add(cuisine));
      if (entry.chef.country) countries.add(entry.chef.country);
    }
    return {
      cuisineOptions: Array.from(cuisines).sort(),
      countryOptions: Array.from(countries).sort(),
    };
  }, [rankings]);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (filters.cuisine) params.set("cuisine", filters.cuisine);
      if (filters.country) params.set("country", filters.country);

      const res = await fetch(`/api/rankings/current?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch rankings");
      const data = await res.json();
      setRankings(data.rankings ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Error fetching rankings:", err);
      setRankings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters.cuisine, filters.country]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  useEffect(() => {
    fetch("/api/news?limit=5")
      .then((r) => r.json())
      .then((data) => setLatestNews(data.items || []))
      .catch(() => {});
  }, []);

  // Client-side filtering and sorting
  const filteredAndSorted = useMemo(() => {
    let result = [...rankings];

    // Text search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.chef.name.toLowerCase().includes(q) ||
          (entry.chef.currentRestaurant &&
            entry.chef.currentRestaurant.toLowerCase().includes(q)) ||
          (entry.chef.city && entry.chef.city.toLowerCase().includes(q))
      );
    }

    // Score range
    if (filters.scoreMin) {
      const min = parseFloat(filters.scoreMin);
      if (!isNaN(min)) result = result.filter((e) => e.totalScore >= min);
    }
    if (filters.scoreMax) {
      const max = parseFloat(filters.scoreMax);
      if (!isNaN(max)) result = result.filter((e) => e.totalScore <= max);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rank":
          cmp = (a.rank ?? 9999) - (b.rank ?? 9999);
          break;
        case "name":
          cmp = a.chef.name.localeCompare(b.chef.name);
          break;
        case "score":
          cmp = a.totalScore - b.totalScore;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [rankings, filters.search, filters.scoreMin, filters.scoreMax, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "score" ? "desc" : "asc");
    }
  }

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    if (key === "cuisine" || key === "country") {
      setPage(1);
    }
  }

  function renderDelta(delta: number | null) {
    if (delta === null || delta === 0) {
      return (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Minus className="h-3.5 w-3.5" />
          <span className="text-xs">--</span>
        </span>
      );
    }
    if (delta > 0) {
      return (
        <span className="flex items-center gap-1 text-emerald-600">
          <ChevronUp className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">+{delta}</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-red-500">
        <ChevronDown className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{delta}</span>
      </span>
    );
  }

  function getTopAccolade(accolades: RankingEntry["chef"]["accolades"]): string | null {
    if (!accolades || accolades.length === 0) return null;
    const first = accolades[0];
    return first.detail || first.type;
  }

  async function handleExportPdf() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Chef Rankings", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | Month: ${currentMonth}`, 14, 28);

    const tableData = filteredAndSorted.map((entry) => [
      String(entry.rank ?? "--"),
      entry.chef.name,
      [entry.chef.city, entry.chef.country].filter(Boolean).join(", "),
      parseCuisines(entry.chef.cuisineSpecialties).join(", ") || "--",
      formatScore(entry.totalScore),
      entry.delta === null ? "--" : entry.delta > 0 ? `+${entry.delta}` : String(entry.delta),
    ]);

    autoTable(doc, {
      startY: 34,
      head: [["#", "Name", "Location", "Cuisine", "Score", "Delta"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });

    doc.save(`chef-rankings-${currentMonth}.pdf`);
  }

  function renderSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chef Rankings</h1>
            <p className="text-sm text-muted-foreground">
              Current leaderboard for {currentMonth}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/archive">
            <Button variant="outline" size="sm">
              Past Months
            </Button>
          </Link>
          <a href="/api/export?format=csv" download>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileText className="mr-1.5 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <Separator />

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search chefs..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filters.cuisine}
          onValueChange={(val) => updateFilter("cuisine", val === "__all__" ? "" : val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Cuisines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Cuisines</SelectItem>
            {cuisineOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.country}
          onValueChange={(val) => updateFilter("country", val === "__all__" ? "" : val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Countries</SelectItem>
            {countryOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="Min score"
          value={filters.scoreMin}
          onChange={(e) => updateFilter("scoreMin", e.target.value)}
        />

        <Input
          type="number"
          placeholder="Max score"
          value={filters.scoreMax}
          onChange={(e) => updateFilter("scoreMax", e.target.value)}
        />
      </div>

      {/* Batch Action Bar */}
      {selectedSlugs.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedSlugs.size} chef{selectedSlugs.size > 1 ? "s" : ""} selected</span>
          <Button size="sm" disabled={batchGenerating} onClick={async () => {
            setBatchGenerating(true);
            try {
              // Resolve slugs to IDs
              const chefIds = rankings
                .filter((e) => selectedSlugs.has(e.chef.slug))
                .map((e) => e.chef.id);
              const res = await fetch("/api/outreach/generate-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chefIds }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Batch generation failed");
              toast.success(`Generated ${data.success} drafts (${data.failed} failed). View them in Outreach tab.`);
              setSelectedSlugs(new Set());
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBatchGenerating(false);
            }
          }}>
            {batchGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {batchGenerating ? "Generating..." : "Generate Drafts"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedSlugs(new Set())}>Clear</Button>
        </div>
      )}

      {/* Rankings Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {loading
              ? "Loading rankings..."
              : `Showing ${filteredAndSorted.length} of ${total} chefs`}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-3 px-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-8" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-28" />
                </div>
              ))}
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Trophy className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No chefs found</p>
              <p className="text-xs">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="rounded border-muted-foreground"
                      checked={selectedSlugs.size > 0 && filteredAndSorted.every((e) => selectedSlugs.has(e.chef.slug))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSlugs(new Set(filteredAndSorted.map((entry) => entry.chef.slug)));
                        } else {
                          setSelectedSlugs(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead
                    className="w-16 cursor-pointer select-none"
                    onClick={() => handleSort("rank")}
                  >
                    <span className="flex items-center">
                      #
                      {renderSortIcon("rank")}
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                  >
                    <span className="flex items-center">
                      Name
                      {renderSortIcon("name")}
                    </span>
                  </TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Cuisine</TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => handleSort("score")}
                  >
                    <span className="flex items-center justify-end">
                      Score
                      {renderSortIcon("score")}
                    </span>
                  </TableHead>
                  <TableHead className="w-20 text-center">Delta</TableHead>
                  <TableHead>Top Accolade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSorted.map((entry) => {
                  const cuisines = parseCuisines(entry.chef.cuisineSpecialties);
                  const topAccolade = getTopAccolade(entry.chef.accolades);
                  const location = [entry.chef.city, entry.chef.country]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <TableRow key={entry.chef.slug}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="rounded border-muted-foreground"
                          checked={selectedSlugs.has(entry.chef.slug)}
                          onChange={(e) => {
                            const next = new Set(selectedSlugs);
                            if (e.target.checked) next.add(entry.chef.slug);
                            else next.delete(entry.chef.slug);
                            setSelectedSlugs(next);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-muted-foreground">
                        {entry.rank ?? "--"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/chefs/${entry.chef.slug}`}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {entry.chef.name}
                        </Link>
                        {entry.chef.currentRestaurant && (
                          <p className="text-xs text-muted-foreground">
                            {entry.chef.currentRestaurant}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {location || "--"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cuisines.length > 0
                            ? cuisines.slice(0, 2).map((c) => (
                                <Badge key={c} variant="secondary" className="text-xs">
                                  {c}
                                </Badge>
                              ))
                            : <span className="text-sm text-muted-foreground">--</span>}
                          {cuisines.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{cuisines.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatScore(entry.totalScore)}
                      </TableCell>
                      <TableCell className="text-center">
                        {renderDelta(entry.delta)}
                      </TableCell>
                      <TableCell>
                        {topAccolade ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            {topAccolade}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Latest News Widget */}
      {latestNews.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <span className="flex items-center gap-2"><Newspaper className="h-4 w-4" /> Latest News</span>
              <Link href="/news"><Button variant="link" size="sm" className="text-xs">View all</Button></Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {latestNews.map((item) => (
                <div key={item.id} className="flex items-start gap-3 border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline underline-offset-2 line-clamp-1">
                      {item.title}
                      <ExternalLink className="inline ml-1 h-3 w-3 text-muted-foreground" />
                    </a>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>{item.source}</span>
                      <span>{new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {item.chefs.slice(0, 2).map((c) => (
                        <Link key={c.chef.slug} href={`/chefs/${c.chef.slug}`} className="text-primary hover:underline">{c.chef.name}</Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
