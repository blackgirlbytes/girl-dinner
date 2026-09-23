export const runtime = "nodejs";

type GooglePhoto = {
  name?: string;
  authorAttributions?: { displayName?: string; uri?: string }[];
};

const headers = { "Cache-Control": "no-store" };

function httpsUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const placeId = new URL(request.url).searchParams.get("placeId");
  if (!placeId || !/^[A-Za-z0-9_-]{1,255}$/.test(placeId)) {
    return Response.json({ error: "A valid restaurant ID is required." }, { status: 400, headers });
  }

  const noPhoto = () => new Response(null, { status: 204, headers });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return noPhoto();

  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
    // Fetch a fresh photo reference: Google photo names expire and must not be cached.
    const details = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" },
      cache: "no-store",
      signal,
    });
    if (!details.ok) return noPhoto();

    const data = (await details.json()) as { photos?: GooglePhoto[] };
    const photo = data.photos?.find((entry) => entry.name?.startsWith(`places/${placeId}/photos/`));
    if (!photo?.name) return noPhoto();

    const resource = photo.name.split("/");
    if (resource.length !== 4 || !resource[3]) return noPhoto();
    const media = await fetch(
      `https://places.googleapis.com/v1/${resource.map(encodeURIComponent).join("/")}/media?maxWidthPx=800&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": apiKey }, cache: "no-store", signal },
    );
    if (!media.ok) return noPhoto();

    const result = (await media.json()) as { photoUri?: string };
    const url = httpsUrl(result.photoUri);
    if (!url) return noPhoto();

    return Response.json({
      url,
      authors: (photo.authorAttributions ?? [])
        .filter((author) => author.displayName?.trim())
        .map((author) => ({ name: author.displayName, url: httpsUrl(author.uri) })),
    }, { headers });
  } catch {
    // Photo failures must never prevent someone from choosing a restaurant.
    return noPhoto();
  }
}
