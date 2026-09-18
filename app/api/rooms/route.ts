import { createRoom, type RoomMeta, type RoomRestaurant } from "@/lib/room-store";

export const runtime = "nodejs";

type CreateRoomRequest = {
  names?: string[];
  restaurants?: RoomRestaurant[];
  cravings?: string[];
  dietary?: string[];
  meta?: RoomMeta;
};

export async function POST(request: Request) {
  let input: CreateRoomRequest;

  try {
    input = (await request.json()) as CreateRoomRequest;
  } catch {
    return Response.json({ error: "Send room details as JSON." }, { status: 400 });
  }

  if (!Array.isArray(input.names) || input.names.length < 2 || input.names.length > 8) {
    return Response.json({ error: "Separate-phone rooms need between 2 and 8 people." }, { status: 400 });
  }
  if (!Array.isArray(input.restaurants) || input.restaurants.length === 0 || input.restaurants.length > 12) {
    return Response.json({ error: "A room needs between 1 and 12 restaurant choices." }, { status: 400 });
  }
  if (!input.meta) {
    return Response.json({ error: "Recommendation details are missing." }, { status: 400 });
  }

  const result = createRoom({
    names: input.names,
    restaurants: input.restaurants,
    cravings: Array.isArray(input.cravings) ? input.cravings.slice(0, 12) : [],
    dietary: Array.isArray(input.dietary) ? input.dietary.slice(0, 12) : [],
    meta: input.meta,
  });

  return Response.json(result, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
