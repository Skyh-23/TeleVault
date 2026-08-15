import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

/**
 * Aurora ThemeToggle — animated light/dark switch.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={`relative w-12 h-[26px] rounded-full transition-colors duration-300 border border-white/60 ${
        dark ? "bg-aurora-ink-soft/70" : "bg-aurora-lavender/40"
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white dark:bg-aurora-surface shadow-md flex items-center justify-center transition-all duration-300 ${
          dark ? "left-[26px]" : "left-0.5"
        }`}
      >
        {dark ? <Moon className="w-3 h-3 text-aurora-violet" /> : <Sun className="w-3 h-3 text-amber-500" />}
      </span>
    </button>
  );
}
