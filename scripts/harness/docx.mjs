/**
 * Build .docx files in tests: a minimal package around body XML, and a raw
 * ZIP writer that can also forge hostile archives. Shared by the importer
 * tests (verify-rules.mjs) and the app gate's upload flow (verify-a11y-app.mjs).
 */
import { crc32, deflateRawSync } from 'node:zlib';

/** Build a ZIP from [name, content, { method, flags }] entries — enough to forge hostile archives. */
export function makeZip(files, { centralSize } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content, opt = {}] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const method = opt.method ?? 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const head = (sig, central) => {
      const b = Buffer.alloc(central ? 46 : 30);
      let o = 0;
      const w16 = (v) => { b.writeUInt16LE(v, o); o += 2; };
      const w32 = (v) => { b.writeUInt32LE(v >>> 0, o); o += 4; };
      w32(sig);
      if (central) w16(20);
      w16(20); w16(opt.flags ?? 0); w16(method); w16(0); w16(0);
      w32(crc32(data)); w32(centralSize ?? body.length); w32(data.length);
      w16(nameBuf.length); w16(0);
      if (central) { w16(0); w16(0); w16(0); w32(0); w32(offset); }
      return b;
    };
    const local = Buffer.concat([head(0x04034b50, false), nameBuf, body]);
    centrals.push(Buffer.concat([head(0x02014b50, true), nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

export const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const rel = (id, type, target, external = false) =>
  `<Relationship Id="${id}" Type="${REL_NS}/${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
export const rels = (...r) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;

/** A minimal .docx: body XML plus optional styles, numbering, extra document rels and parts. */
export function docx({ body, styles = '', numbering = '', docRels = [], parts = [], title } = {}) {
  const files = [
    ['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'), title === undefined ? '' : rel('rId2', 'metadata/core-properties', 'docProps/core.xml'))],
    ['word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`],
    ['word/_rels/document.xml.rels', rels(rel('rS', 'styles', 'styles.xml'), rel('rN', 'numbering', 'numbering.xml'), ...docRels)],
    ['word/styles.xml', `<?xml version="1.0"?><w:styles ${NS}>${styles}</w:styles>`],
    ['word/numbering.xml', `<?xml version="1.0"?><w:numbering ${NS}>${numbering}</w:numbering>`],
    ...parts,
  ];
  if (title !== undefined) files.push(['docProps/core.xml', `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`]);
  return makeZip(files);
}
export const P = (inner, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
export const R = (text, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
