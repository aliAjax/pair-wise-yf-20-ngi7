import type { FirePoint, MusicPoint, SalvoGroup } from "../lib/domain";
import { colorForGroup, formatMs } from "../lib/domain";

interface TimelineProps {
  points: FirePoint[];
  music: MusicPoint[];
  groups: SalvoGroup[];
  activeIds: Set<string>;
  playMs: number;
  onSeek: (ms: number) => void;
}

const PX_PER_SEC = 2.6;

export default function Timeline({
  points,
  music,
  groups,
  activeIds,
  playMs,
  onSeek,
}: TimelineProps) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const endMs = Math.max(
    ...points.map((p) => p.timeMs + p.durationMs),
    ...music.map((m) => m.timeMs),
    10_000
  );
  const totalMs = Math.ceil(endMs / 10_000) * 10_000;
  const width = Math.ceil((totalMs / 1000) * PX_PER_SEC) + 80;
  const px = (ms: number) => (ms / 1000) * PX_PER_SEC;

  // 时间轴条目：每组只留主控点位一条；未编组点位各自一条
  const groupedIds = new Set<string>();
  groups.forEach((g) => g.memberIds.forEach((id) => groupedIds.add(id)));
  const items: { key: string; p: FirePoint; groupId: string | null; label: string }[] = [];
  for (const g of groups) {
    const master = byId.get(g.masterId);
    if (master) {
      items.push({
        key: "g" + g.id,
        p: master,
        groupId: g.id,
        label: `${g.name} · ${master.name}（主控 · ${g.memberIds.length}发齐射）`,
      });
    }
  }
  for (const p of points) {
    if (!groupedIds.has(p.id)) {
      items.push({ key: "p" + p.id, p, groupId: null, label: `${p.name} · ${p.model}` });
    }
  }
  items.sort((a, b) => a.p.timeMs - b.p.timeMs);

  const ticks: number[] = [];
  for (let t = 0; t <= totalMs; t += 10_000) ticks.push(t);

  return (
    <div className="timeline-scroll">
      <div className="timeline" style={{ width }} onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ms = ((e.clientX - rect.left) / PX_PER_SEC) * 1000;
        onSeek(Math.max(0, Math.min(totalMs, ms)));
      }}>
        {/* 秒刻度 */}
        <div className="ruler">
          {ticks.map((t) => (
            <div key={t} className="tick" style={{ left: px(t) }}>
              <b>{formatMs(t)}</b>
            </div>
          ))}
        </div>

        {/* 音乐点轨道 */}
        <div className="track music-track">
          {music.map((m) => (
            <div key={m.id} className="music-marker" style={{ left: px(m.timeMs) }} title={m.label}>
              ♪ {m.label}
            </div>
          ))}
        </div>

        {/* 点火轨道 */}
        {items.map((item) => {
          const color = colorForGroup(groups, item.groupId);
          const active = activeIds.has(item.p.id);
          return (
            <div className="track" key={item.key}>
              <div
                className={"bar" + (active ? " active" : "")}
                style={{
                  left: px(item.p.timeMs),
                  width: Math.max(10, px(item.p.durationMs)),
                  background: item.groupId ? color : undefined,
                  borderColor: item.groupId ? color : undefined,
                }}
                title={`${item.label} @ ${formatMs(item.p.timeMs)}`}
              >
                {item.label}
              </div>
            </div>
          );
        })}

        {/* 播放头 */}
        <div className="playhead" style={{ left: px(playMs) }}>
          <div className="playhead-time">{formatMs(playMs)}</div>
        </div>
      </div>
    </div>
  );
}
