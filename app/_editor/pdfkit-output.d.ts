// pdfkit ships no types for its output helpers (@types/pdfkit predates them).
declare module 'pdfkit/output' {
  export function toBytes(document: PDFKit.PDFDocument): Promise<Uint8Array>;
  export function toBlob(document: PDFKit.PDFDocument): Promise<Blob>;
}
