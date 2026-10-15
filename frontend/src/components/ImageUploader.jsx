import { useEffect, useMemo, useRef } from 'react';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGES = 5;

/** Controlled uploader: `existing` are already-saved images (edit mode), `files` are newly chosen ones. */
export default function ImageUploader({ existing, files, onRemoveExisting, onAddFiles, onRemoveFile, onError }) {
  const input = useRef(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const total = existing.length + files.length;

  const handleChoose = (e) => {
    const chosen = Array.from(e.target.files);
    e.target.value = '';
    const bad = chosen.find((f) => !ALLOWED.includes(f.type));
    if (bad) return onError(`"${bad.name}" is not a JPEG, PNG or WebP image`);
    const big = chosen.find((f) => f.size > MAX_BYTES);
    if (big) return onError(`"${big.name}" is larger than 2 MB`);
    if (total + chosen.length > MAX_IMAGES) return onError(`You can upload at most ${MAX_IMAGES} images`);
    onError('');
    onAddFiles(chosen);
  };

  return (
    <div className="uploader">
      <div className="thumbs">
        {existing.map((img, i) => (
          <div className="thumb" key={`e${img.id}`}>
            <img src={img.url} alt="" />
            {i === 0 && <span className="cover-tag">Cover</span>}
            <button type="button" aria-label="Remove image" onClick={() => onRemoveExisting(img.id)}>×</button>
          </div>
        ))}
        {previews.map((src, i) => (
          <div className="thumb" key={src}>
            <img src={src} alt="" />
            {existing.length === 0 && i === 0 && <span className="cover-tag">Cover</span>}
            <button type="button" aria-label="Remove image" onClick={() => onRemoveFile(i)}>×</button>
          </div>
        ))}
        {total < MAX_IMAGES && (
          <button type="button" className="thumb add" onClick={() => input.current.click()}>+<span>Add photo</span></button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleChoose} />
      <p className="muted small">At least 1 photo is required (max {MAX_IMAGES}, JPEG/PNG/WebP, 2 MB each). The first is the cover image.</p>
    </div>
  );
}
