import { useEffect, useRef, useState } from 'react';
import { api, uploadFile, type Quest, type Submission } from '../api';
import { Icon, SUB_LABEL } from '../icons';

interface Pending {
  key: string; file: File; preview: string; progress: number;
  mediaId?: string; error?: string; ctrl: AbortController;
}

/** Proof form: optional text plus any number of photos/videos, uploaded straight to storage with progress. */
export default function SubmitForm({ quest, onSubmitted }: { quest: Quest; onSubmitted: (s: Submission) => void }) {
  const wantsMedia = quest.submissionTypes.some((t) => t !== 'text');
  const wantsText = quest.submissionTypes.includes('text');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Pending[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Free preview URLs and cancel uploads when leaving.
  useEffect(() => () => filesRef.current.forEach((f) => { URL.revokeObjectURL(f.preview); f.ctrl.abort(); }), []);

  const patch = (key: string, p: Partial<Pending>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));

  function add(list: FileList | null) {
    if (!list) return;
    setErr('');
    const accepted = [...list].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/') || /\.(heic|heif|mov|mp4|m4v)$/i.test(f.name));
    if (accepted.length < list.length) setErr('Only photos and videos can be added.');
    const items = accepted.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file, preview: URL.createObjectURL(file), progress: 0, ctrl: new AbortController(),
    }));
    setFiles((fs) => [...fs, ...items]);
    // Start uploading right away so it's (nearly) done by the time they hit Submit.
    for (const it of items) {
      uploadFile(it.file, (p) => patch(it.key, { progress: p }), it.ctrl.signal)
        .then((mediaId) => patch(it.key, { mediaId, progress: 1 }))
        .catch((e) => { if (!it.ctrl.signal.aborted) patch(it.key, { error: e.message }); });
    }
  }

  function remove(f: Pending) {
    f.ctrl.abort();
    URL.revokeObjectURL(f.preview);
    setFiles((fs) => fs.filter((x) => x.key !== f.key));
  }

  async function submit() {
    setErr('');
    if (!text.trim() && !files.length) { setErr('Add a photo, a video or some text first.'); return; }
    if (files.some((f) => f.error)) { setErr('Remove the files that failed, then try again.'); return; }
    setBusy(true);
    try {
      // Wait for any uploads still in flight.
      while (filesRef.current.some((f) => !f.mediaId && !f.error)) await new Promise((r) => setTimeout(r, 300));
      if (filesRef.current.some((f) => f.error)) throw new Error('An upload failed. Remove it and try again.');
      const s = await api.submit(quest.id, text.trim(), filesRef.current.map((f) => f.mediaId!));
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview));
      setFiles([]); setText('');
      onSubmitted(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const uploading = files.filter((f) => !f.mediaId && !f.error).length;

  return (
    <section className="submit" aria-label="Submit proof">
      <div className="section-h">
        <h3>Submit proof</h3>
        <span className="facts">{quest.submissionTypes.map((t) => <span key={t} className="fact"><Icon name={t} size={13} />{SUB_LABEL[t]}</span>)}</span>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{quest.proof}</p>

      {wantsMedia && (
        <>
          <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
            <Icon name="upload" size={22} />
            <b>Add photos or videos</b>
            <span className="muted" style={{ fontSize: 12 }}>Take them now or pick from your camera roll</span>
          </div>
          <input ref={input} type="file" accept="image/*,video/*" multiple hidden
            onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </>
      )}

      {!!files.length && (
        <div className="files">
          {files.map((f) => (
            <div key={f.key} className={`file${f.error ? ' failed' : ''}`} title={f.error || f.file.name}>
              {f.file.type.startsWith('video/')
                ? <video src={f.preview} muted playsInline preload="metadata" />
                : <img src={f.preview} alt="" />}
              {f.file.type.startsWith('video/') && <span className="tag">Video</span>}
              {f.error ? <span className="tag" style={{ background: 'var(--bad)' }}>Failed</span>
                : !f.mediaId && <span className="bar"><i style={{ width: `${Math.round(f.progress * 100)}%` }} /></span>}
              <button className="x" onClick={() => remove(f)} aria-label={`Remove ${f.file.name}`}><Icon name="x" size={11} stroke={3} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor={`txt-${quest.id}`}>{wantsText ? 'Your answer' : 'Caption (optional)'}</label>
        <textarea id={`txt-${quest.id}`} className="input" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={wantsText ? 'Type what the proof asks for…' : 'Anything the Game Master should know?'} />
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" onClick={submit} disabled={busy}>
        {busy ? (uploading ? `Uploading ${uploading} file${uploading > 1 ? 's' : ''}…` : 'Submitting…') : 'Submit for review'}
      </button>
    </section>
  );
}
