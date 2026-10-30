import { createFileTreeIconResolver, getBuiltInSpriteSheet } from '@pierre/trees';

// Reuse the tree's public icon resolver and bundled sprite, not a second
// extension map or any SVG supplied by the repository under review.
const { resolveIcon } = createFileTreeIconResolver({ set: 'complete', colored: true });
const sprite = getBuiltInSpriteSheet('complete');

export function FileIconSprite() {
  return <div className="file-icon-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />;
}

export function FileTypeIcon({ path }: { path: string }) {
  const icon = resolveIcon('file-tree-icon-file', path);
  return <svg className="file-type-icon" data-file-type={icon.token ?? 'default'} width="14" height="14"
    viewBox={icon.viewBox ?? '0 0 16 16'} fill="currentColor" aria-hidden="true"><use href={`#${icon.name}`} /></svg>;
}
