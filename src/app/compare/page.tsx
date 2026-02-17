"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRadar } from "@/components/charts/score-radar";
import { formatScore } from "@/lib/utils";
import type { ScoreBreakdown } from "@/types";
import { GitCompare, X, Search, Plus } from "lucide-react";

interface ChefOption {
  id: string;
  name: string;
  slug: string;
  totalScore: number;
  rank: number | null;
  currentRestaurant: string | null;
}

interface CompareResult {
  chef: ChefOption & {
    accolades: { type: string; detail: string | null }[];
  };
  breakdown: ScoreBreakdown;
  totalScore: number;
}

export default function ComparePage() {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [chefOptions, setChefOptions] = useState<ChefOption[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CompareResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    fetch("/api/chefs?limit=100")
      .then((r) => r.json())
      .then((data) => setChefOptions(data.chefs));
  }, []);

  useEffect(() => {
    if (selectedSlugs.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    fetch(`/api/compare?slugs=${selectedSlugs.join(",")}`)
      .then((r) => r.json())
      .then((data) => { setResults(data.comparisons); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedSlugs]);

  const filteredOptions = chefOptions.filter(
    (c) => !selectedSlugs.includes(c.slug) && c.name.toLowerCase().includes(search.toLowerCase())
  );

  const LABELS: Record<string, string> = {
    formalAccolades: "Formal Accolades",
    careerTrack: "Career Track",
    publicSignals: "Public Signals",
    peerStanding: "Peer Standing",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <GitCompare className="h-6 w-6" /> Compare Chefs
      </h1>

      {/* Selected chefs */}
      <div className="flex flex-wrap gap-2 items-center">
        {selectedSlugs.map((slug) => {
          const chef = chefOptions.find((c) => c.slug === slug);
          return (
            <Badge key={slug} variant="default" className="text-sm py-1 px-3 gap-1">
              {chef?.name || slug}
              <button onClick={() => setSelectedSlugs((s) => s.filter((x) => x !== slug))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {selectedSlugs.length < 4 && (
          <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
            <Plus className="h-4 w-4 mr-1" /> Add Chef
          </Button>
        )}
      </div>

      {/* Search dropdown */}
      {showSearch && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chefs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredOptions.slice(0, 10).map((chef) => (
                <button
                  key={chef.id}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex justify-between items-center"
                  onClick={() => {
                    setSelectedSlugs((s) => [...s, chef.slug]);
                    setShowSearch(false);
                    setSearch("");
                  }}
                >
                  <span className="font-medium">{chef.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {chef.currentRestaurant} · {formatScore(chef.totalScore)}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedSlugs.length < 2 && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Select 2–4 chefs to compare.</p>
          </CardContent>
        </Card>
      )}

      {loading && <Skeleton className="h-64" />}

      {results && results.length >= 2 && (
        <>
          {/* Radar Chart */}
          <Card>
            <CardHeader><CardTitle className="text-base">Score Profile Comparison</CardTitle></CardHeader>
            <CardContent>
              <ScoreRadar data={results.map((r) => ({ name: r.chef.name, breakdown: r.breakdown }))} />
            </CardContent>
          </Card>

          {/* Comparison Table */}
          <Card>
            <CardHeader><CardTitle className="text-base">Detailed Comparison</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Category</th>
                    {results.map((r) => (
                      <th key={r.chef.id} className="text-right py-2 px-2">{r.chef.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(LABELS).map(([key, label]) => (
                    <tr key={key} className="border-b">
                      <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                      {results.map((r) => {
                        const val = r.breakdown[key as keyof ScoreBreakdown];
                        const isMax = val === Math.max(...results.map((x) => x.breakdown[key as keyof ScoreBreakdown]));
                        return (
                          <td key={r.chef.id} className={`text-right py-2 px-2 ${isMax ? "font-bold text-primary" : ""}`}>
                            {val.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-2 pr-4">Total Score</td>
                    {results.map((r) => (
                      <td key={r.chef.id} className="text-right py-2 px-2">{formatScore(r.totalScore)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
