import type { Appearance } from "@clerk/ui";
import { shadcn } from "@clerk/ui/themes";

// The shadcn theme maps colors only; the variables below add the font, radius,
// card background and borders. All values are the app's CSS variables, so
// Clerk follows the light/dark class that next-themes sets on <html>.
export const clerkAppearance = {
  theme: shadcn,
  variables: {
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius)",
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorBorder: "var(--border)",
    // shadcn's --input is a border color; the app's inputs sit transparent on
    // the card, so the input fill is the card color.
    colorInput: "var(--card)",
    colorInputForeground: "var(--card-foreground)",
    // The app's focus ring is ring/50.
    colorRing: "color-mix(in oklab, var(--ring) 50%, transparent)",
    colorDanger: "var(--destructive)",
  },
  elements: {
    // Same border and dark tint as the app's <Input>. Clerk's styles are
    // unlayered, so they beat Tailwind's layered utilities without `!`.
    formFieldInput: "border! border-input! dark:bg-input/30!",
  },
} satisfies Appearance;
