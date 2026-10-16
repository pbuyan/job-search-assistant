import { notFound } from "next/navigation";

// Unmatched paths under a locale render [locale]/not-found.tsx, which is
// localized; without this they'd fall through to Next's default 404.
export default function CatchAllPage() {
  notFound();
}
