import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Media, Submission } from '../api';
import { Icon, CatIcon } from '../icons';
import { STATUS_LABEL, timeAgo } from '../util';

/** Grid of photo/video thumbnails; tapping one opens the lightbox. */
export function Gallery({ media, title }: { media: Media[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  return (
    <>
      <div className="gallery">
        {media.map((m, i) => (
          <button key={m.id} className="tile" onClick={() => setOpen(i)} aria-label={`Open ${m.kind} ${i + 1}`}>
            {m.status === 'processing' && m.kind === 'video' && !m.thumbUrl
              ? <span className="proc">Processing video…</span>
              : <img src={m.thumbUrl ?? m.url} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
            {m.kind === 'video' && <span className="play"><Icon name="play" size={26} stroke={0} /></span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox media={media} index={open} title={title} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

export function Lightbox({ media, index, title, onIndex, onClose }: {
  media: Media[]; index: number; title: string; onIndex: (i: number) => void; onClose: () => void;
}) {
  const m = media[index];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < media.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, media.length, onClose, onIndex]);

  // Videos still processing play the original; most phones can play their own format.
  const src = m.kind === 'video' && m.status !== 'ready' ? m.originalUrl : m.url;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={title}>
      <div className="lightbox-top">
        <span className="grow">{title} · {index + 1}/{media.length}</span>
        <a className="icon-btn" href={m.originalUrl} aria-label="Download original" title="Download original"><Icon name="download" size={18} /></a>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
      </div>
      <div className="lightbox-body" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {m.kind === 'video'
          ? <video key={m.id} src={src} controls autoPlay playsInline poster={m.thumbUrl ?? undefined} />
          : <img key={m.id} src={src} alt="" />}
        {index > 0 && <button className="lb-nav prev" onClick={() => onIndex(index - 1)} aria-label="Previous"><Icon name="back" size={20} /></button>}
        {index < media.length - 1 && <button className="lb-nav next" onClick={() => onIndex(index + 1)} aria-label="Next" style={{ transform: 'translateY(-50%) scaleX(-1)' }}><Icon name="back" size={20} /></button>}
      </div>
    </div>
  );
}

export function SubmissionCard({ s, showQuest, onWithdraw, extra }: {
  s: Submission; showQuest?: boolean; onWithdraw?: () => void; extra?: ReactNode;
}) {
  return (
    <article className="sub">
      {showQuest && (
        <Link className="sub-quest" to={`/quests/${s.questId}`}>
          <CatIcon cat={s.questCategory} size={18} />{s.questTitle}
        </Link>
      )}
      <div className="sub-h">
        <span className="team-pill"><span className="team-dot" style={{ background: s.team.color }} />{s.team.name}</span>
        <span className="muted">by {s.player.name}</span>
        <span className={`status ${s.status}`}>
          {s.status === 'approved' ? `+${s.pointsAwarded} pts` : STATUS_LABEL[s.status === 'pending' ? 'pending' : 'rejected']}
        </span>
        <span className="when">{timeAgo(s.createdAt)}</span>
      </div>
      {s.text && <div className="sub-text">{s.text}</div>}
      <Gallery media={s.media} title={`${s.team.name} · ${s.questTitle}`} />
      {s.reviewerNote && <div className="note"><b>Game Master:</b> {s.reviewerNote}</div>}
      {extra}
      {onWithdraw && s.status === 'pending' && (
        <div><button className="btn sm danger" onClick={onWithdraw}><Icon name="trash" size={14} />Withdraw</button></div>
      )}
    </article>
  );
}
