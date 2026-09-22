import { useState } from "react";
import type { MusicCue, RejectReason, Unit, VolleyGroup } from "../firework";
import { fmtTime, parseTime, reasonText } from "../firework";

interface GroupInspectorProps {
  unit: Unit;
  group: VolleyGroup;
  cues: MusicCue[];
  color: string;
  onApply: (next: { fireTime: number; cueId: string; masterId: string; angleMap: Record<string, number> }) => RejectReason[] | null;
  onDissolve: () => void;
}

export function GroupInspector({ unit, group, cues, color, onApply, onDissolve }: GroupInspectorProps) {
  const [timeText, setTimeText] = useState(fmtTime(group.fireTime));
  const [cueId, setCueId] = useState(group.musicCueId);
  const [masterId, setMasterId] = useState(group.masterId);
  const [angles, setAngles] = useState<Record<string, string>>(() =>
    Object.fromEntries(unit.members.map((m) => [m.id, String(m.angle)])),
  );
  const [rejection, setRejection] = useState<RejectReason[] | null>(null);
  const [confirmDissolve, setConfirmDissolve] = useState(false);

  const submit = () => {
    const fireTime = parseTime(timeText);
    if (fireTime === null) {
      setRejection([{ kind: "time", detail: "点火时刻格式应为 mm:ss.mmm" }]);
      return;
    }
    const angleMap: Record<string, number> = {};
    for (const m of unit.members) {
      const a = Number(angles[m.id]);
      if (!Number.isFinite(a) || a < 0 || a > 360) {
        setRejection([{ kind: "time", detail: `${m.code} 角度需在 0–360°` }]);
        return;
      }
      angleMap[m.id] = a;
    }
    const reasons = onApply({ fireTime, cueId, masterId, angleMap });
    if (reasons) {
      setRejection(reasons);
    } else {
      setRejection(null);
    }
  };

  return (
    <div className="inspector">
      <div className="inspector-head">
        <h3>
          <i className="color-dot" style={{ background: color }} />
          齐射组 {group.name}
          <small>{unit.members.length} 个点位 · 1 个主控</small>
        </h3>
      </div>

      <div className="insp-row">
        <label>
          <span>主控点火时刻（全组完全一致）</span>
          <input value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="mm:ss.mmm" />
        </label>
        <label>
          <span>整组共用音乐时间点</span>
          <select value={cueId} onChange={(e) => setCueId(e.target.value)}>
            {cues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}（{fmtTime(c.time)}）
              </option>
            ))}
          </select>
        </label>
      </div>

      <table className="member-table">
        <thead>
          <tr>
            <th>主控</th>
            <th>点位</th>
            <th>型号</th>
            <th>发射角度</th>
            <th>安全半径</th>
          </tr>
        </thead>
        <tbody>
          {unit.members.map((m) => (
            <tr key={m.id}>
              <td>
                <input
                  type="radio"
                  name={"master-" + group.id}
                  checked={masterId === m.id}
                  onChange={() => setMasterId(m.id)}
                  title="设为主控点位：每组只留一个主控"
                />
              </td>
              <td>{m.code}</td>
              <td>{m.model}</td>
              <td>
                <input
                  value={angles[m.id] ?? ""}
                  onChange={(e) => setAngles((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  className="angle-input"
                />
                °
              </td>
              <td>{m.safetyRadius}m</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rejection && rejection.length > 0 && (
        <div className="merge-reasons">
          <b>整组退回，时间轴与点位图未刷新：</b>
          <ul>
            {rejection.map((r, i) => (
              <li key={i}>{reasonText(r)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="insp-actions">
        <button className="primary" onClick={submit}>
          整组重新判定并刷新
        </button>
        {confirmDissolve ? (
          <>
            <button className="danger" onClick={onDissolve}>
              确认解散（保留各点位）
            </button>
            <button className="ghost" onClick={() => setConfirmDissolve(false)}>
              再想想
            </button>
          </>
        ) : (
          <button className="ghost" onClick={() => setConfirmDissolve(true)}>
            解散编组
          </button>
        )}
      </div>
    </div>
  );
}

interface SingleInspectorProps {
  point: Unit["members"][number];
  timeText: string;
  angleText: string;
  onTime: (v: string) => void;
  onAngle: (v: string) => void;
  onApply: () => void;
  onDelete?: () => void;
}

export function SingleInspector({ point, timeText, angleText, onTime, onAngle, onApply, onDelete }: SingleInspectorProps) {
  return (
    <div className="inspector">
      <div className="inspector-head">
        <h3>
          <i className="color-dot" style={{ background: "#64748b" }} />
          点位 {point.code}
          <small>未编组单点 · {point.section} · {point.model}</small>
        </h3>
      </div>
      <div className="insp-row">
        <label>
          <span>点火时间</span>
          <input value={timeText} onChange={(e) => onTime(e.target.value)} placeholder="mm:ss.mmm" />
        </label>
        <label>
          <span>发射角度（°）</span>
          <input value={angleText} onChange={(e) => onAngle(e.target.value)} />
        </label>
      </div>
      <p className="merge-hint">单点调整直接生效；若与已提交齐射组包络相交，会在冲突提示中报警但不阻止。</p>
      <div className="insp-actions">
        <button className="primary" onClick={onApply}>
          应用单点调整
        </button>
        {onDelete && (
          <button className="danger" onClick={onDelete}>
            删除自定义点位
          </button>
        )}
      </div>
    </div>
  );
}
