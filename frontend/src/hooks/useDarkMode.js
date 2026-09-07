import { useEffect, useState } from "react";

/**
 * Manages dark mode state, persisted to localStorage, applied via the
 * "dark" class on <html> (matches our @custom-variant setup in index.css).
 * Falls back to the OS-level preference on first visit.
 */
export function useDarkMode() {
    const [isDark, setIsDark] = useState(() => {
        const stored = localStorage.getItem("theme");
        if (stored) return stored === "dark";
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    });

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            root.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
    }, [isDark]);

    return [isDark, setIsDark];
}