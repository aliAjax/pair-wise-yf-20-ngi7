import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  type FireworkPoint,
  type MusicCue,
  type RejectReason,
  type Unit,
  type VolleyGroup,
  ADJ_LIMIT_M,
  FIELD_H,
  FIELD_W,
  MUSIC_TOLERANCE_MS,
  buildUnits,
  createSeed,
  fmtTime,
  groupColor,
  isAdjacencyConnected,
  nextGroupName,
  parseTime,
  reconcile,
  scanConflicts,
  uid,
  validateCandidate,
} from "./firework";
import { clearState, loadState, saveState } from "./storage";
import TimeAxis, { timelineEnd } from "./components/TimeAxis";
import PlanMap from "./components/PlanMap";
import MergeBar from "./components/MergeBar";
import { GroupInspector, SingleInspector } from "./components/Inspector";
import Conflicts from "./components/Conflicts";
import Preview from "./components/Preview";
import { AddCueForm, AddPointForm, ModelList } from "./components/Catalog";

const seed = createSeed();

function initState(): { points: FireworkPoint[]; cues: MusicCue[]; groups: VolleyGroup[]; customPoints: FireworkPoint[]; customCues: MusicCue[] } {
  const stored = loadState();
  const customPoints = stored?.customPoints ?? [];
  const customCues = stored?.customCues ?? [];
  const base = [...seed.points, ...customPoints];
  const cues = [...seed.cues, ...customCues];
  const { points, groups } = reconcile(base, cues, stored ? stored.groups : null, seed.groups);
  return { points, cues, groups, customPoints, customCues };
}

function App() {
  const initial = useMemo(initState, []);
  const [points, setPoints] = useState<FireworkPoint[]>(initial.points);
  const [cues, setCues] = useState<MusicCue[]>(initial.cues);
  const [groups, setGroups] = useState<VolleyGroup[]>(initial.groups);
  const [customPoints, setCustomPoints] = useState<FireworkPoint[]>(initial.customPoints);
  const [customCues, setCustomCues] = useState<MusicCue[]>(initial.customCues);

  const [selection, setSelection] = useState<string[]>([]);
  const [mergeRejection, setMergeRejection] = useState<RejectReason[] | null>(null);
  const [playTime, setPlayTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 编组只存浏览器
  useEffect(() => {
    saveState({ version: 1, groups, customPoints, customCues });
  }, [groups, customPoints, customCues]);

  const units = useMemo(() => buildUnits(points, groups), [points, groups]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const conflicts = useMemo(() => scanConflicts(units), [units]);
  const endMs = useMemo(() => timelineEnd(units, cues), [units, cues]);

  const unitColor = useMemo(() => {
    const map = new Map<string, string>();
    let gi = 0;
    for (const u of units) {
      if (u.kind === "group") {
        map.set(u.id, groupColor(gi));
        gi += 1;
      } else {
        map.set(u.id, "#64748b");
      }
    }
    return map;
  }, [units]);

  const masterMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const g of groups) map.set(`unit:${g.id}`, g.masterId);
    return map;
  }, [groups]);

  const selectedUnits = selection.map((id) => unitMap.get(id)).filter((u): u is Unit => Boolean(u));
  const candidatePoints = selectedUnits.flatMap((u) => u.members);

  const activeUnitIds = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      const on = u.members.some((m) => playTime >= u.fireTime && playTime <= u.fireTime + m.duration);
      if (on) set.add(u.id);
    }
    return set;
  }, [units, playTime]);

  // ---------- 选择 ----------
  const toggleUnit = (id: string) => {
    setMergeRejection(null);
    setSelection((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]));
  };

  // ---------- 齐射编组事务：判定不过则整组退回，原编排不动 ----------
  const commitMerge = (cueId: string) => {
    const cue = cues.find((c) => c.id === cueId);
    const selectedSet = new Set(selectedUnits.map((u) => u.id));
    const otherUnits = units.filter((u) => !selectedSet.has(u.id));
    const fireTime = cue?.time ?? selectedUnits[0].fireTime;
    // 组内点火时刻完全一致：候选成员统一对齐到音乐点时刻
    const members = candidatePoints.map((p) => ({ ...p, fireTime }));

    if (!isAdjacencyConnected(members)) {
      setMergeRejection([{ kind: "adjacency" }]);
      return;
    }
    const reasons = validateCandidate(members, fireTime, cue, otherUnits);
    if (reasons.length) {
      setMergeRejection(reasons);
      return;
    }

    const existing = selectedUnits.find((u) => u.kind === "group" && u.groupId);
    const oldGroup = existing ? groups.find((g) => g.id === existing.groupId) : undefined;
    const merged: VolleyGroup = {
      id: oldGroup?.id ?? uid("g"),
      name: oldGroup?.name ?? nextGroupName(groups),
      members: members.map((m) => ({ id: m.id, angle: m.angle })),
      masterId: oldGroup?.masterId ?? members[0].id,
      fireTime,
      musicCueId: cueId,
    };
    setGroups((gs) => {
      const next = oldGroup ? gs.filter((g) => g.id !== oldGroup.id) : gs;
      return [...next, merged];
    });
    // 角度只存在编组快照里，原点位保持不动
    setMergeRejection(null);
    setSelection([`unit:${merged.id}`]);
  };

  // ---------- 组内任一节点调整时刻/角度：整组重新判定，通过才刷新 ----------
  const applyGroupEdit = (
    group: VolleyGroup,
    next: { fireTime: number; cueId: string; masterId: string; angleMap: Record<string, number> },
  ): RejectReason[] | null => {
    const unit = unitMap.get(`unit:${group.id}`);
    if (!unit) return null;
    const otherUnits = units.filter((u) => u.id !== unit.id);
    const members = unit.members.map((m) => ({ ...m, angle: next.angleMap[m.id] ?? m.angle, fireTime: next.fireTime }));
    const cue = cues.find((c) => c.id === next.cueId);
    const reasons = validateCandidate(members, next.fireTime, cue, otherUnits);
    if (reasons.length) return reasons;

    setGroups((gs) =>
      gs.map((g) =>
        g.id === group.id
          ? { ...g, fireTime: next.fireTime, musicCueId: next.cueId, masterId: next.masterId, members: members.map((m) => ({ id: m.id, angle: m.angle })) }
          : g,
      ),
    );
    // 角度只存在编组快照里：判定不过时 setGroups 不执行，点位图自然不刷新
    return null;
  };

  const dissolveGroup = (group: VolleyGroup) => {
    setGroups((gs) => gs.filter((g) => g.id !== group.id));
    setSelection([]);
  };

  // ---------- 单点调整 ----------
  const [singleDraft, setSingleDraft] = useState<{ time: string; angle: string } | null>(null);
  const focusUnit = selectedUnits.length === 1 ? selectedUnits[0] : null;

  useEffect(() => {
    if (focusUnit?.kind === "single") {
      setSingleDraft({ time: fmtTime(focusUnit.fireTime), angle: String(focusUnit.members[0].angle) });
    } else {
      setSingleDraft(null);
    }
    setMergeRejection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnit?.id]);

  const applySingle = () => {
    if (!focusUnit || !singleDraft) return;
    const t = parseTime(singleDraft.time);
    const a = Number(singleDraft.angle);
    if (t === null || !Number.isFinite(a) || a < 0 || a > 360) return;
    const pid = focusUnit.members[0].id;
    setPoints((ps) => ps.map((p) => (p.id === pid ? { ...p, fireTime: t, angle: a } : p)));
    setCustomPoints((cps) => cps.map((p) => (p.id === pid ? { ...p, fireTime: t, angle: a } : p)));
  };

  const deleteCustomPoint = (id: string) => {
    setCustomPoints((cps) => cps.filter((p) => p.id !== id));
    setPoints((ps) => ps.filter((p) => p.id !== id));
    setGroups((gs) =>
      gs
        .map((g) => ({ ...g, members: g.members.filter((m) => m.id !== id) }))
        .filter((g) => g.members.length >= 2 && g.members.some((m) => m.id === g.masterId)),
    );
    setSelection([]);
  };

  // ---------- 新增 ----------
  const addPoint = (p: { section: string; model: string; caliber: number; angle: number; timeText: string; duration: number; safety: number; x: number; y: number }): string | null => {
    const t = parseTime(p.timeText);
    if (t === null) return "点火时间格式应为 mm:ss.mmm";
    if (p.x < 0 || p.x > FIELD_W || p.y < 0 || p.y > FIELD_H) return `坐标需在场地 ${FIELD_W}m × ${FIELD_H}m 内`;
    if (!(p.angle >= 0 && p.angle <= 360) || p.safety <= 0 || p.duration <= 0) return "角度/安全半径/持续时间不合法";
    const np: FireworkPoint = {
      id: uid("p"),
      code: `E${customPoints.length + 1}`,
      section: p.section || "未分段",
      model: p.model,
      caliber: p.caliber,
      angle: p.angle,
      fireTime: t,
      duration: p.duration,
      safetyRadius: p.safety,
      x: p.x,
      y: p.y,
      custom: true,
    };
    setCustomPoints((cps) => [...cps, np]);
    setPoints((ps) => [...ps, np]);
    return null;
  };

  const addCue = (c: { label: string; time: number }): string | null => {
    if (cues.some((x) => x.label === c.label)) return "音乐点标记已存在";
    const nc: MusicCue = { ...c, id: uid("cue"), custom: true };
    setCustomCues((cs) => [...cs, nc]);
    setCues((cs) => [...cs, nc]);
    return null;
  };

  const deleteCue = (id: string) => {
    setCustomCues((cs) => cs.filter((c) => c.id !== id));
    setCues((cs) => cs.filter((c) => c.id !== id));
    // 依赖该音乐点的组整组作废（音乐点对不上）
    setGroups((gs) => gs.filter((g) => g.musicCueId !== id));
  };

  const resetAll = () => {
    clearState();
    const s = createSeed();
    setPoints(s.points);
    setCues(s.cues);
    setGroups(s.groups);
    setCustomPoints([]);
    setCustomCues([]);
    setSelection([]);
    setMergeRejection(null);
    setPlayTime(0);
    setPlaying(false);
  };

  const sectionCount = new Set(units.map((u) => u.members[0]?.section)).size;
  const focusGroup = focusUnit?.kind === "group" ? groups.find((g) => g.id === focusUnit.groupId) : undefined;

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62008 · 齐射编组台 · Port 62008</p>
        <h1>烟花燃放脚本编排 · 齐射编组</h1>
        <span>
          相邻点位（发射点间距 ≤ {ADJ_LIMIT_M}m 且连成一片）可并为一组；组内点火时刻完全一致，整组共用一个音乐时间点。
          组与组之间按最近点位间距与安全半径合计判定包络相交；任一包络相交或音乐点对不上（容差 {MUSIC_TOLERANCE_MS}ms），
          整组退回、原编排保持不动。每组只留一个主控点位；组内任一节点调整时刻或角度，整组重新判定，通过才刷新时间轴与点位图。编组只存在浏览器。
        </span>
      </section>

      <section className="metrics">
        <article><small>节目段落</small><strong>{sectionCount}</strong></article>
        <article><small>点火单元</small><strong>{units.length}</strong></article>
        <article><small>齐射编组</small><strong>{groups.length}</strong></article>
        <article><small>包络相交</small><strong className={conflicts.length ? "metric-warn" : ""}>{conflicts.length}</strong></article>
      </section>

      <section className="panel stage-panel">
        <div className="heading">
          <div>
            <p>时间轴编排</p>
            <h2>点火时刻 / 音乐时间点</h2>
          </div>
          <button className="ghost" onClick={resetAll}>恢复演示编排（清空浏览器编组）</button>
        </div>
        <TimeAxis
          units={units}
          cues={cues}
          endMs={endMs}
          selection={selection}
          activeUnitIds={activeUnitIds}
          playTime={playTime}
          unitColor={unitColor}
          onToggleUnit={toggleUnit}
          onSeek={(ms) => {
            setPlaying(false);
            setPlayTime(ms);
          }}
        />
      </section>

      <section className="stage-grid">
        <div className="panel">
          <div className="heading">
            <div>
              <p>燃放点位平面图</p>
              <h2>整组包络与安全半径</h2>
            </div>
            <span className="legend">
              <i className="lg lg-group" />齐射组包络
              <i className="lg lg-single" />未编组单点
              <i className="lg lg-conflict" />包络相交
            </span>
          </div>
          <PlanMap
            units={units}
            unitColor={unitColor}
            conflicts={conflicts}
            cues={cues}
            candidatePoints={selection.length >= 2 ? candidatePoints : []}
            selection={selection}
            masterMap={masterMap}
            activeUnitIds={activeUnitIds}
            onToggleUnit={toggleUnit}
            onClearSelection={() => setSelection([])}
          />
          <div className="cue-list">
            {cues.map((c) => {
              const isCustom = customCues.some((x) => x.id === c.id);
              return (
                <span key={c.id} className={"cue-chip" + (isCustom ? " cue-chip-custom" : "")}>
                  ♪ {c.label} · {fmtTime(c.time)}
                  {c.custom && <button onClick={() => deleteCue(c.id)} title="删除自定义音乐点">×</button>}
                </span>
              );
            })}
          </div>
        </div>

        <div className="side">
          {selectedUnits.length >= 2 ? (
            <MergeBar
              selectedUnits={selectedUnits}
              cues={cues}
              unitColor={unitColor}
              rejection={mergeRejection}
              onMerge={commitMerge}
              onCancel={() => setSelection([])}
            />
          ) : focusGroup ? (
            <GroupInspector
              key={focusGroup.id}
              unit={focusUnit!}
              group={focusGroup}
              cues={cues}
              color={unitColor.get(focusUnit!.id) ?? "#1d4ed8"}
              onApply={(next) => applyGroupEdit(focusGroup, next)}
              onDissolve={() => dissolveGroup(focusGroup)}
            />
          ) : focusUnit?.kind === "single" && singleDraft ? (
            <SingleInspector
              point={focusUnit.members[0]}
              timeText={singleDraft.time}
              angleText={singleDraft.angle}
              onTime={(v) => setSingleDraft((d) => (d ? { ...d, time: v } : d))}
              onAngle={(v) => setSingleDraft((d) => (d ? { ...d, angle: v } : d))}
              onApply={applySingle}
              onDelete={focusUnit.members[0].custom ? () => deleteCustomPoint(focusUnit.members[0].id) : undefined}
            />
          ) : (
            <div className="inspector inspector-empty">
              <h3>齐射编组操作</h3>
              <ol>
                <li>在时间轴或平面图点选多个<b>相邻</b>点位（可含一个已有齐射组），相邻阈值 {ADJ_LIMIT_M}m；</li>
                <li>为整组选择<b>一个音乐时间点</b>，组内点火时刻将完全对齐；</li>
                <li>整组判定：包络与其它任一组相交、或音乐点对不上 → <b>整组退回</b>，原编排不动；</li>
                <li>点选单个齐射组可指定主控点位、调时刻/角度，改完整组重判，通过才刷新。</li>
              </ol>
              <p className="merge-hint">编组关系仅保存在本浏览器（localStorage），不上传服务器。</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <Conflicts conflicts={conflicts} onSelect={(id) => setSelection([id])} />
      </section>

      <section className="stage-grid lower-grid">
        <section className="panel">
          <Preview
            units={units}
            cues={cues}
            endMs={endMs}
            playTime={playTime}
            playing={playing}
            onTick={setPlayTime}
            onTogglePlay={() => {
              if (playTime >= endMs) setPlayTime(0);
              setPlaying((p) => !p);
            }}
            onStop={() => {
              setPlaying(false);
              setPlayTime(0);
            }}
            onEnded={() => setPlaying(false)}
          />
        </section>
        <section className="panel">
          <ModelList units={units} />
        </section>
      </section>

      <section className="stage-grid lower-grid">
        <section className="panel">
          <AddPointForm onAdd={addPoint} />
        </section>
        <section className="panel">
          <AddCueForm onAdd={addCue} />
        </section>
      </section>
    </main>
  );
}

export default App;
