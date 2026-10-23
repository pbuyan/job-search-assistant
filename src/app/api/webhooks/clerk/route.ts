import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { deleteUserData } from "@/db/queries/users";

export const runtime = "nodejs";

// Clerk webhook (signed with CLERK_WEBHOOK_SIGNING_SECRET). A user deleted
// from Clerk's side takes all of their data with them. Nothing here logs the
// payload: it carries the user's email and name.
export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "user.deleted" && event.data.id) {
    try {
      await deleteUserData(event.data.id);
    } catch {
      // Non-2xx makes Clerk retry the delivery.
      return new Response("Failed", { status: 500 });
    }
  }
  return new Response(null, { status: 204 });
}
