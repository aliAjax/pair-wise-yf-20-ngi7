import { useEffect, useState } from "react";
import type {
  CheckResult,
  FirePoint,
  MusicPoint,
  SalvoGroup,
} from "../lib/domain";
import { formatMs, parseTimeMs, GROUP_COLORS } from "../lib/domain";

/* ---------------- 判定结果条 ---------------- */

export function CheckBar({ result }: { result: CheckResult }) {
  if (result.ok) {
    return (
      <div className="check-bar ok">
        <b>判定通过</b>
        <span>提交后将刷新时间轴与点位图</span>
      </div>
    );
  }
  return (
    <div className="check-bar bad">
      <b>整组退回：{result.reasons.length} 项不通过</b>
      <ul>
        {result.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- 点位编辑器（新增/调整） ---------------- */

interface EditorValues {
  name: string;
  segment: string;
  model: string;
  caliber: string;
  angle: string;
  timeText: string;
  durationSec: string;
  radius: string;
  x: string;
  y: string;
}

function toValues(p: FirePoint): EditorValues {
  return {
    name: p.name,
    segment: p.segment,
    model: p.model,
    caliber: String(p.caliber),
    angle: String(p.angle),
    timeText: formatMs(p.timeMs),
    durationSec: (p.durationMs / 1000).toString(),
    radius: String(p.radius),
    x: p.x.toFixed(1),
    y: p.y.toFixed(1),
  };
}

interface PointEditorProps {
  mode: "new" | "edit";
  point: FirePoint;
  group: SalvoGroup | null;
  preview: (patch: Partial<FirePoint>) => CheckResult | null;
  onSubmit: (patch: Partial<FirePoint>) => CheckResult;
  onDelete?: () => void;
}

export function PointEditor({ mode, point, group, preview, onSubmit, onDelete }: PointEditorProps) {
  const [v, setV] = useState<EditorValues>(() => toValues(point));
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    setV(toValues(point));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.id, mode]);

  // 新增模式下在平面图上点选落点，仅同步坐标，不清空已填字段
  useEffect(() => {
    if (mode === "new") {
      setV((prev) => ({ ...prev, x: point.x.toFixed(1), y: point.y.toFixed(1) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.x, point.y, mode]);

  function buildPatch(): Partial<FirePoint> | string {
    const timeMs = parseTimeMs(v.timeText);
    if (timeMs === null) return "点火时间格式应为 mm:ss.mmm";
    const caliber = Number(v.caliber);
    const angle = Number(v.angle);
    const durationMs = Math.round(Number(v.durationSec) * 1000);
    const radius = Number(v.radius);
    const x = Number(v.x);
    const y = Number(v.y);
    if ([caliber, angle, durationMs, radius, x, y].some((n) => Number.isNaN(n))) {
      return "数值字段非法";
    }
    return {
      name: v.name.trim() || point.name,
      segment: v.segment.trim() || point.segment,
      model: v.model.trim() || point.model,
      caliber,
      angle,
      timeMs,
      durationMs,
      radius,
      x,
      y,
    };
  }

  const live = (() => {
    const patch = buildPatch();
    return typeof patch === "string" ? null : preview(patch);
  })();

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>专业字段</p>
          <h2>{mode === "new" ? "新增点位" : `调整点位 ${point.name}`}</h2>
        </div>
        {mode === "edit" && onDelete && (
          <button className="danger" onClick={onDelete}>
            删除
          </button>
        )}
      </div>

      {mode === "edit" && group && (
        <p className="group-hint">
          该点位属于齐射组「{group.name}」，调整时刻或角度后将对整组重新判定，不通过则整组退回、编排保持不动。
        </p>
      )}

      <div className="field-grid">
        <label>
          <span>点位编号</span>
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label>
          <span>节目段落</span>
          <input value={v.segment} onChange={(e) => setV({ ...v, segment: e.target.value })} />
        </label>
        <label>
          <span>烟花型号</span>
          <input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
        </label>
        <label>
          <span>口径 (mm)</span>
          <input value={v.caliber} onChange={(e) => setV({ ...v, caliber: e.target.value })} />
        </label>
        <label>
          <span>发射角度 (0–90°)</span>
          <input value={v.angle} onChange={(e) => setV({ ...v, angle: e.target.value })} />
        </label>
        <label>
          <span>点火时间 (mm:ss.mmm)</span>
          <input value={v.timeText} onChange={(e) => setV({ ...v, timeText: e.target.value })} />
        </label>
        <label>
          <span>持续时间 (秒)</span>
          <input value={v.durationSec} onChange={(e) => setV({ ...v, durationSec: e.target.value })} />
        </label>
        <label>
          <span>安全半径 (m)</span>
          <input value={v.radius} onChange={(e) => setV({ ...v, radius: e.target.value })} />
        </label>
        <label>
          <span>平面图 X (m)</span>
          <input value={v.x} onChange={(e) => setV({ ...v, x: e.target.value })} />
        </label>
        <label>
          <span>平面图 Y (m)</span>
          <input value={v.y} onChange={(e) => setV({ ...v, y: e.target.value })} />
        </label>
      </div>

      {live && <CheckBar result={live} />}
      {result && !live && <CheckBar result={result} />}

      <button
        className="primary full"
        onClick={() => {
          const patch = buildPatch();
          if (typeof patch === "string") {
            setResult({ ok: false, reasons: [patch] });
            return;
          }
          const r = onSubmit(patch);
          setResult(r);
        }}
      >
        {mode === "new" ? "添加点位" : group ? "提交并重新判定整组" : "提交调整"}
      </button>
    </section>
  );
}

/* ---------------- 齐射并组面板 ---------------- */

interface MergePanelProps {
  candidate: FirePoint[];
  blockedCount: number;
  music: MusicPoint[];
  adjacency: number;
  preview: (timeMs: number) => CheckResult;
  onMerge: (timeMs: number) => CheckResult;
}

export function MergePanel({
  candidate,
  blockedCount,
  music,
  adjacency,
  preview,
  onMerge,
}: MergePanelProps) {
  const [timeMs, setTimeMs] = useState<number>(music[0]?.timeMs ?? 0);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    if (!music.some((m) => m.timeMs === timeMs)) setTimeMs(music[0]?.timeMs ?? 0);
  }, [music, timeMs]);

  const live = candidate.length >= 2 ? preview(timeMs) : null;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>齐射编组</p>
          <h2>相邻点位并为一组</h2>
        </div>
      </div>
      <p className="group-hint">
        组内点火时刻完全一致、整组共用一个音乐时间点；组间按最近点位间距是否小于安全半径判定包络相交。判定不通过整组退回，原编排不动。
      </p>
      <div className="merge-sel">
        <span>
          已选未编组点位 <b>{candidate.length}</b> 个
          {candidate.length > 0 && `：${candidate.map((p) => p.name).join("、")}`}
        </span>
        {blockedCount > 0 && <span className="warn">（另有 {blockedCount} 个已在编组中，不可重复并入）</span>}
      </div>
      {candidate.length >= 2 && (
        <>
          <label className="stack">
            <span>整组共用音乐时间点（邻接阈值 {adjacency}m）</span>
            <select value={timeMs} onChange={(e) => setTimeMs(Number(e.target.value))}>
              {music.map((m) => (
                <option key={m.id} value={m.timeMs}>
                  {formatMs(m.timeMs)} · {m.label}
                </option>
              ))}
            </select>
          </label>
          {live && <CheckBar result={live} />}
          <button
            className="primary full"
            disabled={!live?.ok}
            onClick={() => setResult(onMerge(timeMs))}
          >
            并入齐射组
          </button>
          {result && <CheckBar result={result} />}
        </>
      )}
      {candidate.length < 2 && (
        <p className="hint">在平面图上按住 Shift / Ctrl（或触屏长按式多选）点选 2 个以上相邻点位。</p>
      )}
    </section>
  );
}

/* ---------------- 编组管理面板 ---------------- */

interface GroupsPanelProps {
  points: FirePoint[];
  groups: SalvoGroup[];
  selectedIds: Set<string>;
  onSelectGroup: (g: SalvoGroup) => void;
  onSetMaster: (groupId: string, pointId: string) => void;
  onDissolve: (groupId: string) => void;
}

export function GroupsPanel({
  points,
  groups,
  selectedIds,
  onSelectGroup,
  onSetMaster,
  onDissolve,
}: GroupsPanelProps) {
  const byId = new Map(points.map((p) => [p.id, p]));
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>齐射编组台</p>
          <h2>编组清单（仅存浏览器）</h2>
        </div>
      </div>
      {groups.length === 0 && <p className="hint">暂无齐射编组。</p>}
      <div className="group-list">
        {groups.map((g, i) => {
          const color = GROUP_COLORS[i % GROUP_COLORS.length];
          const isSel = g.memberIds.some((id) => selectedIds.has(id));
          return (
            <article key={g.id} className={"group-card" + (isSel ? " selected" : "")} style={{ borderColor: color }}>
              <div className="group-card-head">
                <b style={{ color }}>{g.name}</b>
                <span>{g.memberIds.length} 发 · {formatMs(g.timeMs)}</span>
              </div>
              <div className="group-members">
                {g.memberIds.map((id) => {
                  const p = byId.get(id);
                  if (!p) return null;
                  return (
                    <label key={id} className="member-row">
                      <input
                        type="radio"
                        name={"master-" + g.id}
                        checked={g.masterId === id}
                        onChange={() => onSetMaster(g.id, id)}
                      />
                      <span>
                        {p.name}
                        {g.masterId === id ? " ★主控" : ""}
                      </span>
                      <button
                        onClick={() => onSelectGroup(g)}
                        title="在平面图选中整组"
                      >
                        定位
                      </button>
                    </label>
                  );
                })}
              </div>
              <button className="danger full" onClick={() => onDissolve(g.id)}>
                整组拆分（成员回到散点，编排不动）
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- 音乐点面板 ---------------- */

export function MusicPanel({
  music,
  onAdd,
  onRemove,
}: {
  music: MusicPoint[];
  onAdd: (m: MusicPoint) => string | null;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>音乐同步</p>
          <h2>音乐时间点</h2>
        </div>
      </div>
      <div className="music-add">
        <input
          placeholder="mm:ss.mmm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          placeholder="标记名（如 Chorus 进入）"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          onClick={() => {
            const ms = parseTimeMs(text);
            if (ms === null) {
              setError("时间格式应为 mm:ss.mmm");
              return;
            }
            const err = onAdd({
              id: "m" + Date.now(),
              timeMs: ms,
              label: label.trim() || "未命名标记",
            });
            if (err) {
              setError(err);
            } else {
              setError(null);
              setText("");
              setLabel("");
            }
          }}
        >
          添加
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
      <ul className="music-list">
        {music
          .slice()
          .sort((a, b) => a.timeMs - b.timeMs)
          .map((m) => (
            <li key={m.id}>
              <b>♪ {formatMs(m.timeMs)}</b>
              <span>{m.label}</span>
              <button onClick={() => onRemove(m.id)}>×</button>
            </li>
          ))}
      </ul>
    </section>
  );
}

/* ---------------- 型号清单 ---------------- */

export function ModelList({ points }: { points: FirePoint[] }) {
  const map = new Map<string, { caliber: number; count: number }>();
  for (const p of points) {
    const cur = map.get(p.model) ?? { caliber: p.caliber, count: 0 };
    cur.count += 1;
    cur.caliber = Math.max(cur.caliber, p.caliber);
    map.set(p.model, cur);
  }
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>弹药物料</p>
          <h2>型号清单</h2>
        </div>
      </div>
      <div className="model-list">
        {[...map.entries()].map(([model, info]) => (
          <div key={model} className="model-row">
            <b>{model}</b>
            <span>口径 {info.caliber}mm</span>
            <span>{info.count} 处</span>
          </div>
        ))}
      </div>
    </section>
  );
}
