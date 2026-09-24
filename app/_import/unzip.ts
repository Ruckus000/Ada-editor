/**
 * Minimal ZIP reader for .docx import: enough to pull a handful of XML parts
 * out of an untrusted archive, and nothing more.
 *
 * Why not a library: the platform already inflates (DecompressionStream
 * 'deflate-raw', in every supported browser and Node 22), and the format work
 * left is reading one directory. Everything here treats the archive as
 * hostile: sizes in the file are claims, so inflation counts real bytes and
 * stops at a cap; only parts asked for by exact name are ever inflated, so
 * media (and a bomb hidden in media) is never touched; no path is ever
 * written anywhere, so there is no zip-slip surface.
 */

export class ZipError extends Error {}

/** Input cap. A text-heavy .docx is well under this; images dominate size and are never read. */
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 2000;
/**
 * Per-part cap on inflated bytes, counted while streaming, not trusted from the
 * header. Only XML parts are ever read, and DOMParser on more than this stalls
 * the page for seconds.
 */
export const MAX_PART_BYTES = 8 * 1024 * 1024;

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

interface Entry { method: number; compressedSize: number; localOffset: number; }

export interface Zip {
  /** The part's text (UTF-8), or null if the archive has no such entry. */
  text(name: string): Promise<string | null>;
}

export function readZip(bytes: Uint8Array): Zip {
  if (bytes.length > MAX_ZIP_BYTES) throw new ZipError('too-large');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);
  const inRange = (o: number, n: number) => o >= 0 && n >= 0 && o + n <= bytes.length;

  if (bytes.length < 22 || u32(0) !== LOC_SIG) throw new ZipError('not-zip');

  // End-of-central-directory: last 22 bytes plus up to 64 KB of comment.
  let eocd = -1;
  for (let o = bytes.length - 22; o >= Math.max(0, bytes.length - 22 - 0xffff); o--) {
    if (u32(o) === EOCD_SIG) { eocd = o; break; }
  }
  if (eocd < 0) throw new ZipError('not-zip');
  const count = u16(eocd + 10);
  const cdSize = u32(eocd + 12);
  const cdOffset = u32(eocd + 16);
  // 0xFFFF / 0xFFFFFFFF mean "see the ZIP64 record": no .docx needs that.
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('zip64');
  if (count > MAX_ENTRIES) throw new ZipError('too-many-entries');
  if (!inRange(cdOffset, cdSize)) throw new ZipError('corrupt');

  const entries = new Map<string, Entry>();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (!inRange(p, 46) || u32(p) !== CEN_SIG) throw new ZipError('corrupt');
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const compressedSize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const localOffset = u32(p + 42);
    if (!inRange(p + 46, nameLen + extraLen + commentLen)) throw new ZipError('corrupt');
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (flags & 1) throw new ZipError('encrypted');
    // Two entries with one name make "which one does Word read?" ambiguous; refuse.
    if (entries.has(name)) throw new ZipError('corrupt');
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const bytesOf = async (e: Entry): Promise<Uint8Array> => {
    const lo = e.localOffset;
    if (!inRange(lo, 30) || u32(lo) !== LOC_SIG) throw new ZipError('corrupt');
    // The local header's name/extra lengths can differ from the central copy; the
    // compressed size comes from the central directory (the local one may be 0
    // when a data descriptor follows).
    const start = lo + 30 + u16(lo + 26) + u16(lo + 28);
    if (!inRange(start, e.compressedSize)) throw new ZipError('corrupt');
    const raw = bytes.subarray(start, start + e.compressedSize);
    if (e.method === 0) {
      if (raw.length > MAX_PART_BYTES) throw new ZipError('part-too-large');
      return raw;
    }
    if (e.method !== 8) throw new ZipError('unsupported-compression');
    return inflateCapped(raw);
  };

  return {
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      return new TextDecoder('utf-8').decode(await bytesOf(e));
    },
  };
}

/** Inflate raw DEFLATE, aborting as soon as the output passes MAX_PART_BYTES. */
async function inflateCapped(raw: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // Errors surface on the reader; swallow the writer's copy so it isn't unhandled.
  writer.write(raw as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_PART_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ZipError('part-too-large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError('corrupt');
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
