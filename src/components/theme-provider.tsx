"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Theme choice lives in localStorage only (per device); next-themes' inline
// script applies the `.dark` class before paint, so there's no flash.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
