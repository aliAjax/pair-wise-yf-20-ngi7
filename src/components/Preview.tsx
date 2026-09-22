import { useEffect, useMemo, useRef } from "react";
import type { MusicCue, Unit } from "../firework";
import { fmtTime } from "../firework";

interface PreviewProps {
  units: Unit[];
  cues: MusicCue[];
  endMs: number;
  playTime: number;
  playing: boolean;
  onTick: (ms: number) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onEnded: () => void;
}

export default function Preview({ units, cues, endMs, playTime, playing, onTick, onTogglePlay, onStop, onEnded }: PreviewProps) {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<{ wall: number; time: number } | null>(null);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = null;
      return;
    }
    startRef.current = { wall: performance.now(), time: playTime };
    const loop = (wall: number) => {
      const s = startRef.current;
      if (!s) return;
      const t = s.time + (wall - s.wall);
      if (t >= endMs) {
        onTick(endMs);
        onEnded();
        return;
      }
      onTick(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const events = useMemo(() => {
    const list = [
      ...units.map((u) => ({ ms: u.fireTime, kind: "fire" as const, name: u.name, codes: u.members.map((m) => m.code).join("·"), section: u.members[0]?.section ?? "" })),
      ...cues.map((c) => ({ ms: c.time, kind: "cue" as const, name: c.label, codes: "♪ 音乐时间点", section: "" })),
    ];
    return list.sort((a, b) => a.ms - b.ms);
  }, [units, cues]);

  const upcoming = events.filter((e) => e.ms >= playTime).slice(0, 4);
  const progress = Math.min(100, (playTime / endMs) * 100);

  return (
    <div className="preview">
      <div className="heading">
        <div>
          <p>整场节目预览</p>
          <h2>{fmtTime(playTime)} <small>/ {fmtTime(endMs)}</small></h2>
        </div>
        <div className="preview-controls">
          <button className="primary" onClick={onTogglePlay}>
            {playing ? "暂停" : playTime >= endMs ? "重新播放" : "播放"}
          </button>
          <button onClick={onStop}>停止归零</button>
        </div>
      </div>
      <div className="preview-progress">
        <i style={{ width: `${progress}%` }} />
      </div>
      <ol className="upcoming">
        {upcoming.length === 0 && <li className="empty">节目已结束</li>}
        {upcoming.map((e, i) => (
          <li key={e.ms + e.name + i} className={e.kind === "cue" ? "up-cue" : "up-fire"}>
            <b>{fmtTime(e.ms)}</b>
            <span>{e.name}</span>
            <em>{e.codes}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}
