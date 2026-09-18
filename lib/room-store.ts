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

type DinnerRoom = {
  code: string;
  createdAt: number;
  expiresAt: number;
  participants: RoomParticipant[];
  restaurants: RoomRestaurant[];
  preferences: {
    cravings: string[];
    dietary: string[];
  };
  meta: RoomMeta;
  votes: Record<string, Record<string, RoomVote>>;
  resultRestaurantId: string | null;
  resultSupport: number;
  fallback: boolean;
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
  preferences: DinnerRoom["preferences"];
  meta: RoomMeta;
  resultRestaurantId: string | null;
  resultSupport: number;
  fallback: boolean;
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

declare global {
  // eslint-disable-next-line no-var
  var __girlDinnerRooms: Map<string, DinnerRoom> | undefined;
}

const rooms = globalThis.__girlDinnerRooms ?? new Map<string, DinnerRoom>();
globalThis.__girlDinnerRooms = rooms;

function makeCode() {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

function makeParticipantId() {
  return crypto.randomUUID();
}

function removeExpiredRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.expiresAt <= now) rooms.delete(code);
  }
}

function publicRoom(room: DinnerRoom): PublicDinnerRoom {
  const complete = room.participants.every((participant) => participant.completedAt !== null);
  return {
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
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
    resultRestaurantId: room.resultRestaurantId,
    resultSupport: room.resultSupport,
    fallback: room.fallback,
  };
}

function resolveRoom(room: DinnerRoom) {
  if (!room.participants.every((participant) => participant.completedAt !== null)) return;

  const ranked = room.restaurants
    .map((restaurant) => {
      const reactions = room.participants.map(
        (participant) => room.votes[participant.id]?.[restaurant.id],
      );
      const supporters = reactions.filter(
        (reaction) => reaction === "interested" || reaction === "love",
      ).length;
      const passes = reactions.filter((reaction) => reaction === "pass").length;
      const tableScore = reactions.reduce((sum, reaction) => {
        if (reaction === "love") return sum + 2;
        if (reaction === "interested") return sum + 1;
        return sum - 1;
      }, 0);
      return { restaurant, supporters, passes, tableScore };
    })
    .sort(
      (a, b) =>
        b.supporters - a.supporters ||
        b.tableScore - a.tableScore ||
        b.restaurant.score - a.restaurant.score,
    );

  const best = ranked[0];
  const requiredSupport = Math.ceil(room.participants.length * 0.6);
  if (best && best.supporters >= requiredSupport && best.tableScore > 0 && best.passes <= 1) {
    room.resultRestaurantId = best.restaurant.id;
    room.resultSupport = best.supporters;
    room.fallback = false;
  } else {
    room.resultRestaurantId = null;
    room.resultSupport = 0;
    room.fallback = true;
  }
}

export function createRoom(input: CreateRoomInput) {
  removeExpiredRooms();
  let code = makeCode();
  while (rooms.has(code)) code = makeCode();

  const now = Date.now();
  const participants = input.names.map((name, index) => ({
    id: makeParticipantId(),
    name: name.trim() || (index === 0 ? "Host" : `Friend ${index + 1}`),
    joinedAt: index === 0 ? now : null,
    completedAt: null,
  }));
  const room: DinnerRoom = {
    code,
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    participants,
    restaurants: input.restaurants,
    preferences: {
      cravings: input.cravings,
      dietary: input.dietary,
    },
    meta: input.meta,
    votes: {},
    resultRestaurantId: null,
    resultSupport: 0,
    fallback: false,
  };

  rooms.set(code, room);
  return { room: publicRoom(room), participantId: participants[0].id };
}

export function getRoom(code: string) {
  removeExpiredRooms();
  const room = rooms.get(code.toUpperCase());
  return room ? publicRoom(room) : null;
}

export function joinRoom(code: string, slot: number) {
  removeExpiredRooms();
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Room not found or expired." } as const;

  const participant = room.participants[slot];
  if (!participant) return { error: "That seat does not exist." } as const;
  if (participant.joinedAt !== null) return { error: "That person has already joined." } as const;

  participant.joinedAt = Date.now();
  return { room: publicRoom(room), participantId: participant.id } as const;
}

export function recordVote(
  code: string,
  participantId: string,
  restaurantId: string,
  vote: RoomVote,
) {
  removeExpiredRooms();
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Room not found or expired." } as const;

  const participant = room.participants.find((entry) => entry.id === participantId);
  if (!participant) return { error: "This participant does not belong to the room." } as const;
  if (!room.restaurants.some((restaurant) => restaurant.id === restaurantId)) {
    return { error: "That restaurant is not in this room." } as const;
  }

  const participantVotes = room.votes[participant.id] ?? {};
  participantVotes[restaurantId] = vote;
  room.votes[participant.id] = participantVotes;

  if (Object.keys(participantVotes).length >= room.restaurants.length) {
    participant.completedAt = Date.now();
  }

  resolveRoom(room);
  return { room: publicRoom(room) } as const;
}
