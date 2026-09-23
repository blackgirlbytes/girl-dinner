"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Photo = {
  url: string;
  authors: { name: string; url: string | null }[];
};

export default function RestaurantPhoto({ placeId, name }: { placeId: string; name: string }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPhoto(null);
    setLoaded(false);

    async function loadPhoto() {
      try {
        const response = await fetch(`/api/restaurant-photo?placeId=${encodeURIComponent(placeId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || response.status === 204) return;
        const data = (await response.json()) as Photo;
        if (!controller.signal.aborted) setPhoto(data);
      } catch {
        // Keep the text-only card for unavailable photos or canceled requests.
      }
    }

    void loadPhoto();
    return () => controller.abort();
  }, [placeId]);

  if (!photo) return null;

  return (
    <figure className="restaurant-photo" hidden={!loaded}>
      <Image
        src={photo.url}
        alt={`Photo from ${name}’s Google Maps listing`}
        width={800}
        height={500}
        unoptimized
        loading="eager"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setPhoto(null);
        }}
      />
      <figcaption onPointerDown={(event) => event.stopPropagation()}>
        Photo: {photo.authors.map((author, index) => (
          <span key={`${author.name}-${index}`}>
            {author.url ? <a href={author.url} target="_blank" rel="noreferrer">{author.name}</a> : author.name}
            {index < photo.authors.length - 1 ? ", " : " · "}
          </span>
        ))}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`}
          target="_blank"
          rel="noreferrer"
        >Google Maps</a>
      </figcaption>
    </figure>
  );
}
