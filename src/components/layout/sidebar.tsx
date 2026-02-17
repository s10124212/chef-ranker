"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Users,
  GitCompare,
  RefreshCw,
  Archive,
  Settings,
  ChefHat,
  Menu,
  X,
  Newspaper,
  Mail,
  HeartPulse,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Rankings", icon: Trophy },
  { href: "/chefs", label: "Chefs", icon: Users },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/update", label: "Monthly Update", icon: RefreshCw },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/health", label: "System Health", icon: HeartPulse },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-6 border-b">
        <ChefHat className="h-8 w-8 text-primary" />
        <div>
          <h1 className="font-bold text-lg">Chef Ranker</h1>
          <p className="text-xs text-muted-foreground">Monthly Rankings</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r bg-card">
        <NavContent />
      </aside>

      {/* Mobile trigger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-2 px-4 py-3 bg-card border-b">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60">
            <NavContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <ChefHat className="h-5 w-5 text-primary" />
        <span className="font-bold text-sm">Chef Ranker</span>
      </div>
    </>
  );
}
