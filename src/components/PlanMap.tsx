import type { ConflictRow, FireworkPoint, MusicCue, Unit } from "../firework";
import { FIELD_H, FIELD_W, envelope, fmtTime, groupColor, groupEnvelopeHull } from "../firework";

interface PlanMapProps {
  units: Unit[];
  unitColor: Map<string, string>;
  conflicts: ConflictRow[];
  cues: MusicCue[];
  /** 已选中、尚未提交的候选点位（虚线候选包络） */
  candidatePoints: FireworkPoint[];
  selection: string[];
  masterMap: Map<string, string | null>;
  activeUnitIds: Set<string>;
  onToggleUnit: (id: string) => void;
  onClearSelection: () => void;
}

// SVG viewBox 给包络留溢出余量
const PAD = 18;
const W = FIELD_W + PAD * 2;
const H = FIELD_H + PAD * 2;
// 数学坐标 -> SVG（y 翻转）
const sx = (x: number) => x + PAD;
const sy = (y: number) => FIELD_H - y + PAD;

export default function PlanMap({
  units,
  unitColor,
  conflicts,
  cues,
  candidatePoints,
  selection,
  masterMap,
  activeUnitIds,
  onToggleUnit,
  onClearSelection,
}: PlanMapProps) {
  const hullPoints = (members: FireworkPoint[]) =>
    groupEnvelopeHull(members)
      .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
      .join(" ");

  const conflictLinks = conflicts.map((c) => {
    const a = units.find((u) => u.id === c.aId);
    const b = units.find((u) => u.id === c.bId);
    const pa = a?.members.find((m) => m.id === c.aMemberId) ?? a?.members[0];
    const pb = b?.members.find((m) => m.id === c.bMemberId) ?? b?.members[0];
    if (!pa || !pb) return null;
    const ea = envelope(pa);
    const eb = envelope(pb);
    return { id: c.aId + c.bId, x1: sx(ea.cx), y1: sy(ea.cy), x2: sx(eb.cx), y2: sy(eb.cy), bothGroup: c.bothGroup };
  });

  return (
    <svg className="plan-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="燃放点位平面图" onClick={onClearSelection}>
      {/* 场地 */}
      <rect x={PAD} y={PAD} width={FIELD_W} height={FIELD_H} rx={4} className="field" />
      {Array.from({ length: Math.floor(FIELD_W / 10) + 1 }, (_, i) => (
        <line key={"v" + i} x1={sx(i * 10)} y1={sy(0)} x2={sx(i * 10)} y2={sy(FIELD_H)} className="grid" />
      ))}
      {Array.from({ length: Math.floor(FIELD_H / 10) + 1 }, (_, i) => (
        <line key={"h" + i} x1={sx(0)} y1={sy(i * 10)} x2={sx(FIELD_W)} y2={sy(i * 10)} className="grid" />
      ))}
      <text x={sx(2)} y={sy(FIELD_H - 2.5)} className="field-tag">
        场地 {FIELD_W}m × {FIELD_H}m（北向↑）
      </text>

      {/* 未提交候选的临时包络 */}
      {candidatePoints.length >= 2 && (
        <polygon points={hullPoints(candidatePoints)} className="candidate-hull" />
      )}

      {/* 已提交单元包络 */}
      {units.map((u, idx) => {
        const color = unitColor.get(u.id) ?? groupColor(idx);
        const selected = selection.includes(u.id);
        if (u.kind === "group") {
          return (
            <polygon
              key={u.id}
              points={hullPoints(u.members)}
              className="unit-hull unit-hull-group"
              stroke={color}
              style={{ opacity: selected ? 1 : undefined }}
            />
          );
        }
        const e = envelope(u.members[0]);
        return (
          <circle
            key={u.id}
            cx={sx(e.cx)}
            cy={sy(e.cy)}
            r={e.r}
            className="unit-hull unit-hull-single"
            stroke={color}
            style={{ opacity: selected ? 1 : undefined }}
          />
        );
      })}

      {/* 包络相交红线 */}
      {conflictLinks.map(
        (l) =>
          l && (
            <line
              key={l.id}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              className={l.bothGroup ? "conflict-link conflict-link-block" : "conflict-link"}
            />
          ),
      )}

      {/* 点位（按单元点击） */}
      {units.map((u) => {
        const active = activeUnitIds.has(u.id);
        const selected = selection.includes(u.id);
        return u.members.map((p) => {
          const isMaster = masterMap.get(u.id) === p.id;
          return (
            <g
              key={p.id}
              className={"point" + (active ? " point-active" : "") + (selected ? " point-selected" : "")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleUnit(u.id);
              }}
            >
              {/* 发射角方向 */}
              <line
                x1={sx(p.x)}
                y1={sy(p.y)}
                x2={sx(p.x + 5.5 * Math.cos((p.angle * Math.PI) / 180))}
                y2={sy(p.y + 5.5 * Math.sin((p.angle * Math.PI) / 180))}
                className="point-angle"
              />
              <circle cx={sx(p.x)} cy={sy(p.y)} r={active ? 3.4 : 2.4} className="point-dot" />
              {isMaster ? (
                <text x={sx(p.x)} y={sy(p.y) + 0.9} className="master-mark" textAnchor="middle">
                  ★
                </text>
              ) : null}
              <text x={sx(p.x)} y={sy(p.y) - 4} className="point-code" textAnchor="middle">
                {p.code}
              </text>
              {active && (
                <circle cx={sx(p.x)} cy={sy(p.y)} r={p.safetyRadius * 0.45} className="burst-ring" />
              )}
            </g>
          );
        });
      })}

      {/* 候选点位高亮环 */}
      {candidatePoints.map((p) => (
        <circle key={"cand-" + p.id} cx={sx(p.x)} cy={sy(p.y)} r={4.4} className="candidate-ring" />
      ))}

      {/* 音乐时间点图例（时间信息放右侧图例，避免和场地坐标混淆） */}
      <g className="cue-legend">
        <text x={sx(FIELD_W)} y={sy(FIELD_H) + 8} textAnchor="end">
          {cues.length} 个音乐时间点 · {cues.map((c) => `${c.label}@${fmtTime(c.time)}`).join("　")}
        </text>
      </g>
    </svg>
  );
}
