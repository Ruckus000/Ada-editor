import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DOCS, contentFor, findDoc } from '../../_data/fixtures';
import { EditorScreen } from '../../_editor/EditorScreen';

type Params = Promise<{ docId: string }>;

export function generateStaticParams() {
  return DOCS.map((d) => ({ docId: d.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const doc = findDoc((await params).docId);
  return { title: doc ? `${doc.title} · Ada Editor` : 'Document not found · Ada Editor' };
}

export default async function Page({ params }: { params: Params }) {
  const doc = findDoc((await params).docId);
  if (!doc) notFound();
  return <EditorScreen key={doc.id} doc={doc} content={contentFor(doc)} />;
}
