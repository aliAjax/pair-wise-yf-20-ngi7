import type { MusicCue, Unit } from "../firework";
import { fmtTime } from "../firework";

interface TimeAxisProps {
  units: Unit[];
  cues: MusicCue[];
  endMs: number;
  selection: string[];
  activeUnitIds: Set<string>;
  playTime: number;
  unitColor: Map<string, string>;
  onToggleUnit: (id: string) => void;
  onSeek: (ms: number) => void;
}

const TRACK_GAP = 8;
const ROW_H = 46;
const RULER_H = 30;

export function timelineEnd(units: Unit[], cues: MusicCue[]): number {
  let end = 30_000;
  for (const u of units) {
    const dur = Math.max(...u.members.map((m) => m.duration));
    end = Math.max(end, u.fireTime + dur);
  }
  for (const c of cues) end = Math.max(end, c.time + 1000);
  return end + 6000;
}

export default function TimeAxis({
  units,
  cues,
  endMs,
  selection,
  activeUnitIds,
  playTime,
  unitColor,
  onToggleUnit,
  onSeek,
}: TimeAxisProps) {
  const sections = Array.from(new Set(units.map((u) => u.members[0]?.section ?? "未分段")));
  const pct = (ms: number) => `${(ms / endMs) * 100}%`;
  const ticks: number[] = [];
  for (let t = 0; t <= endMs; t += 15_000) ticks.push(t);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * endMs);
  };

  return (
    <div className="timeline" style={{ paddingTop: RULER_H }}>
      {/* 游标 / 播放头 */}
      <div className="playhead" style={{ left: pct(playTime) }}>
        <span>{fmtTime(playTime)}</span>
      </div>

      {/* 顶部刻度与音乐时间点 */}
      <div className="ruler" style={{ height: RULER_H }} onClick={seek}>
        {ticks.map((t) => (
          <div key={t} className="tick" style={{ left: pct(t) }}>
            <i />
            <small>{fmtTime(t).slice(3)}</small>
          </div>
        ))}
        {cues.map((c) => (
          <div key={c.id} className="cue-mark" style={{ left: pct(c.time) }} title={`${c.label} ${fmtTime(c.time)}`}>
            <b>♪</b>
            <small>{c.label}</small>
          </div>
        ))}
      </div>

      {sections.map((section) => {
        const rows = units.filter((u) => (u.members[0]?.section ?? "未分段") === section);
        return (
          <div className="lane" key={section} style={{ height: ROW_H, marginBottom: TRACK_GAP }}>
            <div className="lane-label">{section}</div>
            <div className="lane-track">
              {rows.map((u) => {
                const dur = Math.max(...u.members.map((m) => m.duration));
                const codes = u.members.map((m) => m.code).join("·");
                const selected = selection.includes(u.id);
                const active = activeUnitIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    className={[
                      "block",
                      u.kind === "group" ? "block-group" : "block-single",
                      selected ? "block-selected" : "",
                      active ? "block-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      u.kind === "group"
                        ? ({ left: pct(u.fireTime), width: pct(Math.max(dur, 1200)), minWidth: 44, ["--c" as string]: unitColor.get(u.id) } as React.CSSProperties)
                        : { left: pct(u.fireTime), width: pct(Math.max(dur, 1200)), minWidth: 44 }
                    }
                    title={`${u.name}（${codes}）${fmtTime(u.fireTime)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleUnit(u.id);
                    }}
                  >
                    <b>{u.name}</b>
                    <small>{codes}</small>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
