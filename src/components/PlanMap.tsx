import { useRef } from "react";
import type { MusicPoint, SalvoGroup, FirePoint } from "../lib/domain";
import { convexHull, distance, formatMs, GROUP_COLORS } from "../lib/domain";

interface PlanMapProps {
  points: FirePoint[];
  music: MusicPoint[];
  groups: SalvoGroup[];
  selectedIds: Set<string>;
  activeIds: Set<string>;
  adding: boolean;
  adjacency: number;
  onSelect: (id: string, additive: boolean) => void;
  onAddPoint: (x: number, y: number) => void;
}

const FIELD_W = 120;
const FIELD_H = 80;

export default function PlanMap({
  points,
  music,
  groups,
  selectedIds,
  activeIds,
  adding,
  adjacency,
  onSelect,
  onAddPoint,
}: PlanMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const groupOfPoint = new Map<string, SalvoGroup>();
  groups.forEach((g) => g.memberIds.forEach((id) => groupOfPoint.set(id, g)));
  const byId = new Map(points.map((p) => [p.id, p]));

  const groupColor = (g: SalvoGroup) =>
    GROUP_COLORS[groups.findIndex((x) => x.id === g.id) % GROUP_COLORS.length];

  function toMeters(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * FIELD_W,
      y: ((clientY - rect.top) / rect.height) * FIELD_H,
    };
  }

  const selectedUngrouped = points.filter(
    (p) => selectedIds.has(p.id) && !groupOfPoint.has(p.id)
  );
  const adjLinks: { a: FirePoint; b: FirePoint; d: number }[] = [];
  for (let i = 0; i < selectedUngrouped.length; i++) {
    for (let j = i + 1; j < selectedUngrouped.length; j++) {
      const d = distance(selectedUngrouped[i], selectedUngrouped[j]);
      if (d <= adjacency) adjLinks.push({ a: selectedUngrouped[i], b: selectedUngrouped[j], d });
    }
  }

  return (
    <div className={"map-wrap" + (adding ? " is-adding" : "")}>
      <svg
        ref={svgRef}
        className="plan-map"
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={(e) => {
          if (!adding) return;
          const { x, y } = toMeters(e.clientX, e.clientY);
          onAddPoint(
            Math.max(2, Math.min(FIELD_W - 2, Number(x.toFixed(1)))),
            Math.max(2, Math.min(FIELD_H - 2, Number(y.toFixed(1))))
          );
        }}
      >
        {/* 场地网格 */}
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} className="field" />
        {Array.from({ length: FIELD_W / 10 }, (_, i) => (
          <line key={"vx" + i} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2={FIELD_H} className="grid" />
        ))}
        {Array.from({ length: FIELD_H / 10 }, (_, i) => (
          <line key={"hy" + i} x1="0" y1={(i + 1) * 10} x2={FIELD_W} y2={(i + 1) * 10} className="grid" />
        ))}

        {/* 组包络：凸包 + 安全半径缓冲 */}
        {groups.map((g) => {
          const members = g.memberIds
            .map((id) => byId.get(id))
            .filter((p): p is FirePoint => Boolean(p));
          if (!members.length) return null;
          const color = groupColor(g);
          const r = members.reduce((m, p) => Math.max(m, p.radius), 0) / 10; // 半径按 m/10 缩放显示
          const hull = convexHull(members);
          const poly = hull.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={"env" + g.id}>
              {hull.length > 2 && (
                <polygon points={poly} fill={color} fillOpacity="0.07" stroke="none" />
              )}
              <polygon
                points={poly}
                fill="none"
                stroke={color}
                strokeWidth="0.45"
                strokeDasharray="1.6 1.2"
              />
              {members.map((p) => (
                <circle
                  key={"buf" + p.id}
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeOpacity="0.35"
                  strokeWidth="0.25"
                />
              ))}
            </g>
          );
        })}

        {/* 未编组点位的安全圈 */}
        {points
          .filter((p) => !groupOfPoint.has(p.id))
          .map((p) => (
            <circle
              key={"safe" + p.id}
              cx={p.x}
              cy={p.y}
              r={p.radius / 10}
              className="safety-circle"
            />
          ))}

        {/* 选中点位间的邻接预览 */}
        {adjLinks.map(({ a, b, d }) => (
          <g key={`${a.id}-${b.id}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="adj-link" />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 0.8} className="adj-label">
              {d.toFixed(1)}m
            </text>
          </g>
        ))}

        {/* 点位 */}
        {points.map((p) => {
          const g = groupOfPoint.get(p.id);
          const color = g ? groupColor(g) : "#475569";
          const selected = selectedIds.has(p.id);
          const active = activeIds.has(p.id);
          const rad = (p.angle * Math.PI) / 180;
          const dx = Math.sin(rad) * 5.2;
          const dy = -Math.cos(rad) * 5.2;
          const isMaster = g?.masterId === p.id;
          return (
            <g
              key={p.id}
              className="map-point"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(p.id, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
            >
              {active && <circle cx={p.x} cy={p.y} r="3.4" className="active-ring" />}
              <line x1={p.x} y1={p.y} x2={p.x + dx} y2={p.y + dy} stroke={color} strokeWidth="0.5" />
              <path
                d={`M ${p.x + dx} ${p.y + dy} l ${-dy * 0.28 - dx * 0.12} ${dx * 0.28 - dy * 0.12} l ${dy * 0.28 - dx * 0.12} ${-dx * 0.28 - dy * 0.12} z`}
                fill={color}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="1.9"
                fill={g ? color : "#ffffff"}
                stroke={color}
                strokeWidth="0.6"
                className={selected ? "point-selected" : ""}
              />
              {isMaster && (
                <text x={p.x} y={p.y + 0.9} textAnchor="middle" className="master-star">
                  ★
                </text>
              )}
              <text x={p.x} y={p.y - 3.0} textAnchor="middle" className="point-label">
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <span>单位：m · 发射角箭头（0° 为正上方）</span>
        <span>★ 主控点位</span>
        <span>
          音乐点：
          {music.map((m) => formatMs(m.timeMs)).join(" / ")}
        </span>
      </div>
    </div>
  );
}
