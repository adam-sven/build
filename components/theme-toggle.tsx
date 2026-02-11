"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "trencher-theme";
type ThemeMode = "dark" | "light";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("trencher-light", mode === "light");
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = (window.localStorage.getItem(KEY) as ThemeMode | null) || "dark";
    const next = saved === "light" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
  }, []);

  const toggle = () => {
    const next: ThemeMode = mode === "light" ? "dark" : "light";
    setMode(next);
    window.localStorage.setItem(KEY, next);
    applyTheme(next);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      className={compact ? "h-8 border-white/20 px-2 text-xs" : "h-9 border-white/20 px-2.5 text-xs"}
      title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {mode === "light" ? <Moon className="mr-1 h-3.5 w-3.5" /> : <Sun className="mr-1 h-3.5 w-3.5" />}
      {mode === "light" ? "Dark" : "Light"}
    </Button>
  );
}

