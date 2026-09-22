import type { ConflictRow } from "../firework";

interface ConflictsProps {
  conflicts: ConflictRow[];
  onSelect: (unitId: string) => void;
}

export default function Conflicts({ conflicts, onSelect }: ConflictsProps) {
  return (
    <div className="conflicts">
      <div className="heading">
        <div>
          <p>冲突时间 / 空间提示</p>
          <h2>安全判定</h2>
        </div>
        <span className={"badge" + (conflicts.length ? " badge-warn" : " badge-ok")}>
          {conflicts.length ? `${conflicts.length} 处包络相交` : "已提交编组之间无相交"}
        </span>
      </div>
      {conflicts.length === 0 ? (
        <p className="empty">当前齐射组两两最近点位间距均不小于安全半径合计。</p>
      ) : (
        <table className="conflict-table">
          <thead>
            <tr>
              <th>对象 A</th>
              <th>对象 B</th>
              <th>最近点位间距</th>
              <th>安全半径合计</th>
              <th>级别</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.aId + c.bId}>
                <td>
                  <button className="link-btn" onClick={() => onSelect(c.aId)}>
                    {c.aName}
                  </button>
                </td>
                <td>
                  <button className="link-btn" onClick={() => onSelect(c.bId)}>
                    {c.bName}
                  </button>
                </td>
                <td>{c.gap.toFixed(1)}m</td>
                <td>{c.required.toFixed(1)}m</td>
                <td>
                  {c.bothGroup ? (
                    <span className="tag tag-block">组-组相交（整组退回依据）</span>
                  ) : (
                    <span className="tag tag-warn">涉及未编组单点（提示）</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
