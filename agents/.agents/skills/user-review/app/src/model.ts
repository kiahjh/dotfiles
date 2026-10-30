import type { FileDiffMetadata } from '@pierre/diffs';

export type Layout = 'auto' | 'split' | 'unified';
export type Side = 'before' | 'after';
export interface Version {
  hash: string;
  size: number;
  mode: string;
  text?: string;
  asset?: string;
}
export interface ReviewFile {
  id: string;
  path: string;
  previousPath?: string;
  status: string;
  kind: 'text' | 'image' | 'binary';
  before: Version | null;
  after: Version | null;
  diff?: FileDiffMetadata;
}
export interface Unit {
  id: string;
  fileId: string;
  signature: string;
  kind: 'text' | 'image' | 'binary' | 'metadata';
  hunkIndex?: number;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  additions: number;
  deletions: number;
}
export interface Snapshot {
  schema: 1;
  id: string;
  reviewId: string;
  title: string;
  createdAt: string;
  repository: string;
  scope: string;
  base: string;
  head: string;
  files: ReviewFile[];
  units: Unit[];
}
export interface PlanItem {
  unitId: string;
  title?: string;
  explanation?: string;
  expanded?: boolean;
  emphasis?: 'normal' | 'attention' | 'mechanical';
}
export interface Chapter {
  id: string;
  title: string;
  description?: string;
  items: PlanItem[];
}
export interface Plan {
  schema: 1;
  snapshotId: string;
  curated: boolean;
  summary?: string;
  chapters: Chapter[];
}
export interface Note {
  id: string;
  unitId?: string;
  path: string;
  side: Side;
  start: number;
  end: number;
  text: string;
  selectedText: string;
  context: string;
  contextStart: number;
  snapshotId: string;
  outdated: boolean;
  createdAt: string;
}
export interface ReviewState {
  schema: 1;
  snapshotId: string;
  reviewed: Record<string, boolean>;
  flags: Record<string, 'new' | 'changed'>;
  notes: Note[];
  layout: Layout;
  wrapLines?: boolean; // Absent in older state files; defaults to false.
  previousSnapshotId?: string;
}
export interface ReviewData { snapshot: Snapshot; plan: Plan; state: ReviewState }

export function lines(text: string): string[] {
  if (!text) return [];
  const result = text.split('\n');
  if (result.at(-1) === '') result.pop();
  return result;
}

// Pure, deterministic export. No generated preamble or interpretation of notes.
export function exportNotes(notes: Note[], plan?: Plan): string {
  const order = new Map(plan?.chapters.flatMap(c => c.items).map((x, i) => [x.unitId, i]));
  return [...notes].sort((a, b) =>
    (order.get(a.unitId ?? '') ?? Infinity) - (order.get(b.unitId ?? '') ?? Infinity)
      || a.createdAt.localeCompare(b.createdAt)
  ).map(note => {
    const range = note.end > note.start ? `${note.start}-${note.end}` : `${note.start}`;
    const location = note.start > 0 ? `:${range}` : '';
    const version = note.outdated ? ` [${note.side}, original snapshot ${note.snapshotId}]`
      : note.side === 'before' ? ' [before]' : '';
    const numbered = lines(note.context).map((line, i) => `${note.contextStart + i} | ${line}`).join('\n');
    // A fence longer than any source fence keeps arbitrary source code intact.
    const longest = Math.max(2, ...[...note.context.matchAll(/`+/g)].map(m => m[0].length));
    const fence = '`'.repeat(longest + 1);
    return `${note.path}${location}${version} ← ${note.text.trim()}`
      + (numbered ? `\n\n${fence}\n${numbered}\n${fence}` : '');
  }).join('\n\n');
}
