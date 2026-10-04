import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { signInPath } from "@/lib/auth-routing";

const intl = createMiddleware(routing);

const isPublic = createRouteMatcher([
  "/",
  "/(en|fr)",
  "/(en|fr)/sign-in(.*)",
  "/(en|fr)/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api")) {
    await auth.protect();
    return NextResponse.next();
  }

  if (!isPublic(req)) {
    const { userId } = await auth();
    if (!userId) {
      // Locale-aware redirect; auth.protect() would use one fixed sign-in URL.
      return NextResponse.redirect(new URL(signInPath(pathname, search), req.url));
    }
  }
  return intl(req);
});

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)", "/(api|trpc)(.*)"],
};
