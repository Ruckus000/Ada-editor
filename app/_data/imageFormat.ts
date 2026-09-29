/**
 * Image bytes, read without decoding them: what format a file really is (its
 * bytes, never its name or claimed type), its size and orientation, and the
 * key it's stored under. Pure, so the Node gates test it and the importer uses
 * it outside the browser.
 */

/** The formats the editor stores, shows and exports. */
export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

/** 10 MB, the same limit the storage bucket enforces: what is stored. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 40 MB: the largest file taken in, before a large photo is shrunk. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** The longest side, in pixels, a stored image keeps. */
export const MAX_IMAGE_SIDE = 2400;

/** `width`×`height` scaled down (never up) so the longer side is at most `max`. */
export function targetSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** An image's key: the SHA-256 of its bytes, lowercase hex. */
const IMAGE_KEY = /^[0-9a-f]{64}$/;

/** A stored key, or null for anything else. Documents are untrusted JSON, and
 *  a key becomes a storage path: nothing but a well-formed key gets through. */
export function validImageKey(value: unknown): string | null {
  return typeof value === 'string' && IMAGE_KEY.test(value) ? value : null;
}

export type Sniffed =
  | {
    kind: 'image';
    mime: ImageMime;
    /** As displayed: an EXIF-rotated JPEG's width and height are swapped. */
    width: number;
    height: number;
    /** EXIF orientation, 1 when absent. */
    orientation: number;
    /** A four-channel JPEG, which PDF export re-encodes as RGB. */
    cmyk: boolean;
  }
  /** Recognised, but not a format the editor can show. */
  | { kind: 'unsupported'; format: 'EMF' | 'WMF' | 'BMP' | 'TIFF' | 'SVG' };

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** What `bytes` are, or null for anything unrecognised or truncated. */
export function sniffImage(bytes: Uint8Array): Sniffed | null {
  const b = bytes;
  if (b.length < 12) return null;
  const image = (mime: ImageMime, width: number, height: number, orientation = 1, cmyk = false): Sniffed | null => {
    if (!(width > 0 && height > 0)) return null;
    const turned = orientation >= 5 && orientation <= 8;
    return { kind: 'image', mime, width: turned ? height : width, height: turned ? width : height, orientation, cmyk };
  };

  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b.length >= 24 && ascii(b, 12, 4) === 'IHDR') {
    return image('image/png', u32be(b, 16), u32be(b, 20));
  }
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') {
    return image('image/gif', u16le(b, 6), u16le(b, 8));
  }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && b.length >= 30) {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8 ') return image('image/webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const [b0, b1, b2, b3] = [b[21]!, b[22]!, b[23]!, b[24]!];
      return image('image/webp', 1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
    }
    if (chunk === 'VP8X') return image('image/webp', 1 + u24le(b, 24), 1 + u24le(b, 27));
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) return sniffJpeg(b, image);

  if (b[0] === 0x01 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b.length >= 44 && ascii(b, 40, 4) === ' EMF') return { kind: 'unsupported', format: 'EMF' };
  if ((b[0] === 0xd7 && b[1] === 0xcd && b[2] === 0xc6 && b[3] === 0x9a) || ((b[0] === 1 || b[0] === 2) && b[1] === 0 && b[2] === 9 && b[3] === 0)) return { kind: 'unsupported', format: 'WMF' };
  if (ascii(b, 0, 2) === 'BM') return { kind: 'unsupported', format: 'BMP' };
  if (ascii(b, 0, 4) === 'II*\0' || ascii(b, 0, 4) === 'MM\0*') return { kind: 'unsupported', format: 'TIFF' };
  const head = ascii(b, 0, Math.min(b.length, 512)).replace(/^﻿/, '').trimStart();
  if ((head.startsWith('<?xml') || head.startsWith('<svg')) && head.includes('<svg')) return { kind: 'unsupported', format: 'SVG' };
  return null;
}

/** A JPEG's frame size (SOFn), channel count and EXIF orientation. */
function sniffJpeg(b: Uint8Array, image: (mime: ImageMime, w: number, h: number, o?: number, cmyk?: boolean) => Sniffed | null): Sniffed | null {
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // image data before any frame header
    const length = u16be(b, i + 2);
    if (length < 2 || i + 2 + length > b.length) return null;
    if (marker === 0xe1 && ascii(b, i + 4, 6) === 'Exif\0\0') orientation = exifOrientation(b, i + 10, i + 2 + length) ?? orientation;
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof && length >= 8) return image('image/jpeg', u16be(b, i + 7), u16be(b, i + 5), orientation, b[i + 9] === 4);
    i += 2 + length;
  }
  return null;
}

/** Tag 0x0112 of IFD0 in the TIFF block at `start`, bounded by `end`. */
function exifOrientation(b: Uint8Array, start: number, end: number): number | null {
  if (start + 8 > end) return null;
  const little = ascii(b, start, 2) === 'II';
  if (!little && ascii(b, start, 2) !== 'MM') return null;
  const r16 = (i: number) => (little ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (little ? (u16le(b, i) + (u16le(b, i + 2) << 16)) >>> 0 : u32be(b, i));
  const ifd = start + r32(start + 4);
  if (ifd + 2 > end) return null;
  const count = r16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return null;
    if (r16(entry) === 0x0112) {
      const value = r16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** The key `bytes` are stored under. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Base64 of `bytes`, in chunks (a spread of millions of bytes overflows the stack). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Every image key a stored document refers to: its figures, and its header
 *  and footer images. Untrusted JSON, walked defensively. */
export function imageKeysOf(content: unknown, sections: readonly unknown[] = []): string[] {
  const keys = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 200 || typeof node !== 'object' || node === null) return;
    const n = node as { type?: unknown; attrs?: { image?: unknown }; content?: unknown };
    if (n.type === 'figure') {
      const key = validImageKey(n.attrs?.image);
      if (key) keys.add(key);
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child, depth + 1);
  };
  walk(content, 0);
  for (const s of sections) {
    const key = validImageKey((s as { image?: unknown } | null)?.image);
    if (key) keys.add(key);
  }
  return [...keys];
}

export interface Remapped { key: string; width: number; height: number }

/** Content JSON and section images with each image key in `map` swapped for
 *  its replacement (a shrunk copy): key, width and height. Untrusted JSON,
 *  walked defensively; anything else is copied as it was. */
export function remapImageKeys<C, S>(content: C, sections: readonly S[], map: ReadonlyMap<string, Remapped>): { content: C; sections: S[] } {
  const swap = <T extends { image?: unknown; width?: unknown; height?: unknown }>(attrs: T): T => {
    const key = validImageKey(attrs.image);
    const next = key ? map.get(key) : undefined;
    return next ? { ...attrs, image: next.key, width: next.width, height: next.height } : attrs;
  };
  const walk = (node: unknown, depth: number): unknown => {
    if (depth > 200 || typeof node !== 'object' || node === null || Array.isArray(node)) return node;
    const n = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown };
    let out: Record<string, unknown> = { ...n };
    if (n.type === 'figure' && n.attrs && typeof n.attrs === 'object') out.attrs = swap(n.attrs);
    if (Array.isArray(n.content)) out = { ...out, content: n.content.map((c) => walk(c, depth + 1)) };
    return out;
  };
  return {
    content: walk(content, 0) as C,
    sections: sections.map((s) => (s && typeof s === 'object' ? swap(s as S & { image?: unknown }) : s)),
  };
}
