import { useMemo, useRef } from 'react';
import { FileTree, useFileTree } from '@pierre/trees/react';
import type { GitStatusEntry } from '@pierre/trees';
import type { ReviewFile } from './model.ts';

// Mounted for one immutable snapshot. Revisions get a fresh model; note and
// review-state updates keep the existing tree, focus, and directory expansion.
export function ModifiedFiles({ files, onNavigate }: { files: ReviewFile[]; onNavigate(path: string): void }) {
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;
  const paths = useMemo(() => files.map(file => file.path), [files]);
  const filePaths = useMemo(() => new Set(paths), [paths]);
  const gitStatus = useMemo<GitStatusEntry[]>(() => files.map(file => ({
    path: file.path,
    status: file.status.startsWith('A') ? 'added' : file.status.startsWith('D') ? 'deleted'
      : file.status.startsWith('R') ? 'renamed' : 'modified',
  })), [files]);
  const activate = (path: string | null | undefined) => {
    if (path && filePaths.has(path)) navigate.current(path);
  };
  const { model } = useFileTree({
    paths, gitStatus, initialExpansion: 'open', density: 'compact',
    icons: { set: 'complete', colored: true }, search: true,
    renaming: false, dragAndDrop: false,
  });
  return <FileTree model={model} className="modified-tree" aria-label="Modified files"
    // Row buttons emit clicks for pointer, Enter, and Space activation, even
    // when already selected. Ignore clicks on search or empty tree space.
    onClick={event => {
      const row = event.nativeEvent.composedPath().find((node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute('data-item-path'));
      activate(row?.dataset.itemPath);
    }}
    // Trees consumes Enter in its search field before the event bubbles out.
    onKeyDownCapture={event => {
      if (event.key === 'Enter' && model.isSearchOpen()) activate(model.getFocusedPath());
    }} />;
}
