import type { FirePoint, MusicPoint, ShowState } from "./domain";

// 初次进入时的演示编排（不含任何编组，编组只存浏览器本地）
export function seedState(): ShowState {
  const music: MusicPoint[] = [
    { id: "m1", timeMs: 12_500, label: "Intro 第一拍" },
    { id: "m2", timeMs: 68_200, label: "Chorus A 进入" },
    { id: "m3", timeMs: 94_000, label: "Chorus B 进入" },
    { id: "m4", timeMs: 222_000, label: "Finale" },
  ];

  const points: FirePoint[] = [
    // Intro 三连位（相邻，可并为齐射组）
    { id: "p1", name: "A-01", segment: "Intro", model: "30mm扇形架", caliber: 30, angle: 78, timeMs: 12_500, durationMs: 9_000, radius: 35, x: 26, y: 24 },
    { id: "p2", name: "A-02", segment: "Intro", model: "30mm扇形架", caliber: 30, angle: 80, timeMs: 12_500, durationMs: 9_000, radius: 35, x: 44, y: 18 },
    { id: "p3", name: "A-03", segment: "Intro", model: "25mm罗马烛光", caliber: 25, angle: 82, timeMs: 12_500, durationMs: 7_000, radius: 25, x: 62, y: 25 },
    // Chorus A 双连位
    { id: "p4", name: "B-01", segment: "Chorus A", model: "75mm礼花弹", caliber: 75, angle: 88, timeMs: 68_200, durationMs: 6_000, radius: 60, x: 22, y: 58 },
    { id: "p5", name: "B-02", segment: "Chorus A", model: "75mm礼花弹", caliber: 75, angle: 86, timeMs: 68_200, durationMs: 6_000, radius: 60, x: 46, y: 62 },
    { id: "p6", name: "C-01", segment: "Verse", model: "20mm冷焰火", caliber: 20, angle: 45, timeMs: 80_000, durationMs: 12_000, radius: 15, x: 102, y: 16 },
    // Chorus B 双连位
    { id: "p7", name: "D-01", segment: "Chorus B", model: "50mm罗马烛光", caliber: 50, angle: 75, timeMs: 94_000, durationMs: 10_000, radius: 45, x: 84, y: 52 },
    { id: "p8", name: "D-02", segment: "Chorus B", model: "50mm罗马烛光", caliber: 50, angle: 74, timeMs: 94_000, durationMs: 10_000, radius: 45, x: 104, y: 58 },
    // Finale
    { id: "p9", name: "E-01", segment: "Finale", model: "冷焰火", caliber: 20, angle: 60, timeMs: 222_000, durationMs: 20_000, radius: 25, x: 60, y: 70 },
  ];

  return { points, music, groups: [] };
}

const STORAGE_KEY = "hxyfront-62008-salvo-v1";

export function loadState(): ShowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ShowState;
      if (Array.isArray(parsed.points) && Array.isArray(parsed.music) && Array.isArray(parsed.groups)) {
        return parsed;
      }
    }
  } catch {
    // 损坏数据直接回落到种子编排
  }
  return seedState();
}

export function saveState(state: ShowState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默，编组仍只保留在浏览器会话内
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
