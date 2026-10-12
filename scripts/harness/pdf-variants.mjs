/**
 * What agenda systems were seen doing to a tagged PDF, done with pdf-lib to a
 * known export: re-saving it, stripping its tags, dropping its language,
 * replacing its title, merging it into a packet, flattening its tags. Shared by
 * the checker's gate (verify-check-posted.mjs) and the sampler's
 * (verify-sample-platforms.mjs). See docs/audit/agenda-platforms-2026-10.md.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';

const N = (key) => PDFName.of(key);
const load = (bytes) => PDFDocument.load(bytes, { updateMetadata: false });
const save = async (doc) => new Uint8Array(await doc.save({ useObjectStreams: true }));

/** Every structure element in the tree, as dictionaries. */
export function elementsOf(doc) {
  const out = [];
  const visit = (value) => {
    const node = value instanceof PDFRef ? doc.context.lookup(value) : value;
    if (node instanceof PDFArray) node.asArray().forEach(visit);
    else if (node instanceof PDFDict && node.get(N('S'))) { out.push(node); visit(node.get(N('K'))); }
  };
  visit(doc.catalog.lookup(N('StructTreeRoot'), PDFDict).get(N('K')));
  return out;
}

/** Each variant as a function of the original's bytes, returning new bytes. */
export const VARIANTS = {
  resaved: async (original) => save(await load(original)),
  stripped: async (original) => {
    const doc = await load(original);
    doc.catalog.delete(N('StructTreeRoot'));
    doc.catalog.delete(N('MarkInfo'));
    return save(doc);
  },
  languageDropped: async (original) => {
    const doc = await load(original);
    doc.catalog.delete(N('Lang'));
    elementsOf(doc)[0].delete(N('Lang'));
    return save(doc);
  },
  titleReplaced: async (original) => {
    const doc = await load(original);
    doc.setTitle('File 26-123 - Exhibit A');
    return save(doc);
  },
  /** The original's pages copied into a new file with two blank pages: the tree doesn't come along. */
  packet: async (original) => {
    const source = await load(original);
    const packet = await PDFDocument.create();
    for (const page of await packet.copyPages(source, source.getPageIndices())) packet.addPage(page);
    packet.addPage();
    packet.addPage();
    return save(packet);
  },
  flattened: async (original) => {
    const doc = await load(original);
    for (const element of elementsOf(doc)) {
      if (element.get(N('S'))?.decodeText() !== 'Document') element.set(N('S'), N('P'));
    }
    return save(doc);
  },
};

/** A one-page "scan": a picture and no font, as a scanner writes it. */
export async function scannedPdf() {
  const doc = await PDFDocument.create();
  // A 1×1 grey PNG.
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64'));
  const image = await doc.embedPng(png);
  doc.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  doc.setProducer('Example Scanner 2.1');
  return save(doc);
}
