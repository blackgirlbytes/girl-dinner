"use client";

import { FormEvent, PointerEvent, useCallback, useEffect, useMemo, useState } from "react";

type Location = { latitude: number; longitude: number };
type Vote = "pass" | "interested" | "love";
type Screen = "setup" | "deck" | "result" | "fallback";

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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  const [partySize, setPartySize] = useState(1);
  const [names, setNames] = useState(["You"]);
  const [cravings, setCravings] = useState<string[]>(["comfort food"]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [budget, setBudget] = useState(2);
  const [vibe, setVibe] = useState(VIBES[0].value);
  const [service, setService] = useState("either");
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

  const participantNames = useMemo(
    () => names.slice(0, partySize).map((name, index) => name.trim() || (index === 0 ? "You" : `Friend ${index + 1}`)),
    [names, partySize],
  );

  const currentRestaurant = restaurants[cardIndex];
  const currentPerson = participantNames[participantIndex] ?? "You";
  const progress = restaurants.length ? ((cardIndex + 1) / restaurants.length) * 100 : 0;

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
          radiusKm: 6,
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
        setScreen("fallback");
        return;
      }

      setRestaurants(data.restaurants);
      setMeta(data.meta ?? null);
      setVotes({});
      setCardIndex(0);
      setParticipantIndex(0);
      setWinner(null);
      setScreen("deck");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dinner search failed.");
    } finally {
      setLoading(false);
    }
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
    (vote: Vote) => {
      const restaurant = restaurants[cardIndex];
      if (!restaurant || handoff) return;

      const nextVotes = {
        ...votes,
        [currentPerson]: {
          ...(votes[currentPerson] ?? {}),
          [restaurant.id]: vote,
        },
      };
      setVotes(nextVotes);
      setDrag({ x: 0, y: 0, active: false });

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
    [cardIndex, currentPerson, handoff, participantIndex, participantNames.length, resolveVotes, restaurants, votes],
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
    setRestaurants([]);
    setVotes({});
    setWinner(null);
    setCardIndex(0);
    setParticipantIndex(0);
    setHandoff(false);
  }

  const selectedPlate = useMemo(() => {
    const seed = cravings.join("").length + dietary.join("").length + partySize;
    return PLATES[seed % PLATES.length];
  }, [cravings, dietary, partySize]);

  return (
    <main className={`app-shell screen-${screen}`}>
      <nav className="topbar" aria-label="Primary navigation">
        <button className="wordmark" type="button" onClick={reset} aria-label="Girl Dinner home">
          <span className="wordmark-dot" aria-hidden="true" />
          girl dinner
        </button>
        <span className="topbar-note">Decision relief for hungry people</span>
        <button className="tiny-button" type="button" onClick={reset}>Start over</button>
      </nav>

      {screen === "setup" ? (
        <section className="setup-layout">
          <header className="hero-copy">
            <p className="eyebrow"><span>Tonight’s question</span></p>
            <h1>What are we<br /><em>actually</em> eating?</h1>
            <p className="hero-lede">
              Give us the table mood. We’ll find nearby contenders, let everyone swipe,
              and call the winner.
            </p>
            <div className="hero-ticket" aria-hidden="true">
              <span>one table</span><span>one answer</span><strong>zero group chat spirals</strong>
            </div>
          </header>

          <form className="setup-card" onSubmit={findDinner}>
            <div className="form-heading">
              <div>
                <span className="step-label">01 · Set the table</span>
                <h2>Who’s hungry?</h2>
              </div>
              <span className="party-readout">{partySize} {partySize === 1 ? "person" : "people"}</span>
            </div>

            <div className="party-picker" role="group" aria-label="Party size">
              {Array.from({ length: 8 }, (_, index) => index + 1).map((size) => (
                <button
                  type="button"
                  className={partySize === size ? "active" : ""}
                  key={size}
                  onClick={() => updatePartySize(size)}
                  aria-pressed={partySize === size}
                >
                  {size}
                </button>
              ))}
            </div>

            {partySize > 1 ? (
              <div className="name-grid">
                {names.slice(0, partySize).map((name, index) => (
                  <label key={index}>
                    <span>{index === 0 ? "You" : `Person ${index + 1}`}</span>
                    <input value={name} onChange={(event) => updateName(index, event.target.value)} />
                  </label>
                ))}
              </div>
            ) : null}

            <fieldset>
              <legend><span>02</span> What sounds good?</legend>
              <div className="chip-cloud">
                {CRAVING_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cravings.includes(option) ? "chip selected" : "chip"}
                    onClick={() => setCravings((current) => toggleInList(current, option))}
                    aria-pressed={cravings.includes(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="add-row">
                <input
                  value={customCraving}
                  onChange={(event) => setCustomCraving(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomCraving();
                    }
                  }}
                  placeholder="Add a craving…"
                  aria-label="Custom craving"
                />
                <button type="button" onClick={addCustomCraving}>Add</button>
              </div>
            </fieldset>

            <fieldset>
              <legend><span>03</span> Anything we need to respect?</legend>
              <div className="chip-cloud compact">
                {DIETARY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={dietary.includes(option) ? "chip selected constraint" : "chip"}
                    onClick={() => setDietary((current) => toggleInList(current, option))}
                    aria-pressed={dietary.includes(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="field-help">We treat these as constraints. Always confirm allergens with the restaurant.</p>
            </fieldset>

            <div className="split-fields">
              <fieldset>
                <legend><span>04</span> Budget</legend>
                <div className="segmented" role="group" aria-label="Budget">
                  {[1, 2, 3, 4].map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setBudget(level)}
                      className={budget === level ? "active" : ""}
                      aria-pressed={budget === level}
                    >
                      {"$".repeat(level)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend><span>05</span> How?</legend>
                <div className="segmented" role="group" aria-label="Service preference">
                  {["dine in", "takeout", "either"].map((option) => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => setService(option)}
                      className={service === option ? "active" : ""}
                      aria-pressed={service === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <fieldset>
              <legend><span>06</span> Pick tonight’s energy</legend>
              <div className="vibe-grid">
                {VIBES.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setVibe(option.value)}
                    className={vibe === option.value ? "vibe active" : "vibe"}
                    aria-pressed={vibe === option.value}
                  >
                    <span aria-hidden="true">{option.symbol}</span>{option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="location-row">
              <div>
                <strong>Search near you</strong>
                <span>{locationStatus}</span>
              </div>
              <button className={location ? "location-button ready" : "location-button"} type="button" onClick={requestLocation}>
                <span aria-hidden="true">⌖</span> {location ? "Location added" : "Use my location"}
              </button>
            </div>

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <button className="primary-action" type="submit" disabled={loading}>
              <span>{loading ? "Setting the table…" : "Find our dinner"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      ) : null}

      {screen === "deck" && currentRestaurant ? (
        <section className="deck-layout">
          {handoff ? (
            <div className="handoff-card">
              <span className="handoff-icon" aria-hidden="true">↝</span>
              <p className="eyebrow"><span>Keep the votes secret</span></p>
              <h1>Pass the phone to<br />{currentPerson}</h1>
              <p>The deck resets for each person. No peeking at anyone else’s passes.</p>
              <button className="primary-action" type="button" onClick={() => setHandoff(false)}>
                <span>I’m {currentPerson}</span><span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <>
              <header className="deck-header">
                <div>
                  <p className="eyebrow"><span>{currentPerson} is choosing</span></p>
                  <h1>Trust your first bite.</h1>
                </div>
                <div className="participant-stack" aria-label={`${participantIndex + 1} of ${partySize} participants`}>
                  {participantNames.map((name, index) => (
                    <span key={`${name}-${index}`} className={index === participantIndex ? "current" : index < participantIndex ? "done" : ""}>
                      {initials(name)}
                    </span>
                  ))}
                </div>
              </header>

              <div className="deck-progress" aria-label={`Card ${cardIndex + 1} of ${restaurants.length}`}>
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="card-stage">
                {restaurants[cardIndex + 1] ? (
                  <article className="restaurant-card card-behind" aria-hidden="true">
                    <div className="food-art art-alt"><span /><span /><span /></div>
                  </article>
                ) : null}
                <article
                  className={`restaurant-card card-front ${drag.active ? "dragging" : ""}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => setDrag({ x: 0, y: 0, active: false })}
                  style={{
                    transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.x / 18}deg)`,
                  }}
                >
                  <div className="food-art">
                    <span /><span /><span />
                    <div className="score-stamp"><strong>{currentRestaurant.score}</strong><small>fit</small></div>
                    {drag.x > 35 ? <b className="swipe-stamp yes">INTO IT</b> : null}
                    {drag.x < -35 ? <b className="swipe-stamp no">PASS</b> : null}
                    {drag.y < -35 ? <b className="swipe-stamp love">LOVE</b> : null}
                  </div>
                  <div className="card-body">
                    <div className="card-kicker">
                      <span>{currentRestaurant.cuisine}</span>
                      <span>{priceMarks(currentRestaurant.priceLevel)}</span>
                    </div>
                    <h2>{currentRestaurant.name}</h2>
                    <p className="restaurant-meta">
                      <strong>★ {currentRestaurant.rating || "New"}</strong>
                      {currentRestaurant.reviewCount ? <span>{currentRestaurant.reviewCount.toLocaleString()} reviews</span> : null}
                      {currentRestaurant.distanceKm !== null ? <span>{currentRestaurant.distanceKm} km</span> : null}
                    </p>
                    <p className="why-copy">{currentRestaurant.why}</p>
                    <div className="order-strip">
                      <small>Order direction</small>
                      <p>{currentRestaurant.orderIdeas.join(" · ")}</p>
                    </div>
                    <div className="tag-row">
                      {currentRestaurant.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <p className="address">{currentRestaurant.address}</p>
                  </div>
                </article>
              </div>

              <div className="swipe-actions" aria-label="Your reaction">
                <button className="pass" type="button" onClick={() => castVote("pass")} aria-label="Pass">
                  <span aria-hidden="true">×</span><small>Pass</small>
                </button>
                <button className="love" type="button" onClick={() => castVote("love")} aria-label="Love this option">
                  <span aria-hidden="true">↑</span><small>Love</small>
                </button>
                <button className="like" type="button" onClick={() => castVote("interested")} aria-label="Interested">
                  <span aria-hidden="true">♡</span><small>Into it</small>
                </button>
              </div>
              <p className="gesture-help">Swipe left to pass · up to love · right if you’re into it</p>
              {meta ? (
                <p className="data-note">
                  {meta.source === "google" ? "Live nearby places" : "Sample restaurant deck"}
                  <span>·</span>{meta.scoring === "jev" ? "ranked with Jev" : "locally ranked"}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {screen === "result" && winner ? (
        <section className="result-layout">
          <div className="confetti-field" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <p className="eyebrow"><span>Decision made</span></p>
          <h1>We’re eating<br /><em>{winner.name}.</em></h1>
          <p className="result-lede">
            {winnerSupport} of {partySize} {partySize === 1 ? "person is" : "people are"} into it.
            The group chat may now rest.
          </p>
          <div className="result-ticket">
            <div className="result-ticket-top">
              <div><span>{winner.cuisine}</span><h2>{winner.name}</h2></div>
              <div className="score-stamp result-score"><strong>{winner.score}</strong><small>fit</small></div>
            </div>
            <div className="result-facts">
              <span><small>rating</small>★ {winner.rating || "New"}</span>
              <span><small>price</small>{priceMarks(winner.priceLevel)}</span>
              <span><small>distance</small>{winner.distanceKm === null ? "nearby" : `${winner.distanceKm} km`}</span>
            </div>
            <div className="order-strip result-order">
              <small>Start with</small>
              <p>{winner.orderIdeas.join(" · ")}</p>
            </div>
            <p className="dietary-warning">{meta?.dietaryNotice}</p>
            <div className="result-links">
              {winner.mapsUrl ? <a href={winner.mapsUrl} target="_blank" rel="noreferrer">Open in Maps ↗</a> : null}
              {winner.websiteUrl ? <a href={winner.websiteUrl} target="_blank" rel="noreferrer">Restaurant site ↗</a> : null}
              {!winner.mapsUrl && !winner.websiteUrl ? <span>Sample result · add location for live links</span> : null}
            </div>
          </div>
          <button className="secondary-action" type="button" onClick={reset}>Run it back</button>
        </section>
      ) : null}

      {screen === "fallback" ? (
        <section className="fallback-layout">
          <div className="fallback-copy">
            <p className="eyebrow"><span>No restaurant consensus</span></p>
            <h1>Okay. It’s a<br /><em>girl dinner.</em></h1>
            <p>
              Nobody has to settle. Make a light plate at home, put on something good,
              and enjoy the fact that the decision is over.
            </p>
          </div>
          <article className="plate-card">
            <div className="plate-illustration" aria-hidden="true">
              <span className="plate-main" /><span className="plate-small one" /><span className="plate-small two" />
            </div>
            <div className="plate-content">
              <span className="step-label">Tonight’s plate · {selectedPlate.time}</span>
              <h2>{selectedPlate.title}</h2>
              <ul>
                {selectedPlate.items.map((item) => <li key={item}><span>+</span>{item}</li>)}
              </ul>
              <p>{selectedPlate.note}</p>
              {dietary.length ? <small>Keep it compatible with: {dietary.join(", ")}.</small> : null}
            </div>
          </article>
          <div className="fallback-actions">
            <button className="primary-action" type="button" onClick={reset}><span>Try another search</span><span>→</span></button>
          </div>
        </section>
      ) : null}

      <footer>
        <span>Made for the “I don’t know, what do you want?” hour.</span>
        <span>Girl Dinner · {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
