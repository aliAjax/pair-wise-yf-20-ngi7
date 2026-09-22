import type { MusicCue, VolleyGroup } from "./firework";

// 编组只存浏览器：仅持久化编组关系（含组内角度快照、主控点、音乐点、点火时刻）。
// 点位与音乐点中的自定义项也保存在本 key 下；清除即回到演示编排。

const STORAGE_KEY = "hxyfront-62008-groups-v1";

export interface StoredState {
  version: 1;
  groups: VolleyGroup[];
  customPoints: import("./firework").FireworkPoint[];
  customCues: MusicCue[];
}

export function loadState(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredState;
    if (data.version !== 1 || !Array.isArray(data.groups)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveState(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默：编组本来就只存在浏览器里
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
