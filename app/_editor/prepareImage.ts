import { sniffImage, targetSize } from '../_data/imageFormat';

/**
 * A picture made ready to keep (browser only): a large photo is shrunk so its
 * longer side is at most 2400 px and re-saved, so documents and their PDFs
 * stay light. Everything is decoded once, which also proves the file draws
 * (a right header can hide broken data). A GIF is kept as it is (its
 * animation), and so is anything already small (its EXIF rotation is applied
 * wherever it's shown). A photo, or a PNG/WebP with no transparency, comes out
 * as JPEG; one with transparency stays PNG; a re-save is upright, the rotation
 * applied. The original wins whenever the re-save isn't smaller and didn't
 * need shrinking.
 */

/** Files at or under this, and within the size cap, are kept as they are. */
const KEEP_BYTES = 2 * 1024 * 1024;
const QUALITY = 0.85;

export class UnreadableImage extends Error {}

export interface Prepared {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** Scaled down from `from`. */
  resized: { from: { width: number; height: number } } | null;
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

async function decode(blob: Blob, size: { width: number; height: number }, scaled: boolean): Promise<ImageBitmap> {
  if (scaled) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
    } catch { /* resize options unsupported: draw scaled below instead */ }
  }
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function canvasOf(width: number, height: number): { ctx: Canvas2D; toBlob: (type: string) => Promise<Blob | null> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return { ctx: canvas.getContext('2d')!, toBlob: (type) => canvas.convertToBlob({ type, quality: QUALITY }) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { ctx: canvas.getContext('2d')!, toBlob: (type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY)) };
}

function hasTransparency(ctx: Canvas2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

/** `bytes` as they should be stored. Throws UnreadableImage when they don't draw. */
export async function prepareImage(bytes: Uint8Array): Promise<Prepared> {
  const kind = sniffImage(bytes);
  if (kind?.kind !== 'image') throw new UnreadableImage('not an image');
  const blob = new Blob([bytes as BlobPart], { type: kind.mime });
  const natural = { width: kind.width, height: kind.height };
  const size = targetSize(kind.width, kind.height);
  const scaled = size.width !== kind.width || size.height !== kind.height;
  const keep = kind.mime === 'image/gif' || (!scaled && bytes.length <= KEEP_BYTES);

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(blob, size, scaled && !keep);
  } catch {
    throw new UnreadableImage('does not decode');
  }
  try {
    if (keep) return { bytes, ...natural, resized: null };
    const { ctx, toBlob } = canvasOf(size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const type = kind.mime === 'image/jpeg' || !hasTransparency(ctx, size.width, size.height) ? 'image/jpeg' : 'image/png';
    const out = await toBlob(type);
    const saved = out ? await bytesOf(out) : null;
    // Only when shrinking was needed, or the re-save is smaller.
    if (!saved || sniffImage(saved)?.kind !== 'image' || (!scaled && saved.length >= bytes.length)) return { bytes, ...natural, resized: null };
    return { bytes: saved, ...size, resized: scaled ? { from: natural } : null };
  } finally {
    bitmap.close();
  }
}
