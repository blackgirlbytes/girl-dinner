import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RoomVote = "pass" | "interested" | "love";

export type RoomRestaurant = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  priceLevel: number;
  address: string;
  distanceKm: number | null;
  openNow: boolean | null;
  tags: string[];
  orderIdeas: string[];
  mapsUrl: string | null;
  websiteUrl: string | null;
  score: number;
  confidence: number | null;
  why: string;
};

export type RoomMeta = {
  source: "google" | "sample";
  scoring: "jev" | "local";
  notices: string[];
  dietaryNotice: string;
};

type RoomParticipant = {
  id: string;
  name: string;
  joinedAt: number | null;
  completedAt: number | null;
};

type DinnerRoomRow = {
  code: string;
  created_at: string;
  expires_at: string;
  participants: RoomParticipant[];
  restaurants: RoomRestaurant[];
  preferences: {
    cravings: string[];
    dietary: string[];
  };
  meta: RoomMeta;
  votes: Record<string, Record<string, RoomVote>>;
  result_restaurant_id: string | null;
  result_support: number;
  fallback: boolean;
  realtime_token: string;
  revision: number;
};

export type PublicDinnerRoom = {
  code: string;
  createdAt: number;
  expiresAt: number;
  status: "voting" | "complete";
  participants: Array<{
    slot: number;
    name: string;
    joined: boolean;
    completed: boolean;
  }>;
  restaurants: RoomRestaurant[];
  preferences: DinnerRoomRow["preferences"];
  meta: RoomMeta;
  resultRestaurantId: string | null;
  resultSupport: number;
  fallback: boolean;
  revision: number;
};

type CreateRoomInput = {
  names: string[];
  restaurants: RoomRestaurant[];
  cravings: string[];
  dietary: string[];
  meta: RoomMeta;
};

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase room storage is not configured.");
  }

  supabaseAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseAdmin;
}

function makeCode() {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

function publicRoom(room: DinnerRoomRow): PublicDinnerRoom {
  const complete = room.participants.every((participant) => participant.completedAt !== null);
  return {
    code: room.code,
    createdAt: new Date(room.created_at).getTime(),
    expiresAt: new Date(room.expires_at).getTime(),
    status: complete ? "complete" : "voting",
    participants: room.participants.map((participant, slot) => ({
      slot,
      name: participant.name,
      joined: participant.joinedAt !== null,
      completed: participant.completedAt !== null,
    })),
    restaurants: room.restaurants,
    preferences: room.preferences,
    meta: room.meta,
    resultRestaurantId: room.result_restaurant_id,
    resultSupport: room.result_support,
    fallback: room.fallback,
    revision: Number(room.revision),
  };
}

function roomError(message: string | undefined) {
  if (message?.includes("ROOM_NOT_FOUND")) return "Room not found or expired.";
  if (message?.includes("SEAT_NOT_FOUND")) return "That seat does not exist.";
  if (message?.includes("SEAT_TAKEN")) return "That person has already joined.";
  if (message?.includes("PARTICIPANT_NOT_FOUND")) return "This participant does not belong to the room.";
  if (message?.includes("RESTAURANT_NOT_FOUND")) return "That restaurant is not in this room.";
  if (message?.includes("VOTING_COMPLETE")) return "These votes have already been submitted.";
  return "The dinner room could not be updated.";
}

export async function createRoom(input: CreateRoomInput) {
  const client = getSupabaseAdmin();
  const now = Date.now();
  const participants = input.names.map((name, index) => ({
    id: crypto.randomUUID(),
    name: name.trim() || (index === 0 ? "Host" : `Friend ${index + 1}`),
    joinedAt: index === 0 ? now : null,
    completedAt: null,
  }));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await client
      .rpc("girl_dinner_create_room", {
        p_code: makeCode(),
        p_expires_at: new Date(now + ROOM_TTL_MS).toISOString(),
        p_participants: participants,
        p_restaurants: input.restaurants,
        p_preferences: { cravings: input.cravings, dietary: input.dietary },
        p_meta: input.meta,
      })
      .single();

    if (!error && data) {
      const room = data as DinnerRoomRow;
      return {
        room: publicRoom(room),
        participantId: participants[0].id,
        realtimeToken: room.realtime_token,
      };
    }
    if (error?.code !== "23505") throw new Error(roomError(error?.message));
  }

  throw new Error("A unique room code could not be created. Please try again.");
}

export async function getRoom(code: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("dinner_rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(roomError(error.message));
  return data ? publicRoom(data as DinnerRoomRow) : null;
}

export async function joinRoom(code: string, slot: number) {
  const { data, error } = await getSupabaseAdmin()
    .rpc("girl_dinner_join_room", { p_code: code.toUpperCase(), p_slot: slot })
    .single();

  if (error || !data) return { error: roomError(error?.message) } as const;

  const room = data as DinnerRoomRow;
  const participant = room.participants[slot];
  if (!participant) return { error: "That seat does not exist." } as const;

  return {
    room: publicRoom(room),
    participantId: participant.id,
    realtimeToken: room.realtime_token,
  } as const;
}

export async function recordVote(
  code: string,
  participantId: string,
  restaurantId: string,
  vote: RoomVote,
) {
  const { data, error } = await getSupabaseAdmin()
    .rpc("girl_dinner_record_vote", {
      p_code: code.toUpperCase(),
      p_participant_id: participantId,
      p_restaurant_id: restaurantId,
      p_vote: vote,
    })
    .single();

  if (error || !data) return { error: roomError(error?.message) } as const;

  const room = data as DinnerRoomRow;
  return { room: publicRoom(room) } as const;
}
