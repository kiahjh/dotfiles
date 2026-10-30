import React, { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FileDiff } from '@pierre/diffs/react';
import { FileDiff as VanillaFileDiff, type FileDiffOptions, type SelectedLineRange } from '@pierre/diffs';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import { Select } from '@base-ui/react/select';
import { ModifiedFiles } from './ModifiedFiles.tsx';
import { FileIconSprite, FileTypeIcon } from './FileTypeIcon.tsx';
import { highlighter, installPalette } from './theme.ts';
import { exportNotes, type ReviewData, type ReviewState, type ReviewFile, type Unit, type PlanItem, type Note, type Layout, type Side } from './model.ts';
import './style.css';

installPalette();
type Draft = { unitId: string; side: Side; start: number; end: number; text: string; editingId?: string };
const shortPath = (path: string) => path.split('/').at(-1) ?? path;
const rangeLabel = (start: number, count: number) => count ? `${start}${count > 1 ? `–${start + count - 1}` : ''}` : '—';
const narrowViewport = () => window.matchMedia('(max-width: 900px)').matches;
const layouts: { value: Layout; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'split', label: 'Split' }, { value: 'unified', label: 'Unified' },
];

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    check: <path d="m5 12 4 4L19 6" />, chevron: <path d="m7 9 5 5 5-5" />,
    note: <><path d="M20 11v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7"/><path d="m10 14 1-4L19 2l3 3-8 8-4 1Z"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></>,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></>,
    wrap: <><path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-5M3 18h4"/><path d="m16 15-3 3 3 3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg>;
}

function WrapToggle({ wrapLines, onToggle }: { wrapLines: boolean; onToggle(): void }) {
  return <button className={`wrap-toggle ${wrapLines ? 'active' : ''}`} aria-label="Wrap lines" aria-pressed={wrapLines}
    title={wrapLines ? 'Disable line wrapping' : 'Enable line wrapping'} onClick={onToggle}><Icon name="wrap" /><span className="button-label">Wrap</span></button>;
}

class RenderBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <p className="error">Unable to render this diff: {this.state.error}. The captured source remains available in the artifact.</p> : this.props.children; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? 'A newer snapshot is available. Load it before saving more changes; your draft is still here.' : data.error ?? `Request failed (${response.status})`);
  return data as T;
}

function App() {
  const id = decodeURIComponent(location.pathname.match(/^\/reviews\/([^/]+)/)?.[1] ?? '');
  const [data, setData] = useState<ReviewData>();
  const [reviews, setReviews] = useState<{ id: string; title: string; units: number }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fullFile, setFullFile] = useState<ReviewFile>();
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState<string>();
  const [newSnapshot, setNewSnapshot] = useState<ReviewData>();
  const [wide, setWide] = useState(true);
  const content = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());
  const dataRef = useRef(data);
  dataRef.current = data;
  const api = `/api/reviews/${encodeURIComponent(id)}`;

  useEffect(() => {
    if (id) request<ReviewData>(api).then(setData).catch(e => setError(e.message));
    else request<typeof reviews>('/api/reviews').then(setReviews).catch(e => setError(e.message));
  }, [id, api]);
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      request<ReviewData>(api).then(next => {
        const current = dataRef.current;
        if (current && next.snapshot.id !== current.snapshot.id) setNewSnapshot(next);
        else if (current && JSON.stringify(next.plan) !== JSON.stringify(current.plan)) setData({ ...current, plan: next.plan });
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [id, api]);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 860));
    observer.observe(element);
    return () => observer.disconnect();
  }, [!!data]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) {
      setFullFile(undefined); setManualCopy(undefined);
    } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const act = useCallback((action: Record<string, unknown>): Promise<boolean> => {
    setSaving(n => n + 1);
    setError('');
    let success = false;
    const snapshotId = dataRef.current?.snapshot.id;
    const next = queue.current.then(async () => {
      try {
        const result = await request<{ state: ReviewState }>(`${api}/actions`, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Review': '1' }, body: JSON.stringify({ ...action, snapshotId }) });
        setData(current => current ? { ...current, state: result.state } : current);
        success = true;
      } catch (e) { setError((e as Error).message); }
      finally { setSaving(n => n - 1); }
    });
    queue.current = next;
    return next.then(() => success);
  }, [api]);

  function jump(unitId: string) {
    setExpanded(current => ({ ...current, [unitId]: true }));
    requestAnimationFrame(() => document.getElementById(unitId)?.scrollIntoView({ block: 'start' }));
  }
  function nextUnreviewed() {
    if (!data) return;
    const items = data.plan.chapters.flatMap(c => c.items);
    const visible = items.findIndex(item => (document.getElementById(item.unitId)?.getBoundingClientRect().top ?? -1) >= 120);
    const rotated = [...items.slice(Math.max(0, visible)), ...items.slice(0, Math.max(0, visible))];
    const target = rotated.find(item => !data.state.reviewed[item.unitId]);
    if (target) jump(target.unitId);
  }
  function closeFiles() {
    setFilesOpen(false);
    document.getElementById('files-toggle')?.focus({ preventScroll: true });
  }
  function toggleFiles() {
    if (!filesOpen && narrowViewport()) setNotesOpen(false);
    setFilesOpen(!filesOpen);
  }
  function toggleNotes() {
    if (!notesOpen && narrowViewport()) setFilesOpen(false);
    setNotesOpen(!notesOpen);
  }
  function jumpToFile(path: string) {
    const current = dataRef.current;
    if (!current) return;
    const file = current.snapshot.files.find(file => file.path === path);
    const first = current.plan.chapters.flatMap(chapter => chapter.items).find(item =>
      current.snapshot.units.some(unit => unit.id === item.unitId && unit.fileId === file?.id));
    if (first) {
      jump(first.unitId);
      if (narrowViewport()) closeFiles();
    }
  }
  function beginNote(unit: Unit, selection?: SelectedLineRange | null) {
    if (!data) return;
    if (selection?.endSide && selection.endSide !== selection.side) { setError('Please select a note range on just one side of the diff.'); return; }
    const file = data.snapshot.files.find(f => f.id === unit.fileId)!;
    const side = selection ? selection.side === 'deletions' ? 'before' : 'after' : file.after ? 'after' : 'before';
    const start = selection ? Math.min(selection.start, selection.end) : unit.kind === 'text' ? (side === 'after' ? unit.newStart : unit.oldStart) : 0;
    const count = side === 'after' ? unit.newCount : unit.oldCount;
    const end = selection ? Math.max(selection.start, selection.end) : start > 0 ? start + Math.max(1, count) - 1 : 0;
    if (draft?.text && !confirm('Discard the unsaved note draft?')) return;
    setDraft({ unitId: unit.id, side, start, end, text: '' });
    if (narrowViewport()) setFilesOpen(false);
    setNotesOpen(true);
  }
  async function copyNotes() {
    if (!data) return;
    const text = exportNotes(data.state.notes, data.plan);
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setManualCopy(text); }
  }

  if (!data) return <main className="landing"><h1>Reviews</h1>
    {error && <p className="error">{error}</p>}
    {id && !error ? <p>Loading…</p> : <div className="review-list">{reviews.map(r => <a key={r.id} href={`/reviews/${r.id}`}><span>{r.title}</span><span className="muted">{r.units} changes</span></a>)}
      {!reviews.length && <p><code>user-review capture</code> to start a review.</p>}</div>}
  </main>;

  const { snapshot, plan, state } = data;
  const count = snapshot.units.filter(u => state.reviewed[u.id]).length;
  const percent = snapshot.units.length ? Math.round(count / snapshot.units.length * 100) : 100;
  const layout = state.layout === 'auto' ? wide ? 'split' : 'unified' : state.layout;
  const wrapLines = state.wrapLines ?? false;
  const toggleWrap = () => void act({ type: 'wrap', wrapLines: !wrapLines });
  const files = new Map(snapshot.files.map(file => [file.id, file]));
  const units = new Map(snapshot.units.map(unit => [unit.id, unit]));
  const assetURL = (asset: string) => `${api}/assets/${asset}`;
  const draftUnit = draft && units.get(draft.unitId);
  const draftFile = draftUnit && files.get(draftUnit.fileId);

  return <>
    <FileIconSprite />
    <header className="topbar">
      <button id="files-toggle" className={filesOpen ? 'active files-toggle' : 'files-toggle'} aria-label="Toggle files" aria-expanded={filesOpen} aria-controls="modified-files" title={`${snapshot.files.length} changed files`} onClick={toggleFiles}><Icon name="sidebar" /></button>
      <h1 title={snapshot.title}>{snapshot.title}</h1>
      <div className="top-progress" title={`${count} of ${snapshot.units.length} changes reviewed`}><span>{count}/{snapshot.units.length}</span><div className="progress-track" role="progressbar" aria-label="Review progress" aria-valuetext={`${count} of ${snapshot.units.length} reviewed`} aria-valuenow={count} aria-valuemin={0} aria-valuemax={snapshot.units.length}><div style={{ width: `${percent}%` }} /></div></div>
      <span className="sr-only" aria-live="polite">{saving ? 'Saving…' : error ? 'Save failed' : ''}</span>
      <Select.Root items={layouts} value={state.layout} onValueChange={layout => { if (layout) void act({ type: 'layout', layout }); }}>
        <Select.Trigger className="dropdown-trigger layout-trigger" aria-label="Diff layout"><Select.Value /><Select.Icon><Icon name="chevron" size={12} /></Select.Icon></Select.Trigger>
        <Select.Portal><Select.Positioner className="popup-positioner" sideOffset={4} align="end" alignItemWithTrigger={false} collisionPadding={8}>
          <Select.Popup className="popup layout-popup"><Select.List aria-label="Diff layout">
            {layouts.map(({ value, label }) => <Select.Item key={value} value={value} className="popup-item layout-option"><Select.ItemText>{label}</Select.ItemText><Select.ItemIndicator><Icon name="check" size={13} /></Select.ItemIndicator></Select.Item>)}
          </Select.List></Select.Popup>
        </Select.Positioner></Select.Portal>
      </Select.Root>
      <WrapToggle wrapLines={wrapLines} onToggle={toggleWrap} />
      <button className="next-button" onClick={nextUnreviewed} disabled={count === snapshot.units.length} aria-label="Next unreviewed" title="Next unreviewed"><span>Next</span><Icon name="arrow" /></button>
      <button className={notesOpen ? 'active' : ''} onClick={toggleNotes} aria-label="Toggle notes" aria-expanded={notesOpen} title="Notes"><Icon name="note" /><span className="button-label">Notes</span>{state.notes.length > 0 && <span className="note-count">{state.notes.length}</span>}</button>
      {state.notes.length > 0 && <button onClick={copyNotes} aria-label={copied ? 'Copied' : 'Copy notes'} title={copied ? 'Copied' : 'Copy notes'}><Icon name={copied ? 'check' : 'copy'} /><span className="button-label">{copied ? 'Copied' : 'Copy notes'}</span></button>}
      <Menu.Root modal={false}>
        <Menu.Trigger className="actions-trigger" aria-label="Review actions" title="Review actions">⋯</Menu.Trigger>
        <Menu.Portal><Menu.Positioner className="popup-positioner" sideOffset={4} align="end" collisionPadding={8}>
          <Menu.Popup className="popup actions-popup" aria-label="Review actions">
            <Menu.Item className="popup-item" onClick={() => setExpanded(Object.fromEntries(snapshot.units.map(u => [u.id, true])))}>Expand all</Menu.Item>
            <Menu.Item className="popup-item" onClick={() => setExpanded(current => ({ ...current, ...Object.fromEntries(snapshot.units.filter(u => state.reviewed[u.id]).map(u => [u.id, false])) }))}>Collapse reviewed</Menu.Item>
            <Menu.LinkItem className="popup-item" href="/">All reviews</Menu.LinkItem>
          </Menu.Popup>
        </Menu.Positioner></Menu.Portal>
      </Menu.Root>
    </header>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
    {newSnapshot && <div className="update-banner"><span>New snapshot available.</span><button onClick={() => {
      if (draft?.text && !confirm('Load the new snapshot and discard this unsaved draft?')) return;
      setData(newSnapshot); setExpanded({}); setNewSnapshot(undefined); setFullFile(undefined); setDraft(undefined); setError('');
    }}>Load new snapshot <Icon name="arrow" /></button></div>}
    {filesOpen && <button className="files-backdrop" aria-label="Dismiss files" onClick={closeFiles} />}
    <div className={`workspace ${filesOpen ? 'with-files' : ''} ${notesOpen ? 'with-notes' : ''}`}>
      {filesOpen && <aside id="modified-files" className="files-panel" aria-label="Changed files" onKeyDown={event => {
        if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeFiles(); }
      }}>
        <div className="panel-heading"><h2>Files <span>{snapshot.files.length}</span></h2><button onClick={closeFiles} aria-label="Close files"><Icon name="close" /></button></div>
        <ModifiedFiles key={snapshot.id} files={snapshot.files} onNavigate={jumpToFile} />
      </aside>}
      <main className="review-content" ref={content}>
        <div className="contextbar">
          <Popover.Root>
            <Popover.Trigger className="dropdown-trigger context-trigger scope-trigger" aria-label="Review details"><code>{snapshot.scope}</code><Icon name="chevron" size={12} /></Popover.Trigger>
            <Popover.Portal><Popover.Positioner className="popup-positioner" sideOffset={4} align="start" collisionPadding={8}>
              <Popover.Popup className="popup review-details"><Popover.Title className="sr-only">Review details</Popover.Title>
                {plan.summary && <p>{plan.summary}</p>}
                <dl><dt>Repository</dt><dd>{snapshot.repository}</dd><dt>Base</dt><dd><code>{snapshot.base}</code></dd><dt>Head</dt><dd><code>{snapshot.head}</code></dd><dt>Captured</dt><dd>{new Date(snapshot.createdAt).toLocaleString()}</dd></dl>
              </Popover.Popup>
            </Popover.Positioner></Popover.Portal>
          </Popover.Root>
          {plan.chapters.length > 1 && <Menu.Root modal={false}>
            <Menu.Trigger className="dropdown-trigger context-trigger" aria-label="Sections">Sections<Icon name="chevron" size={12} /></Menu.Trigger>
            <Menu.Portal><Menu.Positioner className="popup-positioner" sideOffset={4} align="start" collisionPadding={8}>
              <Menu.Popup className="popup sections-popup" aria-label="Sections">{plan.chapters.map(chapter =>
                <Menu.Item key={chapter.id} className="popup-item" onClick={() => document.getElementById(chapter.id)?.scrollIntoView({ block: 'start' })}><span>{chapter.title}</span><span className="muted">{chapter.items.filter(item => state.reviewed[item.unitId]).length}/{chapter.items.length}</span></Menu.Item>
              )}</Menu.Popup>
            </Menu.Positioner></Menu.Portal>
          </Menu.Root>}
          {!plan.curated && <span className="muted">File order</span>}
        </div>
        {!snapshot.units.length && <p className="empty-state">No changes.</p>}
        {plan.chapters.map(chapter => <section className="chapter" id={chapter.id} key={chapter.id}>
          {(plan.chapters.length > 1 || chapter.description) && <header className="chapter-heading"><h2>{chapter.title}</h2>{chapter.description && <p>{chapter.description}</p>}</header>}
          {chapter.items.map(item => {
            const unit = units.get(item.unitId)!;
            const file = files.get(unit.fileId)!;
            const defaultExpanded = !state.reviewed[unit.id] && (state.flags[unit.id] === 'changed' || item.expanded !== false);
            return <ReviewCard key={unit.id} unit={unit} file={file} item={item} layout={layout} wrapLines={wrapLines} reviewed={!!state.reviewed[unit.id]}
              flag={state.flags[unit.id]} expanded={expanded[unit.id] ?? defaultExpanded}
              notes={state.notes.filter(note => note.unitId === unit.id)}
              onToggle={() => setExpanded(current => ({ ...current, [unit.id]: !(current[unit.id] ?? defaultExpanded) }))}
              onReview={async () => {
                const reviewed = !state.reviewed[unit.id];
                if (await act({ type: 'review', ids: [unit.id], reviewed }) && reviewed)
                  setExpanded(current => ({ ...current, [unit.id]: false }));
              }}
              onNote={selection => beginNote(unit, selection)} onFull={() => setFullFile(file)} assetURL={assetURL} />;
          })}
        </section>)}
      </main>
      {notesOpen && <aside className="notes-panel" aria-label="Review notes"><div className="panel-heading"><h2>Notes</h2><button aria-label="Close notes" onClick={() => setNotesOpen(false)}><Icon name="close" /></button></div>
        {draft && draftFile && <form className="note-draft" onSubmit={async event => {
          event.preventDefault();
          const success = await act(draft.editingId ? { type: 'note-edit', id: draft.editingId, text: draft.text } : { type: 'note-add', ...draft });
          if (success) setDraft(undefined);
        }}><label htmlFor="note-text" className="sr-only">{draft.editingId ? 'Edit note' : 'Add note'}</label><div className="note-draft-location"><FileTypeIcon path={draftFile.path} /><code>{draftFile.path}{draft.start ? `:${draft.start}${draft.end !== draft.start ? `–${draft.end}` : ''}` : ''}{draft.side === 'before' ? ' (before)' : ''}</code></div>
          <textarea id="note-text" autoFocus value={draft.text} placeholder="Note or question…" onChange={event => setDraft({ ...draft, text: event.target.value })} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit(); }} />
          <div className="draft-actions"><button type="button" onClick={() => setDraft(undefined)}>Cancel</button><button className="primary" type="submit" disabled={!draft.text.trim() || saving > 0}>Save note</button></div>
        </form>}
        {!state.notes.length && !draft && <p className="notes-empty">Select lines or use a change’s note button.</p>}
        <div className="notes-list">{state.notes.map(note => <article className={`saved-note ${note.outdated ? 'outdated' : ''}`} key={note.id}>
          <button className="note-location" onClick={() => note.unitId && jump(note.unitId)} disabled={!note.unitId} title={note.path}><FileTypeIcon path={note.path} /><span>{note.path}{note.start ? `:${note.start}${note.end > note.start ? `–${note.end}` : ''}` : ''}</span></button>
          {(note.side === 'before' || note.outdated) && <div className="note-meta">{note.side === 'before' && <span>Before</span>}{note.outdated && <span title="Original code context is retained">Outdated</span>}</div>}<p>{note.text}</p>
          <div className="note-actions"><button onClick={() => { if (note.unitId && units.has(note.unitId)) setDraft({ unitId: note.unitId, side: note.side, start: note.start, end: note.end, text: note.text, editingId: note.id }); else {
            const text = prompt('Edit note', note.text); if (text?.trim()) void act({ type: 'note-edit', id: note.id, text });
          } }}>Edit</button><button onClick={() => void act({ type: 'note-delete', id: note.id })}>Delete</button></div>
        </article>)}</div>
      </aside>}
    </div>
    {fullFile && <div className="modal-backdrop" onClick={() => setFullFile(undefined)}><section className="full-file-modal" role="dialog" aria-modal="true" aria-label="Full file diff" onClick={e => e.stopPropagation()}><header><h3><FileTypeIcon path={fullFile.path} /><span>{fullFile.path}</span></h3><div className="full-file-actions"><WrapToggle wrapLines={wrapLines} onToggle={toggleWrap} /><button aria-label="Close full file" onClick={() => setFullFile(undefined)}><Icon name="close" /></button></div></header><div className="full-file-body"><DiffSurface file={fullFile} layout={layout} wrapLines={wrapLines} notes={[]} onSelect={selection => {
      const side = selection.side === 'deletions' ? 'before' : 'after';
      const unit = snapshot.units.find(u => u.fileId === fullFile.id && (side === 'after' ? selection.start >= u.newStart && selection.start < u.newStart + u.newCount : selection.start >= u.oldStart && selection.start < u.oldStart + u.oldCount)) ?? snapshot.units.find(u => u.fileId === fullFile.id)!;
      beginNote(unit, selection); setFullFile(undefined);
    }} /></div></section></div>}
    {manualCopy !== undefined && <div className="modal-backdrop"><section className="copy-modal" role="dialog" aria-modal="true" aria-label="Copy notes manually"><p>Clipboard unavailable. Select and copy:</p><textarea value={manualCopy} readOnly onFocus={e => e.target.select()} autoFocus /><button onClick={() => setManualCopy(undefined)}>Done</button></section></div>}
  </>;
}

function ReviewCard({ unit, file, item, layout, wrapLines, reviewed, flag, expanded, notes, onToggle, onReview, onNote, onFull, assetURL }: {
  unit: Unit; file: ReviewFile; item: PlanItem; layout: 'split' | 'unified'; wrapLines: boolean; reviewed: boolean; flag?: 'new' | 'changed'; expanded: boolean;
  notes: Note[]; onToggle(): void; onReview(): void; onNote(selection?: SelectedLineRange | null): void; onFull(): void; assetURL(asset: string): string;
}) {
  const [selection, setSelection] = useState<SelectedLineRange | null>(null);
  const label = <span className="file-label"><FileTypeIcon path={file.path} /><code>{file.path}{unit.kind === 'text' && <span className="line-range">:{rangeLabel(unit.newCount ? unit.newStart : unit.oldStart, unit.newCount || unit.oldCount)}</span>}</code></span>;
  return <article className={`review-card ${reviewed ? 'is-reviewed' : ''} ${expanded ? '' : 'is-collapsed'} ${item.emphasis === 'attention' ? 'attention' : ''}`} id={unit.id} data-unit-id={unit.id}>
    <header className="card-heading"><button className="collapse-toggle" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${file.path}`}><span className={expanded ? 'chevron open' : 'chevron'}><Icon name="chevron" /></span></button>
      <div className="card-file">{file.kind === 'text' ? <button className="file-open" aria-label={`Full file: ${file.path}`} title={`${file.path} — full file diff`} onClick={onFull}>{label}</button> : label}{file.previousPath && <small>← {file.previousPath}</small>}</div>
      <div className="card-badges">{unit.additions > 0 && <span className="additions">+{unit.additions}</span>}{unit.deletions > 0 && <span className="deletions">−{unit.deletions}</span>}
        {file.status[0] === 'A' && <span>Added</span>}{file.status[0] === 'D' && <span>Deleted</span>}
        {file.after?.mode === '100755' && !file.before && <span>Executable</span>}
        {file.before && file.after && file.before.mode !== file.after.mode && <span>Mode {file.before.mode} → {file.after.mode}</span>}
        {flag && <span className={`flag ${flag}`} title={flag === 'changed' ? 'Changed since previous snapshot' : 'New in this snapshot'}>{flag === 'changed' ? 'Changed' : 'New'}</span>}</div>
      <button className={`add-note ${selection ? 'has-selection' : ''}`} onClick={() => onNote(selection)} aria-label={selection ? `Note on selected lines ${Math.min(selection.start, selection.end)}–${Math.max(selection.start, selection.end)}` : 'Add note'} title={selection ? `Note on lines ${Math.min(selection.start, selection.end)}–${Math.max(selection.start, selection.end)}` : 'Add note'}><Icon name="note" />{notes.length > 0 && <span className="note-count">{notes.length}</span>}</button>
      <button className={`review-toggle ${reviewed ? 'checked' : ''}`} onClick={onReview} aria-pressed={reviewed} aria-label={reviewed ? 'Reviewed' : 'Mark reviewed'} title={reviewed ? 'Reviewed' : 'Mark reviewed'}><span className="checkbox">{reviewed && <Icon name="check" size={12} />}</span></button>
    </header>
    {expanded && <>
      {(item.title || item.explanation) && <div className="card-explanation">{item.title && <strong>{item.title}</strong>}{item.explanation && <p>{item.explanation}</p>}</div>}
      <div className="card-body">{unit.kind === 'text' ? <DiffSurface file={file} unit={unit} layout={layout} wrapLines={wrapLines} notes={notes} onSelect={onNote} onSelectionChange={setSelection} />
        : unit.kind === 'image' ? <ImageComparison file={file} assetURL={assetURL} />
        : <div className="metadata-view">{(file.before?.mode === '160000' || file.after?.mode === '160000') && <p>Submodule. Review nested changes separately.</p>}{unit.kind === 'binary' && <p>Binary · {file.before?.size.toLocaleString() ?? '—'} → {file.after?.size.toLocaleString() ?? '—'} bytes</p>}{unit.kind === 'metadata' && (!file.before || !file.after) && <p>Empty file</p>}<div className="raw-assets">{file.before?.asset && file.before.hash !== file.after?.hash && <a href={assetURL(file.before.asset)} download={`before-${shortPath(file.path)}`}>Download before</a>}{file.after?.asset && <a href={assetURL(file.after.asset)} download={`after-${shortPath(file.path)}`}>{file.before?.hash === file.after.hash ? 'Download' : 'Download after'}</a>}</div></div>}</div>
    </>}
  </article>;
}

function DiffSurface({ file, unit, layout, wrapLines, notes, onSelect, onSelectionChange }: { file: ReviewFile; unit?: Unit; layout: 'split' | 'unified'; wrapLines: boolean; notes: Note[]; onSelect(range: SelectedLineRange): void; onSelectionChange?(range: SelectedLineRange | null): void }) {
  const options = useMemo<FileDiffOptions<string, undefined>>(() => ({
    theme: 'kiahgawa', themeType: 'dark', preferredHighlighter: highlighter, diffStyle: layout,
    disableFileHeader: true, diffIndicators: 'bars', overflow: wrapLines ? 'wrap' : 'scroll', lineDiffType: 'word-alt',
    enableLineSelection: true, enableGutterUtility: true, onGutterUtilityClick: onSelect, onLineSelected: onSelectionChange,
    hunkSeparators: 'line-info-basic',
  }), [layout, wrapLines, onSelect, onSelectionChange]);
  const annotations = useMemo(() => notes.filter(n => !n.outdated && n.start > 0).map(n => ({
    side: n.side === 'before' ? 'deletions' as const : 'additions' as const, lineNumber: n.end, metadata: n.id,
  })), [notes]);
  if (!file.diff) return <p className="muted metadata-view">No textual changes.</p>;
  if (unit) return <HunkSurface file={file} unit={unit} options={options} notes={notes} />;
  return <RenderBoundary><FileDiff fileDiff={file.diff} options={options} lineAnnotations={annotations}
    renderAnnotation={annotation => <div className="inline-note"><Icon name="note" size={13} />{notes.find(n => n.id === annotation.metadata)?.text}</div>} /></RenderBoundary>;
}

function HunkSurface({ file, unit, options, notes }: { file: ReviewFile; unit: Unit; options: FileDiffOptions<string, undefined>; notes: Note[] }) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<VanillaFileDiff<string, undefined> | null>(null);
  useEffect(() => {
    renderer.current = new VanillaFileDiff<string, undefined>({});
    return () => { renderer.current?.cleanUp(); renderer.current = null; };
  }, []);
  useEffect(() => {
    if (!renderer.current || !container.current || !file.diff || unit.hunkIndex === undefined) return;
    const hunk = file.diff.hunks[unit.hunkIndex];
    const split = options.diffStyle === 'split';
    // renderRange uses visible-row offsets, whereas hunk.*LineStart includes
    // collapsed source rows. With automatic context expansion disabled, the
    // window begins after the sizes of the preceding visible hunks.
    const startingLine = file.diff.hunks.slice(0, unit.hunkIndex).reduce((sum, previous) =>
      sum + (split ? previous.splitLineCount : previous.unifiedLineCount), 0);
    // Render a window of the *unaltered, complete* diff. This preserves parser
    // indexes, multiline lexer state, and original line numbers. No fake
    // partial metadata and no re-diffing code fragments.
    // setOptions alone does not invalidate an unchanged renderRange. Force a
    // new DOM pass when presentation changes without changing logical rows.
    const forceRender = renderer.current.options.overflow !== options.overflow
      || renderer.current.options.diffStyle !== options.diffStyle;
    renderer.current.setOptions({ ...options, collapsedContextThreshold: 0, hunkSeparators: 'simple',
      // Context expansion changes window geometry. Keep that interaction in
      // the full-file view rather than shifting changes out of a chunk.
      unsafeCSS: '[data-separator] { display: none; pointer-events: none; } [data-column-number] { text-align: left; }',
      renderAnnotation: annotation => {
        const node = document.createElement('div');
        node.className = 'inline-note';
        node.textContent = notes.find(note => note.id === annotation.metadata)?.text ?? '';
        return node;
      },
    });
    renderer.current.render({ fileDiff: file.diff, containerWrapper: container.current, forceRender,
      renderRange: { startingLine,
        totalLines: split ? hunk.splitLineCount : hunk.unifiedLineCount, bufferBefore: 0, bufferAfter: 0 },
      lineAnnotations: notes.filter(note => !note.outdated && note.start > 0).map(note => ({
        side: note.side === 'before' ? 'deletions' : 'additions', lineNumber: note.end, metadata: note.id,
      })),
    });
  }, [file, unit, options, notes]);
  return <div ref={container} className="hunk-surface" />;
}

function ImageComparison({ file, assetURL }: { file: ReviewFile; assetURL(asset: string): string }) {
  const [mode, setMode] = useState<'split' | 'overlay'>('split');
  const [position, setPosition] = useState(50);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const before = file.before?.asset && assetURL(file.before.asset);
  const after = file.after?.asset && assetURL(file.after.asset);
  return <div className="image-comparison"><div className="image-toolbar"><div className="segmented"><button className={mode === 'split' ? 'selected' : ''} onClick={() => setMode('split')}>Side-by-side</button><button disabled={!before || !after} className={mode === 'overlay' ? 'selected' : ''} onClick={() => setMode('overlay')}>Slider</button></div></div>
    {mode === 'split' ? <div className={`image-pair ${!before || !after ? 'single' : ''}`}>{(['before', 'after'] as const).filter(side => file[side]).map(side => <figure key={side}><figcaption>{side === 'before' ? 'Before' : 'After'}<span>{sizes[side]} · {file[side]!.size.toLocaleString()} bytes</span></figcaption><div className="image-mat"><img src={assetURL(file[side]!.asset!)} alt={`${side === 'before' ? 'Before' : 'After'}: ${file.path}`} onLoad={e => { const size = `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`; setSizes(current => ({ ...current, [side]: size })); }} /></div></figure>)}</div>
      : <div className="overlay-container"><div className="overlay-image"><img src={after || undefined} alt={`After: ${file.path}`} /><div className="overlay-before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}><img src={before || undefined} alt={`Before: ${file.path}`} /></div><div className="slider-line" style={{ left: `${position}%` }}><span>↔</span></div><span className="image-label before">Before</span><span className="image-label after">After</span></div><input type="range" min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))} aria-label="Image comparison position" /></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
