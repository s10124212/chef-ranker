"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Archive, Calendar, ChevronRight, Trophy } from "lucide-react";

interface Snapshot {
  id: string;
  month: string;
  publishedAt: string | null;
  notes: string | null;
  _count: { entries: number };
}

interface SnapshotDetail {
  id: string;
  month: string;
  entries: {
    rank: number;
    totalScore: number;
    delta: number | null;
    chef: {
      name: string;
      slug: string;
      currentRestaurant: string | null;
      city: string | null;
      country: string | null;
    };
  }[];
}

export default function ArchivePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/snapshots")
      .then((r) => r.json())
      .then((data) => { setSnapshots(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function loadSnapshot(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/snapshots/${id}`);
      const data = await res.json();
      setSelected(data);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Archive className="h-6 w-6" /> Archive
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
          ) : snapshots.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No snapshots yet. Publish one from the Monthly Update page.</p>
            </CardContent></Card>
          ) : (
            snapshots.map((snap) => (
              <Card
                key={snap.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${selected?.id === snap.id ? "border-primary" : ""}`}
                onClick={() => loadSnapshot(snap.id)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{snap.month}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {snap._count.entries} chefs ranked
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {detailLoading ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Rankings for {selected.month}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {selected.entries.map((entry) => (
                    <div key={entry.chef.slug} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-right font-mono text-muted-foreground">{entry.rank}</span>
                        <div>
                          <span className="font-medium">{entry.chef.name}</span>
                          {entry.chef.currentRestaurant && (
                            <span className="text-muted-foreground ml-2 text-xs">{entry.chef.currentRestaurant}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.delta !== null && entry.delta !== 0 && (
                          <Badge variant={entry.delta > 0 ? "default" : "destructive"} className="text-xs">
                            {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                          </Badge>
                        )}
                        <span className="font-mono w-12 text-right">{entry.totalScore.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-12 text-center text-muted-foreground">
              Select a snapshot to view its rankings.
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}
