import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

type ThemeState = { theme: Theme; resolved: "light" | "dark"; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeState>({
  theme: "system",
  resolved: "light",
  setTheme: () => undefined,
});
const STORAGE_KEY = "support-agent.theme";

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Applies light, dark or the device's theme to <html>; the choice stays in this browser. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [system, setSystem] = useState<"light" | "dark">(systemTheme);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const resolved = theme === "system" ? system : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode: the theme still applies for this page.
    }
  }, [resolved, theme]);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
