"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, ChefHat } from "lucide-react";
import { formatScore } from "@/lib/utils";

interface Chef {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  currentRestaurant: string | null;
  cuisineSpecialties: string | null;
  totalScore: number;
  rank: number | null;
  accolades: { type: string; detail: string | null }[];
}

export default function ChefsPage() {
  const [chefs, setChefs] = useState<Chef[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("limit", "100");
    fetch(`/api/chefs?${params}`)
      .then((r) => r.json())
      .then((data) => { setChefs(data.chefs); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search]);

  function parseCuisines(raw: string | null): string[] {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All Chefs</h1>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chefs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent></Card>
          ))}
        </div>
      ) : chefs.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No chefs found.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {chefs.map((chef) => (
            <Link key={chef.id} href={`/chefs/${chef.slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{chef.name}</h3>
                      {chef.currentRestaurant && (
                        <p className="text-sm text-muted-foreground">{chef.currentRestaurant}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">{formatScore(chef.totalScore)}</div>
                      {chef.rank && <div className="text-xs text-muted-foreground">#{chef.rank}</div>}
                    </div>
                  </div>
                  {(chef.city || chef.country) && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[chef.city, chef.country].filter(Boolean).join(", ")}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {parseCuisines(chef.cuisineSpecialties).slice(0, 3).map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                    ))}
                    {chef.accolades.slice(0, 2).map((a, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {a.type === "MICHELIN_STAR" ? `Michelin ${a.detail}` :
                         a.type === "JAMES_BEARD" ? "James Beard" :
                         a.type === "WORLDS_50_BEST" ? "50 Best" :
                         a.type === "BOCUSE_DOR" ? "Bocuse d'Or" : a.type}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
