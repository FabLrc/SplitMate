"use client";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Basculer le thème">
      <span className="dark:hidden">🌙</span>
      <span className="hidden dark:inline">☀️</span>
    </Button>
  );
}
