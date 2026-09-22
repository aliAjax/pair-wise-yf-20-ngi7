// 齐射编组台核心领域模型与判定逻辑

export interface FirePoint {
  id: string;
  name: string; // 点位编号，如 A-01
  segment: string; // 节目段落
  model: string; // 烟花型号
  caliber: number; // 口径 mm
  angle: number; // 发射角度（0–90°）
  timeMs: number; // 点火时间（相对节目起点）
  durationMs: number; // 持续时间
  radius: number; // 安全半径 m
  x: number; // 平面图坐标 m
  y: number;
}

export interface MusicPoint {
  id: string;
  timeMs: number;
  label: string;
}

export interface SalvoGroup {
  id: string;
  name: string;
  memberIds: string[];
  masterId: string; // 组内唯一主控点位
  timeMs: number; // 整组共用的点火时刻（必须等于某个音乐时间点）
}

export interface ShowState {
  points: FirePoint[];
  music: MusicPoint[];
  groups: SalvoGroup[];
}

export interface CheckResult {
  ok: boolean;
  reasons: string[];
}

export type PointPatch = Partial<Omit<FirePoint, "id">>;

/* ---------- 时间工具 ---------- */

export function parseTimeMs(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const mmss = s.match(/^(\d+):(\d{1,2})(?:[.:](\d{1,3}))?$/);
  if (mmss) {
    const min = Number(mmss[1]);
    const sec = Number(mmss[2]);
    if (sec >= 60) return null;
    const ms = mmss[3] ? Number(mmss[3].padEnd(3, "0")) : 0;
    return min * 60_000 + sec * 1000 + ms;
  }
  const secs = s.match(/^(\d+(?:\.\d+)?)$/);
  if (secs) return Math.round(Number(secs[1]) * 1000);
  return null;
}

export function formatMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const min = Math.floor(safe / 60_000);
  const sec = Math.floor((safe % 60_000) / 1000);
  const milli = safe % 1000;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/* ---------- 几何 ---------- */

export interface XY {
  x: number;
  y: number;
}

export const distance = (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 组内点位在邻接阈值下是否连成一片（相邻点位才可并组） */
export function isConnected(pts: FirePoint[], threshold: number): boolean {
  if (pts.length <= 1) return true;
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    pts.forEach((p, j) => {
      if (!seen.has(j) && distance(pts[i], p) <= threshold) {
        seen.add(j);
        stack.push(j);
      }
    });
  }
  return seen.size === pts.length;
}

/** 组安全半径 = 组内最危险型号的半径 */
export const groupRadius = (pts: FirePoint[]): number =>
  pts.reduce((r, p) => Math.max(r, p.radius), 0);

export interface NearestResult {
  d: number;
  from: FirePoint;
  to: FirePoint;
}

/** 两组之间最近点位间距 */
export function nearestBetween(a: FirePoint[], b: FirePoint[]): NearestResult | null {
  if (!a.length || !b.length) return null;
  let best: NearestResult = { d: Infinity, from: a[0], to: b[0] };
  for (const pa of a) {
    for (const pb of b) {
      const d = distance(pa, pb);
      if (d < best.d) best = { d, from: pa, to: pb };
    }
  }
  return best;
}

/** Andrew 凸包，用于绘制组包络 */
export function convexHull(points: XY[]): XY[] {
  if (points.length <= 2) return [...points];
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: XY, a: XY, b: XY) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/* ---------- 整体判定 ---------- */

/**
 * 对整场编排做齐射规则判定：
 * 1. 每组至少 2 个点位，主控点位在组内；
 * 2. 组内点火时刻完全一致，且整组时刻对得上某个音乐时间点；
 * 3. 组内点位在邻接阈值下连通；
 * 4. 任意两组的最近点位间距不得小于安全半径（取两组半径较大者），否则视为包络相交；
 * 5. 角度等基础字段合法。
 */
export function validateShow(state: ShowState, adjacency: number): CheckResult {
  const reasons: string[] = [];
  const { points, music, groups } = state;
  const byId = new Map(points.map((p) => [p.id, p]));
  const musicTimes = new Set(music.map((m) => m.timeMs));

  for (const p of points) {
    if (!(p.angle >= 0 && p.angle <= 90)) reasons.push(`点位 ${p.name} 发射角度越界（允许 0–90°）`);
    if (!(p.radius >= 0) || !(p.durationMs >= 0)) reasons.push(`点位 ${p.name} 安全半径或持续时间非法`);
  }

  for (const g of groups) {
    const members = g.memberIds
      .map((id) => byId.get(id))
      .filter((p): p is FirePoint => Boolean(p));
    if (members.length !== g.memberIds.length) {
      reasons.push(`${g.name} 引用了已删除的点位`);
      continue;
    }
    if (members.length < 2) reasons.push(`${g.name} 至少要包含 2 个相邻点位`);
    if (!g.memberIds.includes(g.masterId)) reasons.push(`${g.name} 缺少主控点位`);
    if (members.some((p) => p.timeMs !== g.timeMs)) {
      reasons.push(`${g.name} 组内点火时刻不一致，必须完全相同`);
    }
    if (!musicTimes.has(g.timeMs)) {
      reasons.push(`${g.name} 点火时刻 ${formatMs(g.timeMs)} 对不上任何音乐时间点`);
    }
    if (!isConnected(members, adjacency)) {
      reasons.push(`${g.name} 点位不相邻（超过邻接阈值 ${adjacency}m，无法构成齐射）`);
    }
  }

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const ga = groups[i];
      const gb = groups[j];
      const ma = ga.memberIds.map((id) => byId.get(id)).filter((p): p is FirePoint => Boolean(p));
      const mb = gb.memberIds.map((id) => byId.get(id)).filter((p): p is FirePoint => Boolean(p));
      const near = nearestBetween(ma, mb);
      if (!near) continue;
      const required = Math.max(groupRadius(ma), groupRadius(mb));
      if (near.d < required) {
        reasons.push(
          `${ga.name} 与 ${gb.name} 包络相交：最近点位 ${near.from.name}↔${near.to.name} 间距 ${near.d.toFixed(1)}m < 安全半径 ${required}m`
        );
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/* ---------- 编组配色 ---------- */

export const GROUP_COLORS = [
  "#1d4ed8",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#be185d",
  "#65a30d",
];

export function colorForGroup(groups: SalvoGroup[], groupId: string | null): string {
  if (!groupId) return "#64748b";
  const idx = groups.findIndex((g) => g.id === groupId);
  return GROUP_COLORS[(idx < 0 ? 0 : idx) % GROUP_COLORS.length];
}
