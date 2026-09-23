import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Location = { latitude: number; longitude: number };

type RecommendationRequest = {
  partySize?: number;
  names?: string[];
  cravings?: string[];
  dietary?: string[];
  budget?: number;
  vibe?: string;
  service?: string;
  radiusKm?: number;
  location?: Location | null;
};

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

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryTypeDisplayName?: { text?: string };
  editorialSummary?: { text?: string };
  regularOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
  websiteUri?: string;
  types?: string[];
};

const SAMPLE_RESTAURANTS: Restaurant[] = [
  {
    id: "sample-1",
    name: "Chili Crisp Club",
    cuisine: "Chinese noodles",
    rating: 4.8,
    reviewCount: 326,
    priceLevel: 2,
    address: "Sample restaurant · nearby",
    distanceKm: 1.2,
    openNow: true,
    tags: ["spicy", "shareable", "vegetarian options"],
    orderIdeas: ["Scallion noodles", "Smashed cucumber", "Chili wontons"],
    mapsUrl: null,
    websiteUrl: null,
    score: 94,
    confidence: null,
    why: "Big flavor, easy sharing, and plenty of ways to build a mixed table.",
  },
  {
    id: "sample-2",
    name: "Pink Moon Pizza",
    cuisine: "Pizza",
    rating: 4.7,
    reviewCount: 512,
    priceLevel: 2,
    address: "Sample restaurant · nearby",
    distanceKm: 1.8,
    openNow: true,
    tags: ["cozy", "casual", "vegan options"],
    orderIdeas: ["Hot honey pie", "Lemony greens", "Roasted mushrooms"],
    mapsUrl: null,
    websiteUrl: null,
    score: 89,
    confidence: null,
    why: "A low-stakes crowd pleaser with enough variety for different cravings.",
  },
  {
    id: "sample-3",
    name: "Miso After Dark",
    cuisine: "Japanese",
    rating: 4.6,
    reviewCount: 284,
    priceLevel: 2,
    address: "Sample restaurant · nearby",
    distanceKm: 2.1,
    openNow: true,
    tags: ["warm", "noodles", "quick"],
    orderIdeas: ["Spicy miso ramen", "Veggie gyoza", "Edamame"],
    mapsUrl: null,
    websiteUrl: null,
    score: 85,
    confidence: null,
    why: "Comforting bowls and snackable sides make it easy to follow the mood.",
  },
  {
    id: "sample-4",
    name: "Golden Hour Tacos",
    cuisine: "Mexican",
    rating: 4.5,
    reviewCount: 671,
    priceLevel: 1,
    address: "Sample restaurant · nearby",
    distanceKm: 2.6,
    openNow: true,
    tags: ["bright", "budget-friendly", "gluten-free options"],
    orderIdeas: ["Mushroom tacos", "Elote", "Chips and salsa"],
    mapsUrl: null,
    websiteUrl: null,
    score: 81,
    confidence: null,
    why: "Fast, flexible, and easy to mix into exactly the dinner everyone wants.",
  },
  {
    id: "sample-5",
    name: "Soft Serve Supper",
    cuisine: "New American",
    rating: 4.4,
    reviewCount: 198,
    priceLevel: 3,
    address: "Sample restaurant · nearby",
    distanceKm: 3.2,
    openNow: true,
    tags: ["date night", "seasonal", "dessert"],
    orderIdeas: ["Crispy potatoes", "Market salad", "Vanilla soft serve"],
    mapsUrl: null,
    websiteUrl: null,
    score: 77,
    confidence: null,
    why: "A little more special, with small plates and a built-in sweet finish.",
  },
];

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceInKm(from: Location, to: Location) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCuisine(place: GooglePlace) {
  const label = place.primaryTypeDisplayName?.text?.trim();
  if (label && label.toLowerCase() !== "restaurant") return label;

  const type = place.types?.find((entry) => entry.endsWith("_restaurant"));
  return type
    ? type.replace("_restaurant", "").replaceAll("_", " ")
    : "Restaurant";
}

function localScore(restaurant: Restaurant, request: RecommendationRequest) {
  const words = (request.cravings ?? []).map((word) => word.toLowerCase());
  const searchable = `${restaurant.cuisine} ${restaurant.tags.join(" ")} ${restaurant.orderIdeas.join(" ")}`.toLowerCase();
  const matches = words.filter((word) => searchable.includes(word)).length;
  const ratingScore = clamp(((restaurant.rating - 3.5) / 1.5) * 35, 0, 35);
  const reviewScore = clamp(Math.log10(Math.max(restaurant.reviewCount, 1)) * 8, 0, 24);
  const cravingScore = words.length ? (matches / words.length) * 31 : 20;
  const distanceScore = restaurant.distanceKm === null ? 6 : clamp(10 - restaurant.distanceKm, 1, 10);
  return Math.round(ratingScore + reviewScore + cravingScore + distanceScore);
}

function describePlace(place: GooglePlace) {
  // Google editorial summaries must be displayed exactly as supplied.
  if (place.editorialSummary?.text?.trim()) return place.editorialSummary.text;

  const name = place.displayName?.text?.trim() || "This restaurant";
  const address = place.formattedAddress?.trim();
  return address
    ? `${name} is at ${address}. A restaurant description isn't available yet.`
    : `A description for ${name} isn't available yet. Check its listing for more details.`;
}

async function fetchNearbyRestaurants(request: RecommendationRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const location = request.location;
  if (!apiKey || !location) return null;

  const radius = (request.radiusKm ?? 10) * 1000;
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.primaryTypeDisplayName",
        "places.editorialSummary",
        "places.regularOpeningHours.openNow",
        "places.googleMapsUri",
        "places.websiteUri",
        "places.types",
      ].join(","),
    },
    body: JSON.stringify({
      includedTypes: ["restaurant"],
      maxResultCount: 12,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: {
          center: location,
          radius,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Places returned ${response.status}`);
  }

  const data = (await response.json()) as { places?: GooglePlace[] };
  const budget = clamp(request.budget ?? 4, 1, 4);

  return (data.places ?? [])
    .map<Restaurant>((place, index) => {
      const cuisine = normalizeCuisine(place);
      const placeLocation = place.location;
      const distanceKm =
        typeof placeLocation?.latitude === "number" &&
        typeof placeLocation.longitude === "number"
          ? distanceInKm(location, {
              latitude: placeLocation.latitude,
              longitude: placeLocation.longitude,
            })
          : null;

      return {
        id: place.id ?? `google-${index}`,
        name: place.displayName?.text ?? "Nearby restaurant",
        cuisine,
        rating: place.rating ?? 0,
        reviewCount: place.userRatingCount ?? 0,
        priceLevel: PRICE_LEVELS[place.priceLevel ?? ""] ?? 2,
        address: place.formattedAddress ?? "Address unavailable",
        distanceKm,
        openNow: place.regularOpeningHours?.openNow ?? null,
        tags: [cuisine.toLowerCase(), "nearby"],
        orderIdeas: [],
        mapsUrl: place.googleMapsUri ?? null,
        websiteUrl: place.websiteUri ?? null,
        score: 0,
        confidence: null,
        why: describePlace(place),
      };
    })
    .filter((restaurant) => restaurant.distanceKm !== null && restaurant.distanceKm <= radius / 1000)
    .filter((restaurant) => restaurant.openNow !== false)
    .filter((restaurant) => restaurant.priceLevel <= budget)
    .map((restaurant) => ({ ...restaurant, distanceKm: Number(restaurant.distanceKm!.toFixed(1)) }))
    .slice(0, 10);
}

async function scoreWithJev(
  restaurants: Restaurant[],
  request: RecommendationRequest,
) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey || restaurants.length === 0) return null;

  const questions = Object.fromEntries(
    restaurants.map((restaurant, index) => [
      `fit_${index}`,
      {
        type: "score",
        instructions: `Rate how well restaurant ${index + 1} fits the party's stated dinner preferences. Treat allergies and strict dietary restrictions as constraints, not soft preferences. Do not reward a restaurant when the provided metadata is insufficient to establish a fit.`,
        criteria: [
          "Very poor fit",
          "Weak fit",
          "Possible fit",
          "Strong fit",
          "Exceptional fit",
        ],
      },
    ]),
  );

  const state = {
    party: {
      size: request.partySize ?? 1,
      names: request.names ?? [],
      cravings: request.cravings ?? [],
      dietary: request.dietary ?? [],
      budgetLevel: request.budget ?? 2,
      vibe: request.vibe ?? "casual",
      service: request.service ?? "any",
    },
    restaurantNotice:
      "Restaurant metadata may not include a complete menu or verified allergen details.",
    restaurants: restaurants.map((restaurant, index) => ({
      number: index + 1,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      rating: restaurant.rating,
      reviewCount: restaurant.reviewCount,
      priceLevel: restaurant.priceLevel,
      distanceKm: restaurant.distanceKm,
      tags: restaurant.tags,
      description: restaurant.why,
      representativeOrderIdeas: restaurant.orderIdeas,
    })),
  };

  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state, model: "jev-latest", questions }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Jev returned ${response.status}`);

  const data = (await response.json()) as {
    answers?: Record<string, { score?: number; confidence?: number }>;
  };

  return restaurants.map((restaurant, index) => {
    const answer = data.answers?.[`fit_${index}`];
    const jevScore = typeof answer?.score === "number" ? (answer.score / 4) * 100 : null;
    const baseline = localScore(restaurant, request);
    return {
      ...restaurant,
      score: Math.round(jevScore === null ? baseline : jevScore * 0.8 + baseline * 0.2),
      confidence: answer?.confidence ?? null,
    };
  });
}

export async function POST(incoming: Request) {
  let request: RecommendationRequest;

  try {
    request = (await incoming.json()) as RecommendationRequest;
  } catch {
    return NextResponse.json({ error: "Send preferences as JSON." }, { status: 400 });
  }

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return NextResponse.json({ error: "Send preferences as a JSON object." }, { status: 400 });
  }

  const radiusKm = request.radiusKm === undefined ? 10 : request.radiusKm;
  if (typeof radiusKm !== "number" || !Number.isFinite(radiusKm) || radiusKm < 0.5 || radiusKm > 50) {
    return NextResponse.json({ error: "Search distance must be between 0.5 and 50 km." }, { status: 400 });
  }
  request.radiusKm = radiusKm;

  const partySize = request.partySize ?? 1;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 8) {
    return NextResponse.json({ error: "Party size must be between 1 and 8." }, { status: 400 });
  }

  let restaurants: Restaurant[] | null = null;
  let source: "google" | "sample" = "sample";
  const notices: string[] = [];

  try {
    restaurants = await fetchNearbyRestaurants(request);
    if (restaurants !== null) source = "google";
  } catch {
    notices.push("Live restaurant search is unavailable, so sample picks are shown.");
  }

  if (restaurants === null) {
    restaurants = SAMPLE_RESTAURANTS
      .filter((restaurant) => restaurant.distanceKm !== null && restaurant.distanceKm <= radiusKm)
      .filter((restaurant) => restaurant.priceLevel <= (request.budget ?? 4));
    if (!request.location) {
      notices.push("Share your location to search live restaurants nearby.");
    }
  }

  restaurants = restaurants.map((restaurant) => ({
    ...restaurant,
    score: localScore(restaurant, request),
  }));

  let scoring: "jev" | "local" = "local";
  try {
    const jevRestaurants = await scoreWithJev(restaurants, request);
    if (jevRestaurants) {
      restaurants = jevRestaurants;
      scoring = "jev";
    }
  } catch {
    notices.push("Jev scoring is unavailable, so a local relevance score was used.");
  }

  restaurants.sort((a, b) => b.score - a.score || b.rating - a.rating);

  return NextResponse.json({
    restaurants,
    meta: {
      source,
      scoring,
      notices,
      dietaryNotice:
        "Dietary and allergen details must be confirmed directly with the restaurant.",
    },
  });
}
