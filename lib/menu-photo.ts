import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { isIP } from "node:net";

export type MenuPhoto = { kind: "menu"; url: string; dish: string; sourceUrl: string };

function safeUrl(value: unknown, base?: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function publicIPv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return first !== 0 && first !== 10 && first !== 127 && first !== 169 &&
    first !== 192 && first !== 198 && first < 224 &&
    !(first === 100 && second >= 64 && second <= 127) &&
    !(first === 172 && second >= 16 && second <= 31);
}

function sameSite(left: URL, right: URL) {
  return left.hostname.replace(/^www\./, "") === right.hostname.replace(/^www\./, "");
}

async function fetchPage(value: URL, original: URL, signal: AbortSignal) {
  let current = value;
  for (let redirects = 0; redirects < 3; redirects++) {
    if (current.protocol !== "https:" || current.port || current.username || current.password ||
      !sameSite(current, original) || isIP(current.hostname)) return null;

    let addresses;
    try {
      addresses = await lookup(current.hostname, { all: true, family: 4 });
    } catch {
      return null;
    }
    if (!addresses.length || addresses.some((item) => !publicIPv4(item.address))) return null;

    const result = await new Promise<{ html?: string; redirect?: string } | null>((resolve) => {
      const request = get(current, {
        signal,
        timeout: 3000,
        maxHeaderSize: 8192,
        lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
        headers: { Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": "GirlDinnerMenuPhoto/1.0" },
      }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve({ redirect: response.headers.location });
          return;
        }
        if (response.statusCode !== 200 || !response.headers["content-type"]?.includes("text/html")) {
          response.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 750_000) response.destroy();
          else chunks.push(chunk);
        });
        response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", () => resolve(null));
      });
      request.on("timeout", () => request.destroy());
      request.on("error", () => resolve(null));
    });
    if (!result) return null;
    if (result.html) return { html: result.html, url: current.href };
    const next = safeUrl(result.redirect, current.href);
    if (!next) return null;
    current = next;
  }
  return null;
}

function imageUrl(value: unknown, base: string): string | null {
  if (Array.isArray(value)) return value.map((item) => imageUrl(item, base)).find(Boolean) ?? null;
  if (typeof value === "string") return safeUrl(value, base)?.href ?? null;
  if (value && typeof value === "object") {
    const image = value as Record<string, unknown>;
    return imageUrl(image.contentUrl ?? image.url, base);
  }
  return null;
}

export function readMenuPhoto(html: string, pageUrl: string) {
  let photo: MenuPhoto | null = null;
  let menuUrl: URL | null = null;
  let visited = 0;

  function visit(value: unknown) {
    if (visited++ > 3000 || photo || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some((type) => type === "MenuItem" || type === "https://schema.org/MenuItem")) {
      const dish = typeof node.name === "string" ? node.name.trim().slice(0, 120) : "";
      const url = imageUrl(node.image, pageUrl);
      if (dish && url) {
        photo = { kind: "menu", url, dish, sourceUrl: pageUrl };
        return;
      }
    }
    if (!menuUrl && typeof node.hasMenu === "string" && /^(https:\/\/|\/)/i.test(node.hasMenu)) {
      menuUrl = safeUrl(node.hasMenu, pageUrl);
    }
    if (!menuUrl && types.includes("Menu") && typeof node.url === "string") {
      menuUrl = safeUrl(node.url, pageUrl);
    }
    Object.values(node).forEach(visit);
  }

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*["']application\/ld\+json(?:;[^"']*)?["']/i.test(match[1])) continue;
    try {
      visit(JSON.parse(match[2]));
    } catch {
      // Invalid metadata should not prevent the listing photo fallback.
    }
    if (photo) break;
  }
  if (!photo && !menuUrl) {
    for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      if (/\bmenus?\b/i.test(match[1])) {
        menuUrl = safeUrl(match[1], pageUrl);
        if (menuUrl) break;
      }
    }
  }
  return { photo, menuUrl };
}

export async function findMenuPhoto(website: unknown, signal: AbortSignal): Promise<MenuPhoto | null> {
  const original = safeUrl(website);
  if (!original) return null;
  const home = await fetchPage(original, original, signal);
  if (!home) return null;
  const first = readMenuPhoto(home.html, home.url);
  if (first.photo) return first.photo;
  if (!first.menuUrl || first.menuUrl.href === home.url) return null;
  const menu = await fetchPage(first.menuUrl, original, signal);
  return menu ? readMenuPhoto(menu.html, menu.url).photo : null;
}
