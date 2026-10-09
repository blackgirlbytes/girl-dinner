"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type MenuPhoto = {
  kind: "menu";
  url: string;
  dish: string;
  sourceUrl: string;
};

type PlacePhoto = {
  kind: "place";
  url: string;
  sourceUrl: string;
  authors: { name: string; url: string | null }[];
};

type Photo = MenuPhoto | PlacePhoto;

export default function RestaurantPhoto({ placeId, name }: { placeId: string; name: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setPhotos([]);
    setPhotoIndex(0);
    setLoaded(false);

    async function loadPhoto() {
      try {
        const response = await fetch(`/api/restaurant-photo?placeId=${encodeURIComponent(placeId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || response.status === 204) return;
        const data = (await response.json()) as { photos: Photo[] };
        if (!controller.signal.aborted && Array.isArray(data.photos)) setPhotos(data.photos);
      } catch {
        // Keep the text-only card for unavailable photos or canceled requests.
      }
    }

    void loadPhoto();
    return () => controller.abort();
  }, [placeId]);

  const photo = photos[photoIndex];
  if (!photo) return null;

  return (
    <figure className="restaurant-photo" hidden={!loaded}>
      <Image
        key={photo.url}
        src={photo.url}
        alt={photo.kind === "menu" ? `${photo.dish} from ${name}’s menu` : `Photo from ${name}’s Google Maps listing`}
        width={800}
        height={500}
        unoptimized
        loading="eager"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setPhotoIndex((index) => index + 1);
        }}
      />
      <figcaption onPointerDown={(event) => event.stopPropagation()}>
        {photo.kind === "menu" ? (
          <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.dish} · Restaurant menu</a>
        ) : (
          <>
            Photo: {photo.authors.map((author, index) => (
              <span key={`${author.name}-${index}`}>
                {author.url ? <a href={author.url} target="_blank" rel="noreferrer">{author.name}</a> : author.name}
                {index < photo.authors.length - 1 ? ", " : " · "}
              </span>
            ))}
            <a href={photo.sourceUrl} target="_blank" rel="noreferrer">Google Maps</a>
          </>
        )}
      </figcaption>
    </figure>
  );
}
