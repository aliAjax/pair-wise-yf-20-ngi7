import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import PlanMap from "./components/PlanMap";
import Timeline from "./components/Timeline";
import { CheckBar, MergePanel, ModelList, MusicPanel, GroupsPanel, PointEditor } from "./components/Panels";
import type {
  CheckResult,
  FirePoint,
  MusicPoint,
  PointPatch,
  SalvoGroup,
  ShowState,
} from "./lib/domain";
import { validateShow } from "./lib/domain";
import { clearState, loadState, saveState, seedState } from "./lib/storage";

const DEFAULT_ADJACENCY = 30;

interface LogEntry {
  id: number;
  ok: boolean;
  text: string;
}

function App() {
  const [show, setShow] = useState<ShowState>(() => loadState());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [pendingCoord, setPendingCoord] = useState<{ x: number; y: number } | null>(null);
  const [adjacency, setAdjacency] = useState(DEFAULT_ADJACENCY);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [playMs, setPlayMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const logSeq = useRef(0);

  // 当前已提交编排的整体判定（正常通过；删除音乐点等操作被拒时也据此判断）
  const check = useMemo(() => validateShow(show, adjacency), [show, adjacency]);

  const byId = useMemo(() => new Map(show.points.map((p) => [p.id, p])), [show.points]);
  const groupOfPoint = useMemo(() => {
    const m = new Map<string, SalvoGroup>();
    show.groups.forEach((g) => g.memberIds.forEach((id) => m.set(id, g)));
    return m;
  }, [show.groups]);

  const endMs = useMemo(
    () => Math.max(...show.points.map((p) => p.timeMs + p.durationMs), 10_000),
    [show.points]
  );

  /* ---------- 持久化（编组只存浏览器） ---------- */
  useEffect(() => {
    saveState(show);
  }, [show]);

  /* ---------- 整场预览播放 ---------- */
  useEffect(() => {
    if (!playing) return;
    lastTsRef.current = performance.now();
    const step = (ts: number) => {
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setPlayMs((t) => {
        const next = t + delta;
        if (next >= endMs) {
          setPlaying(false);
          return endMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, endMs]);

  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of show.points) {
      if (playMs >= p.timeMs && playMs < p.timeMs + p.durationMs) ids.add(p.id);
    }
    // 组内任一点位处于燃放窗口，即高亮整组
    for (const g of show.groups) {
      if (ids.size && g.memberIds.some((id) => ids.has(id))) {
        g.memberIds.forEach((id) => ids.add(id));
      }
    }
    return ids;
  }, [playMs, show.points, show.groups]);

  function pushLog(ok: boolean, text: string) {
    logSeq.current += 1;
    setLogs((l) => [{ id: logSeq.current, ok, text }, ...l].slice(0, 30));
  }

  /* ---------- 构造候选状态 ---------- */

  function withPointPatch(state: ShowState, targetId: string, patch: PointPatch): ShowState {
    const points = state.points.map((p) => (p.id === targetId ? { ...p, ...patch } : p));
    const g = state.groups.find((grp) => grp.memberIds.includes(targetId));
    let groups = state.groups;
    if (g && patch.timeMs !== undefined) {
      // 组内任一节点改时刻：整组时刻同步，整组共用一个音乐点
      points.forEach((p) => {
        if (g.memberIds.includes(p.id)) p.timeMs = patch.timeMs!;
      });
      groups = groups.map((grp) =>
        grp.id === g.id ? { ...grp, timeMs: patch.timeMs! } : grp
      );
    }
    return { ...state, points, groups };
  }

  function candidateMerge(state: ShowState, members: FirePoint[], timeMs: number): ShowState {
    const id = "g" + Date.now();
    const name = `齐射 ${String(state.groups.length + 1).padStart(2, "0")}`;
    const group: SalvoGroup = {
      id,
      name,
      memberIds: members.map((m) => m.id),
      masterId: members[0].id, // 每组只留一个主控点位
      timeMs,
    };
    const points = state.points.map((p) =>
      members.some((m) => m.id === p.id) ? { ...p, timeMs } : p
    );
    return { ...state, points, groups: [...state.groups, group] };
  }

  /* ---------- 提交入口（判定通过才刷新时间轴与点位图） ---------- */

  const selectedPoints = show.points.filter((p) => selected.has(p.id));
  const mergeCandidate = selectedPoints.filter((p) => !groupOfPoint.has(p.id));
  const blockedCount = selectedPoints.length - mergeCandidate.length;

  function previewMerge(timeMs: number): CheckResult {
    return validateShow(candidateMerge(show, mergeCandidate, timeMs), adjacency);
  }

  function doMerge(timeMs: number): CheckResult {
    const next = candidateMerge(show, mergeCandidate, timeMs);
    const r = validateShow(next, adjacency);
    if (!r.ok) {
      pushLog(false, `齐射并组退回，原编排保持不动：${r.reasons.join("；")}`);
      return r;
    }
    setShow(next);
    setSelected(new Set());
    pushLog(true, `${next.groups[next.groups.length - 1].name} 已建立，时间轴与点位图已刷新`);
    return { ok: true, reasons: [] };
  }

  function previewPointEdit(id: string, patch: PointPatch): CheckResult {
    return validateShow(withPointPatch(show, id, patch), adjacency);
  }

  function submitPointEdit(id: string, patch: PointPatch): CheckResult {
    const next = withPointPatch(show, id, patch);
    const r = validateShow(next, adjacency);
    if (!r.ok) {
      pushLog(false, `点位调整被退回，原编排保持不动：${r.reasons.join("；")}`);
      return r;
    }
    setShow(next);
    pushLog(true, `点位 ${byId.get(id)?.name} 调整已提交`);
    return { ok: true, reasons: [] };
  }

  function submitNewPoint(patch: PointPatch): CheckResult {
    const coord = pendingCoord ?? { x: 60, y: 40 };
    const np: FirePoint = {
      id: "p" + Date.now(),
      name: patch.name ?? `新点位 ${show.points.length + 1}`,
      segment: patch.segment ?? "未分配段落",
      model: patch.model ?? "未填型号",
      caliber: patch.caliber ?? 0,
      angle: patch.angle ?? 80,
      timeMs: patch.timeMs ?? 0,
      durationMs: patch.durationMs ?? 5000,
      radius: patch.radius ?? 30,
      x: patch.x ?? coord.x,
      y: patch.y ?? coord.y,
    };
    const next: ShowState = { ...show, points: [...show.points, np] };
    const r = validateShow(next, adjacency);
    if (!r.ok) {
      pushLog(false, `新增点位被退回：${r.reasons.join("；")}`);
      return r;
    }
    setShow(next);
    setAdding(false);
    setPendingCoord(null);
    setSelected(new Set([np.id]));
    pushLog(true, `点位 ${np.name} 已添加`);
    return { ok: true, reasons: [] };
  }

  const newPointTemplate: FirePoint = {
    id: "__new__",
    name: `新点位 ${show.points.length + 1}`,
    segment: "",
    model: "",
    caliber: 30,
    angle: 80,
    timeMs: show.music[0]?.timeMs ?? 0,
    durationMs: 5000,
    radius: 30,
    x: pendingCoord?.x ?? 60,
    y: pendingCoord?.y ?? 40,
  };

  function deletePoint(id: string) {
    if (groupOfPoint.has(id)) {
      pushLog(false, `点位 ${byId.get(id)?.name} 仍在编组中，请先整组拆分`);
      return;
    }
    const next = { ...show, points: show.points.filter((p) => p.id !== id) };
    setShow(next);
    setSelected(new Set());
    pushLog(true, `点位 ${byId.get(id)?.name} 已删除`);
  }

  function setMaster(groupId: string, pointId: string) {
    setShow({
      ...show,
      groups: show.groups.map((g) => (g.id === groupId ? { ...g, masterId: pointId } : g)),
    });
  }

  function dissolveGroup(groupId: string) {
    const g = show.groups.find((x) => x.id === groupId);
    if (!g) return;
    setShow({ ...show, groups: show.groups.filter((x) => x.id !== groupId) });
    setSelected(new Set());
    pushLog(true, `${g.name} 已拆分，成员回到散点，时间与点位保持原值`);
  }

  function addMusic(m: MusicPoint): string | null {
    if (show.music.some((x) => x.timeMs === m.timeMs)) {
      return "该时刻已有音乐时间点";
    }
    setShow({ ...show, music: [...show.music, m] });
    return null;
  }

  function removeMusic(id: string) {
    const next = { ...show, music: show.music.filter((m) => m.id !== id) };
    const r = validateShow(next, adjacency);
    if (!r.ok) {
      pushLog(false, `删除音乐点被退回，原编排保持不动：${r.reasons.join("；")}`);
      return;
    }
    setShow(next);
  }

  function selectPoint(id: string, additive: boolean) {
    if (adding) return;
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const singleSelected =
    selected.size === 1 ? byId.get([...selected][0]) ?? null : null;

  const segments = useMemo(() => new Set(show.points.map((p) => p.segment)).size, [show.points]);

  return (
    <main className="app">
      <section className="hero compact">
        <p>hxyfront-62008 · 源提示词10 · 齐射编组台 · Port 62008</p>
        <h1>烟花燃放脚本 · 齐射编组台</h1>
        <span>
          相邻点位可并为一组，组内点火时刻完全一致、整组共用一个音乐时间点；组与组之间按最近点位间距是否小于安全半径判定包络相交。
          任一组包络相交或与音乐点对不上即整组退回，原编排保持不动；每组只留一个主控点位，编组数据仅保存在浏览器本地。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>节目段落</small>
          <strong>{segments}</strong>
        </article>
        <article>
          <small>点火节点</small>
          <strong>{show.points.length}</strong>
        </article>
        <article>
          <small>齐射编组</small>
          <strong>{show.groups.length}</strong>
        </article>
        <article>
          <small>冲突提示</small>
          <strong className={check.ok ? "ok-num" : "bad-num"}>{check.reasons.length}</strong>
        </article>
      </section>

      <section className="board">
        <div className="board-left">
          {adding ? (
            <PointEditor
              key="new"
              mode="new"
              point={newPointTemplate}
              group={null}
              preview={(patch) => {
                // 新增散点的字段预检
                const np = { ...newPointTemplate, ...patch } as FirePoint;
                return validateShow({ ...show, points: [...show.points, np] }, adjacency);
              }}
              onSubmit={submitNewPoint}
            />
          ) : singleSelected ? (
            <PointEditor
              key={singleSelected.id}
              mode="edit"
              point={singleSelected}
              group={groupOfPoint.get(singleSelected.id) ?? null}
              preview={(patch) => previewPointEdit(singleSelected.id, patch)}
              onSubmit={(patch) => submitPointEdit(singleSelected.id, patch)}
              onDelete={() => deletePoint(singleSelected.id)}
            />
          ) : (
            <MergePanel
              candidate={mergeCandidate}
              blockedCount={blockedCount}
              music={show.music}
              adjacency={adjacency}
              preview={previewMerge}
              onMerge={doMerge}
            />
          )}

          {adding && (
            <section className="panel">
              <p className="hint">
                在平面图上点击落点（已预选 {pendingCoord ? `${pendingCoord.x}m, ${pendingCoord.y}m` : "—"}），
                或直接填写坐标。
              </p>
              <button
                onClick={() => {
                  setAdding(false);
                  setPendingCoord(null);
                }}
              >
                取消新增
              </button>
            </section>
          )}

          <GroupsPanel
            points={show.points}
            groups={show.groups}
            selectedIds={selected}
            onSelectGroup={(g) => setSelected(new Set(g.memberIds))}
            onSetMaster={setMaster}
            onDissolve={dissolveGroup}
          />
          <MusicPanel music={show.music} onAdd={addMusic} onRemove={removeMusic} />
          <ModelList points={show.points} />
        </div>

        <div className="board-right">
          <section className="panel">
            <div className="heading">
              <div>
                <p>燃放点位平面图</p>
                <h2>点位 · 安全半径 · 组包络</h2>
              </div>
              <div className="map-tools">
                <label className="inline">
                  邻接阈值(m)
                  <input
                    type="number"
                    value={adjacency}
                    onChange={(e) => setAdjacency(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
                <button
                  className={adding ? "primary" : ""}
                  onClick={() => {
                    setAdding(true);
                    setPendingCoord(null);
                    setSelected(new Set());
                  }}
                >
                  新增点位
                </button>
                <button
                  onClick={() => {
                    if (confirm("清空浏览器内的全部编排与编组并恢复演示数据？")) {
                      clearState();
                      setShow(seedState());
                      setSelected(new Set());
                      setLogs([]);
                    }
                  }}
                >
                  重置演示
                </button>
              </div>
            </div>
            <PlanMap
              points={show.points}
              music={show.music}
              groups={show.groups}
              selectedIds={selected}
              activeIds={activeIds}
              adding={adding}
              adjacency={adjacency}
              onSelect={selectPoint}
              onAddPoint={(x, y) => {
                setPendingCoord({ x, y });
              }}
            />
            <div className="map-tip">
              点选单个点位进行调整；Shift / Ctrl + 点击多选，选中的相邻未编组点位可并为齐射组。
            </div>
          </section>

          <section className="panel">
            <div className="heading">
              <div>
                <p>时间轴编排</p>
                <h2>音乐点 · 主控点火（每组仅主控点位一条）</h2>
              </div>
              <div className="transport">
                <button className="primary" onClick={() => {
                  if (playMs >= endMs) setPlayMs(0);
                  setPlaying(!playing);
                }}>
                  {playing ? "暂停" : "整场预览"}
                </button>
                <button onClick={() => { setPlaying(false); setPlayMs(0); }}>复位</button>
              </div>
            </div>
            <Timeline
              points={show.points}
              music={show.music}
              groups={show.groups}
              activeIds={activeIds}
              playMs={playMs}
              onSeek={(ms) => setPlayMs(ms)}
            />
          </section>

          <section className="panel">
            <div className="heading">
              <div>
                <p>冲突时间提示</p>
                <h2>判定状态与整组退回记录</h2>
              </div>
            </div>
            <CheckBar result={check} />
            <ul className="log-list">
              {logs.length === 0 && <li className="hint">暂无操作记录。所有编组与调整通过判定后才会刷新。</li>}
              {logs.map((l) => (
                <li key={l.id} className={l.ok ? "log-ok" : "log-bad"}>
                  <b>{l.ok ? "已提交" : "已退回"}</b>
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
