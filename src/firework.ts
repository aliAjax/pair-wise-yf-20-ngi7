// 齐射编组台：领域模型与纯函数判定
// 所有“整组判定 / 包络相交 / 音乐点对齐”规则集中在本文件，界面层只负责调用。

export type ProductType = "礼花弹" | "罗马烛光" | "扇形架" | "冷焰火";

export const PRODUCT_TYPES: ProductType[] = ["礼花弹", "罗马烛光", "扇形架", "冷焰火"];

/** 场地尺寸（米，数学坐标，y 向上；平面图在 SVG 里翻转 y 轴） */
export const FIELD_W = 120;
export const FIELD_H = 60;

/** 相邻点位判定阈值（发射点平面距离，米） */
export const ADJ_LIMIT_M = 26;
/** 组内点火时刻与音乐点允许的最大偏差（毫秒） */
export const MUSIC_TOLERANCE_MS = 80;

// 包络模型：发射点沿发射角方向偏移 0.55r 为危险圆心，危险圆半径 0.45r。
// 角度调整会改变危险圆心，因此整组必须重新判定。
const ENV_OFFSET = 0.55;
const ENV_RADIUS = 0.45;

export interface FireworkPoint {
  id: string;
  /** 点位编号，如 A1 */
  code: string;
  section: string;
  /** 烟花型号，如 “30mm扇形架” */
  model: string;
  /** 口径 mm */
  caliber: number;
  /** 发射角度（度，0=向 +x，逆时针） */
  angle: number;
  /** 点火时间 ms */
  fireTime: number;
  /** 持续时间 ms */
  duration: number;
  /** 安全距离（安全半径）m */
  safetyRadius: number;
  x: number;
  y: number;
  custom?: boolean;
}

export interface MusicCue {
  id: string;
  label: string;
  /** 音乐时间点 ms */
  time: number;
  custom?: boolean;
}

export interface GroupMemberSnap {
  id: string;
  /** 组成立时该节点的发射角度快照，组内改角度随编组一起存在浏览器 */
  angle: number;
}

export interface VolleyGroup {
  id: string;
  /** 编组名 G1、G2…… */
  name: string;
  members: GroupMemberSnap[];
  /** 主控点位 id（members 中唯一的时间控制节点） */
  masterId: string;
  /** 全组唯一点火时刻，成员必须完全一致 */
  fireTime: number;
  /** 整组共用的音乐时间点 */
  musicCueId: string;
}

/** 界面上的判定单元：一个已提交齐射组，或一个未编组单点 */
export interface Unit {
  id: string;
  name: string;
  kind: "group" | "single";
  groupId?: string;
  fireTime: number;
  members: FireworkPoint[];
}

export const groupUnitId = (groupId: string) => `unit:${groupId}`;
export const singleUnitId = (pointId: string) => `single:${pointId}`;

let uidSeq = 0;
export function uid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidSeq}`;
}

// ---------- 时间工具 ----------

export function fmtTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const m = Math.floor(safe / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const milli = safe % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** 接受 mm:ss.mmm / ss.mmm / 纯秒数 */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  const frac = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  if (seconds >= 60) return null;
  return minutes * 60000 + seconds * 1000 + frac;
}

// ---------- 几何 / 包络 ----------

export interface EnvelopeCircle {
  cx: number;
  cy: number;
  r: number;
}

export function envelope(p: FireworkPoint): EnvelopeCircle {
  const rad = (p.angle * Math.PI) / 180;
  const shift = ENV_OFFSET * p.safetyRadius;
  return {
    cx: p.x + shift * Math.cos(rad),
    cy: p.y + shift * Math.sin(rad),
    r: ENV_RADIUS * p.safetyRadius,
  };
}

export function launchGap(a: FireworkPoint, b: FireworkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function areAdjacent(a: FireworkPoint, b: FireworkPoint): boolean {
  return launchGap(a, b) <= ADJ_LIMIT_M;
}

/** 选中点位必须按相邻关系连成一片（允许 A-B-C 链式相邻） */
export function isAdjacencyConnected(points: FireworkPoint[]): boolean {
  if (points.length <= 1) return true;
  const seen = new Set<string>([points[0].id]);
  const queue = [points[0]];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const p of points) {
      if (!seen.has(p.id) && areAdjacent(cur, p)) {
        seen.add(p.id);
        queue.push(p);
      }
    }
  }
  return seen.size === points.length;
}

export interface GapInfo {
  /** 两组之间最近的一对包络圆心距离 */
  gap: number;
  /** 触发相交所需的安全半径合计阈值 */
  required: number;
  aId: string;
  bId: string;
}

/** 组与组之间：按最近点位（危险圆心）间距是否小于安全半径合计判定 */
export function nearestGap(pa: FireworkPoint[], pb: FireworkPoint[]): GapInfo {
  let best: GapInfo = { gap: Infinity, required: Infinity, aId: pa[0]?.id ?? "", bId: pb[0]?.id ?? "" };
  for (const a of pa) {
    const ea = envelope(a);
    for (const b of pb) {
      const eb = envelope(b);
      const gap = Math.hypot(ea.cx - eb.cx, ea.cy - eb.cy);
      const required = ea.r + eb.r;
      if (gap < best.gap) best = { gap, required, aId: a.id, bId: b.id };
    }
  }
  return best;
}

// ---------- 凸包（平面图绘制整组包络） ----------

export interface Pt {
  x: number;
  y: number;
}

function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 1) return points;
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i -= 1) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** 一组点位的整体包络 = 各危险圆并集的凸包（在每个圆上采样） */
export function groupEnvelopeHull(points: FireworkPoint[], samples = 12): Pt[] {
  const seeds: Pt[] = [];
  for (const p of points) {
    const e = envelope(p);
    for (let i = 0; i < samples; i += 1) {
      const a = (i / samples) * Math.PI * 2;
      seeds.push({ x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a) });
    }
  }
  return convexHull(seeds);
}

// ---------- 判定单元与整组判定 ----------

export function buildUnits(points: FireworkPoint[], groups: VolleyGroup[]): Unit[] {
  const map = new Map(points.map((p) => [p.id, p]));
  const used = new Set<string>();
  const units: Unit[] = [];

  for (const g of groups) {
    const members: FireworkPoint[] = [];
    for (const snap of g.members) {
      const p = map.get(snap.id);
      if (p) {
        members.push({ ...p, angle: snap.angle, fireTime: g.fireTime });
        used.add(p.id);
      }
    }
    if (members.length >= 2) {
      units.push({ id: groupUnitId(g.id), groupId: g.id, name: g.name, kind: "group", fireTime: g.fireTime, members });
    }
  }
  for (const p of points) {
    if (!used.has(p.id)) {
      units.push({ id: singleUnitId(p.id), name: p.code, kind: "single", fireTime: p.fireTime, members: [p] });
    }
  }
  return units;
}

export type RejectReason =
  | { kind: "envelope"; withName: string; gap: number; required: number }
  | { kind: "music"; cueLabel: string; delta: number }
  | { kind: "adjacency" }
  | { kind: "time"; detail: string };

export function reasonText(r: RejectReason): string {
  if (r.kind === "envelope") {
    return `与「${r.withName}」包络相交：最近点位间距 ${r.gap.toFixed(1)}m ＜ 安全半径合计 ${r.required.toFixed(1)}m，整组退回`;
  }
  if (r.kind === "music") {
    if (!isFinite(r.delta)) return `音乐点对不上：${r.cueLabel}，整组退回`;
    return `音乐点对不上：与「${r.cueLabel}」偏差 ${r.delta}ms ＞ 容差 ${MUSIC_TOLERANCE_MS}ms，整组退回`;
  }
  if (r.kind === "adjacency") {
    return `所选点位不相邻（相邻阈值 ${ADJ_LIMIT_M}m，需连成一片），不允许并组`;
  }
  return `组内点火时刻不一致：${r.detail}，整组退回`;
}

/**
 * 整组判定：任一条不过即全部不过，由调用方保证“原编排保持不动”。
 * 1) 组内点火时刻完全一致；2) 与音乐点对齐；3) 与场外其它任一单元包络不相交。
 */
export function validateCandidate(
  members: FireworkPoint[],
  fireTime: number,
  cue: MusicCue | undefined,
  otherUnits: Unit[],
): RejectReason[] {
  const reasons: RejectReason[] = [];

  const bad = members.filter((m) => m.fireTime !== fireTime);
  if (bad.length) {
    reasons.push({ kind: "time", detail: bad.map((m) => m.code).join("、") + " 时刻不同" });
  }
  if (!cue) {
    reasons.push({ kind: "music", cueLabel: "未选择音乐时间点", delta: Infinity });
  } else {
    const delta = Math.abs(fireTime - cue.time);
    if (delta > MUSIC_TOLERANCE_MS) {
      reasons.push({ kind: "music", cueLabel: cue.label, delta });
    }
  }
  for (const other of otherUnits) {
    const info = nearestGap(members, other.members);
    if (info.gap < info.required) {
      reasons.push({ kind: "envelope", withName: other.name, gap: info.gap, required: info.required });
    }
  }
  return reasons;
}

export interface ConflictRow {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  bothGroup: boolean;
  gap: number;
  required: number;
  aMemberId: string;
  bMemberId: string;
}

/** 当前已提交编排的冲突扫描（用于冲突提示面板与平面图红线） */
export function scanConflicts(units: Unit[]): ConflictRow[] {
  const rows: ConflictRow[] = [];
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const info = nearestGap(units[i].members, units[j].members);
      if (info.gap < info.required) {
        rows.push({
          aId: units[i].id,
          bId: units[j].id,
          aName: units[i].name,
          bName: units[j].name,
          bothGroup: units[i].kind === "group" && units[j].kind === "group",
          gap: info.gap,
          required: info.required,
          aMemberId: info.aId,
          bMemberId: info.bId,
        });
      }
    }
  }
  return rows;
}

// ---------- 型号归类 ----------

export function productType(model: string): ProductType {
  for (const t of PRODUCT_TYPES) {
    if (model.includes(t)) return t;
  }
  return "冷焰火";
}

// ---------- 编组命名 ----------

export function nextGroupName(groups: VolleyGroup[]): string {
  let max = 0;
  for (const g of groups) {
    const m = g.name.match(/^G(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `G${max + 1}`;
}

export const GROUP_COLORS = ["#1d4ed8", "#7c3aed", "#0d9488", "#dc2626", "#c026d3", "#ea580c"];
export const SINGLE_COLOR = "#64748b";
export function groupColor(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

// ---------- 初始演示数据 ----------

export function createSeed(): { points: FireworkPoint[]; cues: MusicCue[]; groups: VolleyGroup[] } {
  const points: FireworkPoint[] = [
    { id: "p-a1", code: "A1", section: "Intro", model: "30mm扇形架", caliber: 30, angle: 90, fireTime: 12500, duration: 2200, safetyRadius: 35, x: 12, y: 42 },
    { id: "p-a2", code: "A2", section: "Intro", model: "30mm扇形架", caliber: 30, angle: 90, fireTime: 12500, duration: 2200, safetyRadius: 35, x: 28, y: 40 },
    { id: "p-a3", code: "A3", section: "Intro", model: "30mm扇形架", caliber: 30, angle: 90, fireTime: 12500, duration: 2200, safetyRadius: 35, x: 44, y: 42 },
    { id: "p-b1", code: "B1", section: "Chorus A", model: "75mm礼花弹", caliber: 75, angle: 200, fireTime: 68200, duration: 4200, safetyRadius: 60, x: 20, y: 16 },
    { id: "p-b2", code: "B2", section: "Chorus A", model: "75mm礼花弹", caliber: 75, angle: 340, fireTime: 68200, duration: 4200, safetyRadius: 60, x: 38, y: 12 },
    { id: "p-c1", code: "C1", section: "Bridge", model: "冷焰火", caliber: 0, angle: 60, fireTime: 125400, duration: 6000, safetyRadius: 35, x: 96, y: 18 },
    { id: "p-d1", code: "D1", section: "Finale", model: "25mm罗马烛光", caliber: 25, angle: 30, fireTime: 222000, duration: 1500, safetyRadius: 12, x: 102, y: 40 },
    { id: "p-d2", code: "D2", section: "Finale", model: "25mm罗马烛光", caliber: 25, angle: 30, fireTime: 222000, duration: 1500, safetyRadius: 12, x: 122, y: 36 },
  ];
  const cues: MusicCue[] = [
    { id: "cue-1", label: "M1 开场起拍", time: 12500 },
    { id: "cue-2", label: "M2 副歌重音", time: 68200 },
    { id: "cue-3", label: "M3 桥段冷焰", time: 125400 },
    { id: "cue-4", label: "M4 终场齐鸣", time: 222000 },
  ];
  const snap = (list: FireworkPoint[]): GroupMemberSnap[] => list.map((p) => ({ id: p.id, angle: p.angle }));
  const groups: VolleyGroup[] = [
    { id: "g-seed-1", name: "G1", members: snap(points.slice(0, 3)), masterId: "p-a1", fireTime: 12500, musicCueId: "cue-1" },
    { id: "g-seed-2", name: "G2", members: snap(points.slice(3, 5)), masterId: "p-b1", fireTime: 68200, musicCueId: "cue-2" },
  ];
  return { points, cues, groups };
}

/**
 * 读取浏览器里的编组后与当前点位/音乐点对账：缺成员、缺音乐点的组整组作废。
 * 组内角度只随编组存活（buildUnits 时生效）；解散/作废即回到原点位角度。
 */
export function reconcile(
  basePoints: FireworkPoint[],
  cues: MusicCue[],
  storedGroups: VolleyGroup[] | null,
  seedGroups: VolleyGroup[],
): { points: FireworkPoint[]; groups: VolleyGroup[] } {
  const groups = storedGroups ?? seedGroups;
  const pointIds = new Set(basePoints.map((p) => p.id));
  const cueIds = new Set(cues.map((c) => c.id));
  const kept: VolleyGroup[] = [];
  const usedNames = new Set<string>();

  for (const g of groups) {
    const members = g.members.filter((m) => pointIds.has(m.id));
    const validMaster = members.some((m) => m.id === g.masterId) ? g.masterId : members[0]?.id;
    if (members.length < 2 || !validMaster || !cueIds.has(g.musicCueId)) continue;
    let name = g.name;
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(`${g.name}-${n}`)) n += 1;
      name = `${g.name}-${n}`;
    }
    usedNames.add(name);
    kept.push({ ...g, name, members, masterId: validMaster });
  }

  return { points: basePoints, groups: kept };
}
