"use client";

import { createClient } from "@supabase/supabase-js";
import { CSSProperties, FormEvent, PointerEvent, useCallback, useEffect, useMemo, useState } from "react";

type Location = { latitude: number; longitude: number };
type Vote = "pass" | "interested" | "love";
type DeviceMode = "shared" | "remote";
type Screen = "setup" | "lobby" | "deck" | "waiting" | "result" | "fallback";

type Restaurant = {
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

type ResponseMeta = {
  source: "google" | "sample";
  scoring: "jev" | "local";
  notices: string[];
  dietaryNotice: string;
};

type PublicDinnerRoom = {
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
  restaurants: Restaurant[];
  preferences: { cravings: string[]; dietary: string[] };
  meta: ResponseMeta;
  resultRestaurantId: string | null;
  resultSupport: number;
  fallback: boolean;
  revision: number;
};

const CRAVING_OPTIONS = [
  "spicy",
  "noodles",
  "pizza",
  "tacos",
  "comfort food",
  "fresh",
  "crunchy",
  "something new",
];

const DIETARY_OPTIONS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut allergy",
  "halal",
];

const VIBES = [
  { value: "cozy and comforting", label: "Cozy", symbol: "☁" },
  { value: "quick and easy", label: "Quick", symbol: "↗" },
  { value: "adventurous", label: "Surprise us", symbol: "✦" },
  { value: "a little special", label: "Cute night", symbol: "♡" },
];

const PLATES = [
  {
    title: "The crunchy little plate",
    time: "8 min",
    items: ["hummus", "warm pita", "cucumbers", "olives", "grapes", "dark chocolate"],
    note: "Warm the pita, put everything else in small piles, and call it dinner.",
  },
  {
    title: "The fridge-door mezze",
    time: "6 min",
    items: ["cheese or marinated tofu", "crackers", "apple slices", "pickles", "mustard", "a cookie"],
    note: "Slice what needs slicing. Keep every component separate and snack your way through it.",
  },
  {
    title: "The warm-and-cold combo",
    time: "12 min",
    items: ["jammy eggs", "buttered toast", "tomatoes", "avocado", "hot sauce", "berries"],
    note: "Make the eggs and toast; arrange the cold things while they cook.",
  },
];

function toggleInList(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function personColor(index: number) {
  return `var(--p${(Math.max(0, index) % 8) + 1})`;
}

function priceMarks(priceLevel: number) {
  return "$".repeat(Math.max(1, Math.min(4, priceLevel)));
}

function voteWeight(vote: Vote | undefined) {
  if (vote === "love") return 2;
  if (vote === "interested") return 1;
  return -1;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [setupStep, setSetupStep] = useState(0);
  const [partySize, setPartySize] = useState(1);
  const [names, setNames] = useState(["You"]);
  const [cravings, setCravings] = useState<string[]>(["comfort food"]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [budget, setBudget] = useState(2);
  const [radiusKm, setRadiusKm] = useState(10);
  const [vibe, setVibe] = useState(VIBES[0].value);
  const [service, setService] = useState("either");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("shared");
  const [joinCode, setJoinCode] = useState("");
  const [customCraving, setCustomCraving] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locationStatus, setLocationStatus] = useState("Not shared");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [meta, setMeta] = useState<ResponseMeta | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [participantIndex, setParticipantIndex] = useState(0);
  const [votes, setVotes] = useState<Record<string, Record<string, Vote>>>({});
  const [winner, setWinner] = useState<Restaurant | null>(null);
  const [winnerSupport, setWinnerSupport] = useState(0);
  const [handoff, setHandoff] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<PublicDinnerRoom | null>(null);
  const [realtimeToken, setRealtimeToken] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [participantSlot, setParticipantSlot] = useState<number | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copy invite link");
  const [voteSubmitting, setVoteSubmitting] = useState(false);

  const participantNames = useMemo(
    () => names.slice(0, partySize).map((name, index) => name.trim() || (index === 0 ? "You" : `Friend ${index + 1}`)),
    [names, partySize],
  );

  const currentRestaurant = restaurants[cardIndex];
  const currentPerson =
    deviceMode === "remote" && participantName
      ? participantName
      : participantNames[participantIndex] ?? "You";
  const progress = restaurants.length ? ((cardIndex + 1) / restaurants.length) * 100 : 0;

  const applyRemoteRoom = useCallback((nextRoom: PublicDinnerRoom) => {
    setRoom(nextRoom);
    setRoomCode(nextRoom.code);
    setRestaurants(nextRoom.restaurants);
    setMeta(nextRoom.meta);
    setPartySize(nextRoom.participants.length);
    setNames(nextRoom.participants.map((participant) => participant.name));
    setCravings(nextRoom.preferences.cravings);
    setDietary(nextRoom.preferences.dietary);

    if (nextRoom.status === "complete") {
      const selected = nextRoom.restaurants.find(
        (restaurant) => restaurant.id === nextRoom.resultRestaurantId,
      );
      if (selected) {
        setWinner(selected);
        setWinnerSupport(nextRoom.resultSupport);
        setScreen("result");
      } else {
        setScreen("fallback");
      }
    }
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase();
    if (!code) return;

    let cancelled = false;
    async function loadRoom() {
      try {
        const response = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
        const data = (await response.json()) as { room?: PublicDinnerRoom; error?: string };
        if (!response.ok || !data.room) throw new Error(data.error ?? "Room not found.");
        if (cancelled) return;

        setDeviceMode("remote");
        applyRemoteRoom(data.room);
        const saved = window.localStorage.getItem(`girl-dinner-room-${code}`);
        if (saved) {
          const identity = JSON.parse(saved) as {
            participantId?: string;
            name?: string;
            slot?: number;
            realtimeToken?: string;
          };
          setParticipantId(identity.participantId ?? "");
          setParticipantName(identity.name ?? "");
          setParticipantSlot(typeof identity.slot === "number" ? identity.slot : null);
          setRealtimeToken(identity.realtimeToken ?? "");
        }
        if (data.room.status !== "complete") setScreen("lobby");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Room not found.");
        setScreen("setup");
      }
    }

    void loadRoom();
    return () => {
      cancelled = true;
    };
  }, [applyRemoteRoom]);

  useEffect(() => {
    if (!roomCode || room?.status === "complete") return;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { room?: PublicDinnerRoom };
        if (data.room) applyRemoteRoom(data.room);
      } catch {
        // A later poll will retry while the room is active.
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [applyRemoteRoom, room?.status, roomCode]);

  useEffect(() => {
    if (!roomCode || !realtimeToken || room?.status === "complete") return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;

    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let active = true;

    async function refreshRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const data = (await response.json()) as { room?: PublicDinnerRoom };
        if (data.room) applyRemoteRoom(data.room);
      } catch {
        // Supabase reconnects automatically; the slower refresh remains as a fallback.
      }
    }

    const channel = client
      .channel(`room:${realtimeToken}`)
      .on("broadcast", { event: "room_changed" }, () => void refreshRoom())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshRoom();
      });

    function refreshVisibleRoom() {
      if (document.visibilityState === "visible") void refreshRoom();
    }

    document.addEventListener("visibilitychange", refreshVisibleRoom);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refreshVisibleRoom);
      void client.removeChannel(channel);
    };
  }, [applyRemoteRoom, realtimeToken, room?.status, roomCode]);

  function updatePartySize(nextSize: number) {
    setPartySize(nextSize);
    setNames((current) =>
      Array.from({ length: nextSize }, (_, index) => current[index] ?? (index === 0 ? "You" : `Friend ${index + 1}`)),
    );
  }

  function updateName(index: number, value: string) {
    setNames((current) => current.map((name, nameIndex) => (nameIndex === index ? value : name)));
  }

  function addCustomCraving() {
    const value = customCraving.trim().toLowerCase();
    if (!value) return;
    setCravings((current) => (current.includes(value) ? current : [...current, value]));
    setCustomCraving("");
  }

  function openRoomFromCode() {
    const code = joinCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (code.length !== 6) {
      setError("Enter the six-character room code.");
      return;
    }
    window.location.assign(`/?room=${code}`);
  }

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Location is unavailable in this browser");
      return;
    }

    setLocationStatus("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("Location ready");
      },
      () => setLocationStatus("Not shared — sample picks will still work"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function findDinner(event: FormEvent) {
    event.preventDefault();
    if (setupStep < 2) {
      setSetupStep((step) => step + 1);
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partySize,
          names: participantNames,
          cravings,
          dietary,
          budget,
          vibe,
          service,
          radiusKm,
          location,
        }),
      });

      const data = (await response.json()) as {
        restaurants?: Restaurant[];
        meta?: ResponseMeta;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "Dinner search failed.");
      if (!data.restaurants?.length) {
        setError(`No matches within ${radiusKm} km for these preferences. Try a wider distance or a different budget.`);
        return;
      }

      const responseMeta = data.meta ?? {
        source: "sample" as const,
        scoring: "local" as const,
        notices: [],
        dietaryNotice: "Dietary and allergen details must be confirmed directly with the restaurant.",
      };
      setRestaurants(data.restaurants);
      setMeta(responseMeta);
      setVotes({});
      setCardIndex(0);
      setParticipantIndex(0);
      setWinner(null);

      if (partySize > 1 && deviceMode === "remote") {
        const roomResponse = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            names: participantNames,
            restaurants: data.restaurants,
            cravings,
            dietary,
            meta: responseMeta,
          }),
        });
        const roomData = (await roomResponse.json()) as {
          room?: PublicDinnerRoom;
          participantId?: string;
          realtimeToken?: string;
          error?: string;
        };
        if (!roomResponse.ok || !roomData.room || !roomData.participantId || !roomData.realtimeToken) {
          throw new Error(roomData.error ?? "The room could not be created.");
        }

        const hostIdentity = {
          participantId: roomData.participantId,
          name: participantNames[0],
          slot: 0,
          realtimeToken: roomData.realtimeToken,
        };
        window.localStorage.setItem(
          `girl-dinner-room-${roomData.room.code}`,
          JSON.stringify(hostIdentity),
        );
        window.history.replaceState({}, "", `/?room=${roomData.room.code}`);
        setParticipantId(hostIdentity.participantId);
        setParticipantName(hostIdentity.name);
        setParticipantSlot(0);
        setRealtimeToken(hostIdentity.realtimeToken);
        applyRemoteRoom(roomData.room);
        setScreen("lobby");
      } else {
        setScreen("deck");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dinner search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function joinRemoteRoom(slot: number) {
    if (!roomCode) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", slot }),
      });
      const data = (await response.json()) as {
        room?: PublicDinnerRoom;
        participantId?: string;
        realtimeToken?: string;
        error?: string;
      };
      if (!response.ok || !data.room || !data.participantId || !data.realtimeToken) {
        throw new Error(data.error ?? "Could not join the room.");
      }

      const name = data.room.participants[slot]?.name ?? "Guest";
      const identity = { participantId: data.participantId, name, slot, realtimeToken: data.realtimeToken };
      window.localStorage.setItem(`girl-dinner-room-${roomCode}`, JSON.stringify(identity));
      setParticipantId(identity.participantId);
      setParticipantName(identity.name);
      setParticipantSlot(slot);
      setRealtimeToken(identity.realtimeToken);
      applyRemoteRoom(data.room);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join the room.");
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteLink() {
    const invite = `${window.location.origin}/?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(invite);
      setCopyStatus("Link copied!");
      window.setTimeout(() => setCopyStatus("Copy invite link"), 1800);
    } catch {
      setCopyStatus("Copy the URL above");
    }
  }

  function startRemoteVoting() {
    if (participantSlot !== null && room?.participants[participantSlot]?.completed) {
      setScreen("waiting");
      return;
    }
    setCardIndex(0);
    setScreen("deck");
  }

  const resolveVotes = useCallback(
    (nextVotes: Record<string, Record<string, Vote>>) => {
      const ranked = restaurants
        .map((restaurant) => {
          const reactions = participantNames.map((name) => nextVotes[name]?.[restaurant.id]);
          const supporters = reactions.filter((reaction) => reaction === "interested" || reaction === "love").length;
          const passes = reactions.filter((reaction) => reaction === "pass").length;
          const tableScore = reactions.reduce<number>((sum, reaction) => sum + voteWeight(reaction), 0);
          return { restaurant, supporters, passes, tableScore };
        })
        .sort(
          (a, b) =>
            b.supporters - a.supporters ||
            b.tableScore - a.tableScore ||
            b.restaurant.score - a.restaurant.score,
        );

      const best = ranked[0];
      const requiredSupport = partySize === 1 ? 1 : Math.ceil(partySize * 0.6);
      if (best && best.supporters >= requiredSupport && best.tableScore > 0 && best.passes <= 1) {
        setWinner(best.restaurant);
        setWinnerSupport(best.supporters);
        setScreen("result");
      } else {
        setScreen("fallback");
      }
    },
    [partySize, participantNames, restaurants],
  );

  const castVote = useCallback(
    async (vote: Vote) => {
      const restaurant = restaurants[cardIndex];
      if (!restaurant || handoff || voteSubmitting) return;

      setDrag({ x: 0, y: 0, active: false });

      if (deviceMode === "remote" && roomCode && participantId) {
        setVoteSubmitting(true);
        setError("");
        try {
          const response = await fetch(`/api/rooms/${roomCode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "vote",
              participantId,
              restaurantId: restaurant.id,
              vote,
            }),
          });
          const data = (await response.json()) as { room?: PublicDinnerRoom; error?: string };
          if (!response.ok || !data.room) throw new Error(data.error ?? "Your vote was not saved.");
          applyRemoteRoom(data.room);
          if (data.room.status !== "complete") {
            if (cardIndex < restaurants.length - 1) setCardIndex((index) => index + 1);
            else setScreen("waiting");
          }
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Your vote was not saved.");
        } finally {
          setVoteSubmitting(false);
        }
        return;
      }

      const nextVotes = {
        ...votes,
        [currentPerson]: {
          ...(votes[currentPerson] ?? {}),
          [restaurant.id]: vote,
        },
      };
      setVotes(nextVotes);

      if (cardIndex < restaurants.length - 1) {
        setCardIndex((index) => index + 1);
        return;
      }

      if (participantIndex < participantNames.length - 1) {
        setParticipantIndex((index) => index + 1);
        setCardIndex(0);
        setHandoff(true);
        return;
      }

      resolveVotes(nextVotes);
    },
    [
      applyRemoteRoom,
      cardIndex,
      currentPerson,
      deviceMode,
      handoff,
      participantId,
      participantIndex,
      participantNames.length,
      resolveVotes,
      restaurants,
      roomCode,
      voteSubmitting,
      votes,
    ],
  );

  useEffect(() => {
    if (screen !== "deck" || handoff) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") castVote("pass");
      if (event.key === "ArrowRight") castVote("interested");
      if (event.key === "ArrowUp") castVote("love");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [castVote, handoff, screen]);

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!drag.active) return;
    setDrag((current) => ({
      ...current,
      x: current.x + event.movementX,
      y: current.y + event.movementY,
    }));
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (!drag.active) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.y < -90 && Math.abs(drag.y) > Math.abs(drag.x)) castVote("love");
    else if (drag.x > 90) castVote("interested");
    else if (drag.x < -90) castVote("pass");
    else setDrag({ x: 0, y: 0, active: false });
  }

  function reset() {
    setScreen("setup");
    setSetupStep(0);
    setRestaurants([]);
    setVotes({});
    setWinner(null);
    setCardIndex(0);
    setParticipantIndex(0);
    setHandoff(false);
    setDeviceMode("shared");
    setRoomCode("");
    setRoom(null);
    setRealtimeToken("");
    setParticipantId("");
    setParticipantSlot(null);
    setParticipantName("");
    setCopyStatus("Copy invite link");
    setError("");
    window.history.replaceState({}, "", "/");
  }

  const selectedPlate = useMemo(() => {
    const seed = cravings.join("").length + dietary.join("").length + partySize;
    const plate = PLATES[seed % PLATES.length];
    const isVegan = dietary.includes("vegan");
    const isDairyFree = dietary.includes("dairy-free") || isVegan;
    const isGlutenFree = dietary.includes("gluten-free");

    const items = plate.items.map((item) => {
      let compatibleItem = item;
      if (isVegan && item === "jammy eggs") compatibleItem = "marinated tofu";
      if (isVegan && item === "cheese or marinated tofu") compatibleItem = "marinated tofu";
      if (isDairyFree && item === "buttered toast") compatibleItem = "olive oil toast";
      if (isGlutenFree && item === "warm pita") compatibleItem = "gluten-free crackers";
      if (isGlutenFree && item === "crackers") compatibleItem = "gluten-free crackers";
      if (isGlutenFree && (item === "buttered toast" || item === "olive oil toast")) {
        compatibleItem = "gluten-free toast";
      }
      return compatibleItem;
    });

    return { ...plate, items };
  }, [cravings, dietary, partySize]);

  const supporters =
    winner && deviceMode === "shared"
      ? participantNames.filter((name) => {
          const reaction = votes[name]?.[winner.id];
          return reaction === "love" || reaction === "interested";
        })
      : [];

  const remoteOnly = partySize > 1 && deviceMode === "remote";

  return (
    <main className={`shell screen-${screen}`}>
      <nav className="topbar" aria-label="Primary navigation">
        <button className="wordmark" type="button" onClick={reset} aria-label="Girl Dinner home">
          girl dinner
        </button>
        {screen !== "setup" || setupStep > 0 ? (
          <button className="text-button" type="button" onClick={reset}>Start over</button>
        ) : null}
      </nav>

      {screen === "setup" ? (
        <form className="screen" onSubmit={findDinner}>
          <div className="steps" aria-label={`Step ${setupStep + 1} of 3`}>
            {[0, 1, 2].map((step) => <span key={step} className={step <= setupStep ? "done" : ""} />)}
          </div>

          {setupStep === 0 ? (
            <>
              <header className="screen-head">
                <h1>Who’s eating tonight?</h1>
                <p>Pick a headcount. Everyone gets a say.</p>
              </header>

              <fieldset className="group">
                <legend className="group-title">How many of you</legend>
                <div className="count-row">
                  {Array.from({ length: 8 }, (_, index) => index + 1).map((size) => (
                    <button
                      type="button"
                      className={partySize === size ? "on" : ""}
                      key={size}
                      onClick={() => updatePartySize(size)}
                      aria-pressed={partySize === size}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                {partySize > 1 ? (
                  <div className="names">
                    {names.slice(0, partySize).map((name, index) => (
                      <label key={index}>
                        <span>{index === 0 ? "You" : `Person ${index + 1}`}</span>
                        <input className="field" value={name} onChange={(event) => updateName(index, event.target.value)} />
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>

              {partySize > 1 ? (
                <fieldset className="group">
                  <legend className="group-title">How everyone votes</legend>
                  <div className="tiles">
                    <button
                      type="button"
                      className={deviceMode === "shared" ? "tile on" : "tile"}
                      onClick={() => setDeviceMode("shared")}
                      aria-pressed={deviceMode === "shared"}
                    >
                      <strong>Pass one phone</strong>
                      <small>You’re all in the same room</small>
                    </button>
                    <button
                      type="button"
                      className={deviceMode === "remote" ? "tile on" : "tile"}
                      onClick={() => setDeviceMode("remote")}
                      aria-pressed={deviceMode === "remote"}
                    >
                      <strong>Separate phones</strong>
                      <small>Share a link, vote anywhere</small>
                    </button>
                  </div>
                </fieldset>
              ) : null}

              <details className="reveal">
                <summary>Joining a friend’s room instead?</summary>
                <div className="add-row">
                  <input
                    className="field"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))}
                    placeholder="Room code"
                    aria-label="Room code"
                    maxLength={6}
                  />
                  <button className="secondary" type="button" onClick={openRoomFromCode}>Join</button>
                </div>
              </details>

              {error ? <p className="error" role="alert">{error}</p> : null}

              <div className="step-nav">
                <button className="primary" type="button" onClick={() => setSetupStep(1)}>Next</button>
              </div>
            </>
          ) : null}

          {setupStep === 1 ? (
            <>
              <header className="screen-head">
                <h1>What sounds good?</h1>
                <p>Tap anything that’s calling to you.</p>
              </header>

              <fieldset className="group">
                <legend className="group-title">Cravings</legend>
                <div className="chips">
                  {[...CRAVING_OPTIONS, ...cravings.filter((craving) => !CRAVING_OPTIONS.includes(craving))].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={cravings.includes(option) ? "chip on" : "chip"}
                      onClick={() => setCravings((current) => toggleInList(current, option))}
                      aria-pressed={cravings.includes(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="add-row">
                  <input
                    className="field"
                    value={customCraving}
                    onChange={(event) => setCustomCraving(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomCraving();
                      }
                    }}
                    placeholder="Something else"
                    aria-label="Custom craving"
                  />
                  <button className="secondary" type="button" onClick={addCustomCraving}>Add</button>
                </div>
              </fieldset>

              <fieldset className="group">
                <legend className="group-title">Tonight feels</legend>
                <div className="tiles">
                  {VIBES.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setVibe(option.value)}
                      className={vibe === option.value ? "tile on" : "tile"}
                      aria-pressed={vibe === option.value}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.value}</small>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="pair">
                <fieldset className="group">
                  <legend className="group-title">Budget</legend>
                  <div className="segmented">
                    {[1, 2, 3, 4].map((level) => (
                      <button
                        type="button"
                        key={level}
                        onClick={() => setBudget(level)}
                        className={budget === level ? "on" : ""}
                        aria-pressed={budget === level}
                      >
                        {"$".repeat(level)}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="group">
                  <legend className="group-title">Eating</legend>
                  <div className="segmented">
                    {["dine in", "takeout", "either"].map((option) => (
                      <button
                        type="button"
                        key={option}
                        onClick={() => setService(option)}
                        className={service === option ? "on" : ""}
                        aria-pressed={service === option}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              <div className="step-nav">
                <button className="secondary" type="button" onClick={() => setSetupStep(0)}>Back</button>
                <button className="primary" type="button" onClick={() => setSetupStep(2)}>Next</button>
              </div>
            </>
          ) : null}

          {setupStep === 2 ? (
            <>
              <header className="screen-head">
                <h1>Anything we should respect?</h1>
                <p>These are rules, not preferences. Nothing that breaks them makes the deck.</p>
              </header>

              <fieldset className="group">
                <legend className="group-title">Dietary needs and allergies</legend>
                <div className="chips">
                  {DIETARY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={dietary.includes(option) ? "chip on" : "chip"}
                      onClick={() => setDietary((current) => toggleInList(current, option))}
                      aria-pressed={dietary.includes(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <p className="help">Always confirm allergens with the restaurant.</p>
              </fieldset>

              <fieldset className="group">
                <legend className="group-title">Where to look</legend>
                <div className="location">
                  <div>
                    <strong>Near you</strong>
                    <span>{locationStatus}</span>
                  </div>
                  <button className={location ? "ready" : ""} type="button" onClick={requestLocation}>
                    {location ? "Location added" : "Use my location"}
                  </button>
                </div>
              </fieldset>

              <fieldset className="group" aria-describedby="distance-help">
                <legend className="group-title">How far would you go?</legend>
                <div className="chips">
                  {[2, 5, 10, 20, 50].map((distance) => (
                    <button
                      key={distance}
                      type="button"
                      className={radiusKm === distance ? "chip on" : "chip"}
                      onClick={() => {
                        setRadiusKm(distance);
                        setError("");
                      }}
                      aria-pressed={radiusKm === distance}
                    >
                      {distance} km
                    </button>
                  ))}
                </div>
                <p className="help" id="distance-help">
                  Within {radiusKm} km (about {Math.round(radiusKm / 1.609344)} miles) of your location, measured in a straight line. Driving distance may be longer.
                  {!location ? " Share your location above for real nearby picks." : ""}
                </p>
              </fieldset>

              {error ? <p className="error" role="alert">{error}</p> : null}

              <div className="step-nav">
                <button className="secondary" type="button" onClick={() => setSetupStep(1)}>Back</button>
                <button className="primary" type="submit" disabled={loading}>
                  {loading ? "Setting the table…" : remoteOnly ? "Create our room" : "Find our dinner"}
                </button>
              </div>
            </>
          ) : null}
        </form>
      ) : null}

      {screen === "lobby" && room ? (
        <section className="screen">
          <header className="screen-head">
            <h1>{participantId ? "Send this to the table." : "Which one are you?"}</h1>
            <p>
              {participantId
                ? "Everyone votes on their own phone. You can start before they join."
                : "Pick your name. Nobody sees anyone else’s votes."}
            </p>
          </header>

          <div className="room-code">
            <div>
              <small>Room code</small>
              <strong>{room.code}</strong>
            </div>
            <button className="secondary" type="button" onClick={copyInviteLink}>{copyStatus}</button>
          </div>

          <div className="roster">
            {room.participants.map((participant, index) => (
              <div className="roster-row" key={`${participant.slot}-${participant.name}`}>
                <span className="person-dot" style={{ "--person": personColor(index) } as CSSProperties} />
                <div>
                  <strong>{participant.name}</strong>
                  <small>{participant.completed ? "Votes in" : participant.joined ? "Joined" : "Not here yet"}</small>
                </div>
                {!participantId && !participant.joined ? (
                  <button className="secondary" type="button" onClick={() => joinRemoteRoom(participant.slot)} disabled={loading}>That’s me</button>
                ) : null}
              </div>
            ))}
          </div>

          {error ? <p className="error" role="alert">{error}</p> : null}
          {participantId ? (
            <div className="step-nav">
              <button className="primary" type="button" onClick={startRemoteVoting}>
                {participantSlot !== null && room.participants[participantSlot]?.completed ? "See who’s finished" : "Start swiping"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {screen === "deck" && currentRestaurant ? (
        <section className="screen">
          {deviceMode === "shared" && handoff ? (
            <div className="handoff">
              <p>Pass the phone to</p>
              <h1>{currentPerson}</h1>
              <p>The deck starts over. Nobody sees the last person’s votes.</p>
              <div className="step-nav">
                <button className="primary" type="button" onClick={() => setHandoff(false)}>
                  I’m {currentPerson}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="deck-top">
                <span>
                  {partySize > 1 ? <><strong>{currentPerson}</strong>, your turn. </> : null}
                  {cardIndex + 1} of {restaurants.length}
                </span>
                {partySize > 1 ? (
                  <div className="people" aria-label={`${deviceMode === "remote" ? (participantSlot ?? 0) + 1 : participantIndex + 1} of ${partySize} people`}>
                    {participantNames.map((name, index) => (
                      <span
                        key={`${name}-${index}`}
                        title={name}
                        style={{ "--person": personColor(index) } as CSSProperties}
                        className={
                          index === (deviceMode === "remote" ? participantSlot : participantIndex)
                            ? "current"
                            : deviceMode === "remote"
                              ? room?.participants[index]?.completed ? "done" : ""
                              : index < participantIndex ? "done" : ""
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="stage">
                {restaurants[cardIndex + 1] ? <article className="card behind" aria-hidden="true" /> : null}
                <article
                  className={`card front ${drag.active ? "dragging" : ""}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => setDrag({ x: 0, y: 0, active: false })}
                  style={{
                    transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.x / 18}deg)`,
                  }}
                >
                  {drag.x > 35 ? <b className="stamp yes">Into it</b> : null}
                  {drag.x < -35 ? <b className="stamp no">Pass</b> : null}
                  {drag.y < -35 ? <b className="stamp love">Love</b> : null}
                  <div className="card-kicker">
                    <span>{currentRestaurant.cuisine}</span>
                    <span>{priceMarks(currentRestaurant.priceLevel)}</span>
                  </div>
                  <h2>{currentRestaurant.name}</h2>
                  <p className="meta">
                    <strong>★ {currentRestaurant.rating || "New"}</strong>
                    {currentRestaurant.reviewCount ? <span>{currentRestaurant.reviewCount.toLocaleString()} reviews</span> : null}
                    {currentRestaurant.distanceKm !== null ? <span>{currentRestaurant.distanceKm} km away</span> : null}
                    {currentRestaurant.openNow === false ? <span>Closed now</span> : null}
                  </p>
                  <p className="why">{currentRestaurant.why}</p>
                  {meta?.source === "sample" && currentRestaurant.orderIdeas.length > 0 ? (
                    <div className="order">
                      <small>Sample dishes</small>
                      <ul>
                        {currentRestaurant.orderIdeas.map((idea) => <li key={idea}>{idea}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="order" onPointerDown={(event) => event.stopPropagation()}>
                      <small>Explore this restaurant</small>
                      {currentRestaurant.websiteUrl ? (
                        <a href={currentRestaurant.websiteUrl} target="_blank" rel="noreferrer">Restaurant website ↗</a>
                      ) : null}
                      {currentRestaurant.mapsUrl ? (
                        <p><a href={currentRestaurant.mapsUrl} target="_blank" rel="noreferrer">Details on Google Maps ↗</a></p>
                      ) : null}
                      {!currentRestaurant.websiteUrl && !currentRestaurant.mapsUrl ? <p>Menu details aren’t available yet.</p> : null}
                    </div>
                  )}
                  <div className="card-foot">
                    <span>{currentRestaurant.tags.slice(0, 3).join(", ")}</span>
                    <span className="fit"><strong>{currentRestaurant.score}</strong> fit</span>
                  </div>
                </article>
              </div>

              <div className="actions" aria-label="Your reaction">
                <button className="pass" type="button" onClick={() => castVote("pass")} disabled={voteSubmitting}>
                  <span aria-hidden="true">×</span>Pass
                </button>
                <button className="love" type="button" onClick={() => castVote("love")} disabled={voteSubmitting}>
                  <span aria-hidden="true">♥</span>Love
                </button>
                <button className="like" type="button" onClick={() => castVote("interested")} disabled={voteSubmitting}>
                  <span aria-hidden="true">✓</span>Into it
                </button>
              </div>
              <p className="hint">Swipe left to pass, right if you’re into it, up to love.</p>
              {meta ? (
                <p className="hint">
                  {meta.source === "google" ? "Live places near you" : "Sample restaurants"}
                  {meta.scoring === "jev" ? ", ranked with Jev" : ""}
                </p>
              ) : null}
              {error ? <p className="error" role="alert">{error}</p> : null}
            </>
          )}
        </section>
      ) : null}

      {screen === "waiting" && room ? (
        <section className="screen waiting">
          <header className="screen-head">
            <h1>Your votes are in.</h1>
            <p>This page updates on its own. The result stays hidden until everyone finishes.</p>
          </header>
          <div className="roster">
            {room.participants.map((participant, index) => (
              <div className="roster-row" key={`${participant.slot}-${participant.name}`}>
                <span className="person-dot" style={{ "--person": personColor(index) } as CSSProperties} />
                <div><strong>{participant.name}</strong></div>
                <span className={participant.completed ? "status done" : "status"}>
                  {participant.completed ? "Done" : "Still swiping"}
                </span>
              </div>
            ))}
          </div>
          <p className="hint">Room {room.code} stays open for six hours.</p>
        </section>
      ) : null}

      {screen === "result" && winner ? (
        <section className="screen">
          <header className="screen-head">
            <h1>Dinner’s decided.</h1>
            <p>
              {partySize === 1
                ? "You were into it. That’s all it takes."
                : `${winnerSupport} of ${partySize} people are into it. The group chat can rest.`}
            </p>
          </header>

          <article className="panel">
            <p className="lead">{winner.cuisine}</p>
            <h2>{winner.name}</h2>
            {supporters.length > 1 ? (
              <div className="supporters">
                {supporters.map((name) => (
                  <span key={name}>
                    <i className="person-dot" style={{ "--person": personColor(participantNames.indexOf(name)) } as CSSProperties} />
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="facts">
              <div><small>Rating</small><strong>★ {winner.rating || "New"}</strong></div>
              <div><small>Price</small><strong>{priceMarks(winner.priceLevel)}</strong></div>
              <div><small>Distance</small><strong>{winner.distanceKm === null ? "Nearby" : `${winner.distanceKm} km`}</strong></div>
            </div>
            <p className="why">{winner.why}</p>
            {meta?.source === "sample" && winner.orderIdeas.length > 0 ? (
              <div className="order">
                <small>Sample dishes</small>
                <ul>
                  {winner.orderIdeas.map((idea) => <li key={idea}>{idea}</li>)}
                </ul>
              </div>
            ) : null}
            {meta?.dietaryNotice ? <p className="note">{meta.dietaryNotice}</p> : null}
            <div className="links">
              {winner.mapsUrl ? <a href={winner.mapsUrl} target="_blank" rel="noreferrer">Google Maps ↗</a> : null}
              {winner.websiteUrl ? <a href={winner.websiteUrl} target="_blank" rel="noreferrer">Website</a> : null}
              {!winner.mapsUrl && !winner.websiteUrl ? <span>Sample result. Share your location for directions and a website.</span> : null}
            </div>
          </article>

          <div className="after">
            <button className="secondary" type="button" onClick={reset}>Plan another dinner</button>
          </div>
        </section>
      ) : null}

      {screen === "fallback" ? (
        <section className="screen">
          <header className="screen-head">
            <h1>It’s a girl dinner.</h1>
            <p>No restaurant won the table tonight. Make a light plate at home and enjoy that the deciding is over.</p>
          </header>

          <article className="panel">
            <p className="lead">Ready in {selectedPlate.time}</p>
            <h2>{selectedPlate.title}</h2>
            <ul className="plate-items">
              {selectedPlate.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="instructions">{selectedPlate.note}</p>
            {dietary.length ? <p className="note">Kept compatible with {dietary.join(", ")}.</p> : null}
          </article>

          <div className="after">
            <button className="secondary" type="button" onClick={reset}>Try another search</button>
          </div>
        </section>
      ) : null}

      <footer>Made for the “I don’t know, what do you want?” hour.</footer>
    </main>
  );
}
