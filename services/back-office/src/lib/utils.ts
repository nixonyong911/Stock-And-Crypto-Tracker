import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Rebuild trigger: embed Supabase credentials at build time
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

