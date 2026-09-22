import { useEffect, useMemo, useState } from "react";
import type { MusicCue, RejectReason, Unit } from "../firework";
import { MUSIC_TOLERANCE_MS, fmtTime, isAdjacencyConnected, reasonText } from "../firework";

interface MergeBarProps {
  selectedUnits: Unit[];
  cues: MusicCue[];
  unitColor: Map<string, string>;
  /** 当前草稿（含角度改动）下的重新判定结果；null 表示尚未执行判定 */
  rejection: RejectReason[] | null;
  onMerge: (cueId: string) => void;
  onCancel: () => void;
}

export default function MergeBar({ selectedUnits, cues, unitColor, rejection, onMerge, onCancel }: MergeBarProps) {
  const selectedGroups = selectedUnits.filter((u) => u.kind === "group");
  const allPoints = selectedUnits.flatMap((u) => u.members);
  const connected = isAdjacencyConnected(allPoints);
  const multiGroupBlock = selectedGroups.length > 1;

  const groupTimes = selectedUnits.map((u) => u.fireTime);
  const sameTime = new Set(groupTimes).size <= 1;
  const timeMs = groupTimes[0] ?? 0;

  const suggestedCue = useMemo(() => {
    let best = cues[0];
    let bestDelta = Infinity;
    for (const c of cues) {
      const d = Math.abs(c.time - timeMs);
      if (d < bestDelta) {
        bestDelta = d;
        best = c;
      }
    }
    return best;
  }, [cues, timeMs]);

  const [cueId, setCueId] = useState<string>(suggestedCue?.id ?? "");
  useEffect(() => {
    setCueId((cur) => (cur && cues.some((c) => c.id === cur) ? cur : suggestedCue?.id ?? ""));
  }, [cues, suggestedCue]);

  const block = multiGroupBlock || (selectedUnits.length > 1 && !connected);

  return (
    <div className={"merge-bar" + (rejection && rejection.length ? " merge-bar-rejected" : "")}>
      <div className="merge-head">
        <h3>
          齐射编组草稿 <small>组内点火时刻必须完全一致，整组共用一个音乐时间点</small>
        </h3>
        <button className="ghost" onClick={onCancel}>
          取消选择
        </button>
      </div>

      <div className="merge-points">
        {selectedUnits.map((u) => (
          <span
            key={u.id}
            className="merge-chip"
            style={{ borderColor: unitColor.get(u.id), color: unitColor.get(u.id) }}
          >
            {u.kind === "group" ? "组 " : ""}
            {u.name}
            <em>
              {u.members.map((m) => m.code).join("·")} · {fmtTime(u.fireTime)}
            </em>
          </span>
        ))}
      </div>

      {multiGroupBlock && <p className="merge-error">一次只能并入一个既有齐射组，请先解散其中一组或分开操作。</p>}
      {!multiGroupBlock && !connected && (
        <p className="merge-error">
          所选点位不相邻（发射点间距需 ≤ 相邻阈值并连成一片），不能并为一组。
        </p>
      )}
      {!sameTime && (
        <p className="merge-hint">
          所选点位当前点火时刻不一致，提交时将统一对齐到所选用音乐时间点的时刻，再执行整组判定。
        </p>
      )}

      <div className="merge-actions">
        <label>
          <span>整组共用音乐时间点</span>
          <select value={cueId} disabled={block} onChange={(e) => setCueId(e.target.value)}>
            {cues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}（{fmtTime(c.time)}）
              </option>
            ))}
          </select>
        </label>
        <small className="merge-tol">对齐容差 {MUSIC_TOLERANCE_MS}ms</small>
        <button
          className="primary"
          disabled={block || !cueId}
          onClick={() => onMerge(cueId || suggestedCue?.id || "")}
        >
          整组判定并提交
        </button>
      </div>

      {rejection && rejection.length > 0 && (
        <div className="merge-reasons">
          <b>整组退回，原编排保持不动：</b>
          <ul>
            {rejection.map((r, i) => (
              <li key={i}>{reasonText(r)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
