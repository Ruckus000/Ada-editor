import { getImage } from '../_data/images';
import { sniffImage, toBase64, validImageKey } from '../_data/imageFormat';
import type { Node as PMNode } from 'prosemirror-model';

/**
 * The document's images, fetched for an export (browser only). The HTML page
 * is standalone, so its pictures travel inside it as data: URIs. The PDF can
 * only hold PNG and JPEG, so GIF, WebP and CMYK JPEG (which the PDF library
 * would colour wrongly) are redrawn as PNG or RGB JPEG first; an animated GIF
 * keeps its first frame. An image that can't be had is counted, and exported
 * as the placeholder it is in the editor.
 */

/** Every image key the document's figures use. */
export function imageKeys(doc: PMNode): string[] {
  const keys = new Set<string>();
  doc.descendants((node) => {
    const key = node.type.name === 'figure' ? validImageKey(node.attrs.image) : null;
    if (key) keys.add(key);
  });
  return [...keys];
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

export async function resolveForHtml(keys: readonly string[]): Promise<{ images: Map<string, { src: string }>; missing: number }> {
  const images = new Map<string, { src: string }>();
  let missing = 0;
  for (const key of keys) {
    const image = await getImage(key).catch(() => null);
    if (!image) { missing++; continue; }
    images.set(key, { src: `data:${image.mime};base64,${toBase64(await bytesOf(image.blob))}` });
  }
  return { images, missing };
}

/** Redraw an image the PDF can't hold as PNG (or JPEG for a photo in CMYK). */
async function redraw(blob: Blob, as: 'image/png' | 'image/jpeg'): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      return bytesOf(await canvas.convertToBlob({ type: as, quality: 0.92 }));
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, as, 0.92));
    if (!out) throw new Error('canvas export failed');
    return bytesOf(out);
  } finally {
    bitmap.close();
  }
}

export async function resolveForPdf(keys: readonly string[]): Promise<{ images: Map<string, { data: Uint8Array }>; missing: number }> {
  const images = new Map<string, { data: Uint8Array }>();
  let missing = 0;
  for (const key of keys) {
    try {
      const image = await getImage(key);
      if (!image) { missing++; continue; }
      const bytes = await bytesOf(image.blob);
      const kind = sniffImage(bytes);
      const direct = kind?.kind === 'image' && (kind.mime === 'image/png' || (kind.mime === 'image/jpeg' && !kind.cmyk));
      images.set(key, { data: direct ? bytes : await redraw(image.blob, kind?.kind === 'image' && kind.cmyk ? 'image/jpeg' : 'image/png') });
    } catch {
      missing++;
    }
  }
  return { images, missing };
}
