import { getRoom, joinRoom, recordVote, type RoomVote } from "@/lib/room-store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };
type RoomAction =
  | { action?: "join"; slot?: number }
  | {
      action?: "vote";
      participantId?: string;
      restaurantId?: string;
      vote?: RoomVote;
    };

const VALID_VOTES: RoomVote[] = ["pass", "interested", "love"];

export async function GET(_request: Request, context: RouteContext) {
  const { code } = await context.params;
  try {
    const room = await getRoom(code);
    if (!room) return Response.json({ error: "Room not found or expired." }, { status: 404 });

    return Response.json({ room }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load dinner room", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "The room could not be loaded." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { code } = await context.params;
  let input: RoomAction;

  try {
    input = (await request.json()) as RoomAction;
  } catch {
    return Response.json({ error: "Send a room action as JSON." }, { status: 400 });
  }

  if (input.action === "join") {
    if (!Number.isInteger(input.slot) || typeof input.slot !== "number") {
      return Response.json({ error: "Choose an available person." }, { status: 400 });
    }
    const result = await joinRoom(code, input.slot);
    if ("error" in result) return Response.json(result, { status: 409 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  if (input.action === "vote") {
    if (
      typeof input.participantId !== "string" ||
      typeof input.restaurantId !== "string" ||
      !input.vote ||
      !VALID_VOTES.includes(input.vote)
    ) {
      return Response.json({ error: "The vote is incomplete." }, { status: 400 });
    }

    const result = await recordVote(
      code,
      input.participantId,
      input.restaurantId,
      input.vote,
    );
    if ("error" in result) return Response.json(result, { status: 403 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ error: "Unknown room action." }, { status: 400 });
}
