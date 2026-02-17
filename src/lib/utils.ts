import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function getImpactLevel(score: number): { label: string; color: string; icon: string } {
  if (score >= 70) return { label: "High Impact", color: "text-red-600 bg-red-50 border-red-200", icon: "🔴" };
  if (score >= 40) return { label: "Medium Impact", color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: "🟡" };
  return { label: "Notable", color: "text-green-600 bg-green-50 border-green-200", icon: "🟢" };
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
