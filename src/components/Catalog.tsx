import { useState } from "react";
import type { FireworkPoint, MusicCue, ProductType, Unit } from "../firework";
import { PRODUCT_TYPES, fmtTime, productType } from "../firework";

export function ModelList({ units }: { units: Unit[] }) {
  const rows = new Map<
    string,
    { type: ProductType; caliber: number; safety: number; count: number; sections: Set<string> }
  >();
  for (const u of units) {
    for (const p of u.members) {
      const cur =
        rows.get(p.model) ?? { type: productType(p.model), caliber: p.caliber, safety: p.safetyRadius, count: 0, sections: new Set<string>() };
      cur.count += 1;
      cur.sections.add(p.section);
      rows.set(p.model, cur);
    }
  }

  return (
    <div className="catalog">
      <h2>型号清单</h2>
      <table className="conflict-table">
        <thead>
          <tr>
            <th>型号</th>
            <th>类别</th>
            <th>口径</th>
            <th>安全半径</th>
            <th>数量</th>
            <th>所在段落</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(rows.entries()).map(([model, r]) => (
            <tr key={model}>
              <td>{model}</td>
              <td>{r.type}</td>
              <td>{r.caliber ? r.caliber + "mm" : "—"}</td>
              <td>{r.safety}m</td>
              <td>{r.count}</td>
              <td>{Array.from(r.sections).join("、")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AddPointFormProps {
  onAdd: (p: { section: string; model: string; caliber: number; angle: number; timeText: string; duration: number; safety: number; x: number; y: number }) => string | null;
}

export function AddPointForm({ onAdd }: AddPointFormProps) {
  const [form, setForm] = useState({ section: "Finale", model: "25mm罗马烛光", angle: "30", time: "03:50.000", duration: "1500", safety: "12", x: "108", y: "52" });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="add-form"
      onSubmit={(e) => {
        e.preventDefault();
        const err = onAdd({
          section: form.section,
          model: form.model,
          caliber: Number(form.model.match(/(\d+)\s*mm/)?.[1] ?? 0),
          angle: Number(form.angle),
          timeText: form.time,
          duration: Number(form.duration),
          safety: Number(form.safety),
          x: Number(form.x),
          y: Number(form.y),
        });
        setMsg(err ?? "已添加自定义点位（仅本浏览器）");
      }}
    >
      <h2>新增燃放点位</h2>
      <div className="field-grid">
        <label>
          <span>节目段落</span>
          <input value={form.section} onChange={set("section")} />
        </label>
        <label>
          <span>烟花型号</span>
          <select value={form.model} onChange={set("model")}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>发射角度（°）</span>
          <input value={form.angle} onChange={set("angle")} />
        </label>
        <label>
          <span>点火时间</span>
          <input value={form.time} onChange={set("time")} placeholder="mm:ss.mmm" />
        </label>
        <label>
          <span>持续时间（ms）</span>
          <input value={form.duration} onChange={set("duration")} />
        </label>
        <label>
          <span>安全半径（m）</span>
          <input value={form.safety} onChange={set("safety")} />
        </label>
        <label>
          <span>坐标 x（m）</span>
          <input value={form.x} onChange={set("x")} />
        </label>
        <label>
          <span>坐标 y（m）</span>
          <input value={form.y} onChange={set("y")} />
        </label>
      </div>
      <button className="primary">添加点位</button>
      {msg && <small className="form-msg">{msg}</small>}
    </form>
  );
}

export function AddCueForm({ onAdd }: { onAdd: (c: Omit<MusicCue, "id" | "custom">) => string | null }) {
  const [label, setLabel] = useState("M5 自定义");
  const [time, setTime] = useState("04:00.000");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="add-form"
      onSubmit={(e) => {
        e.preventDefault();
        const m = time.trim().match(/^(?:(\d+):)?(\d{1,2})[.,](\d{1,3})$/);
        if (!m) {
          setMsg("时间格式应为 mm:ss.mmm");
          return;
        }
        const t = (m[1] ? Number(m[1]) : 0) * 60000 + Number(m[2]) * 1000 + Number(m[3].padEnd(3, "0"));
        const err = onAdd({ label: label.trim() || `音乐点 ${fmtTime(t)}`, time: t });
        setMsg(err ?? "已添加音乐时间点");
      }}
    >
      <h2>新增音乐时间点</h2>
      <div className="field-grid">
        <label>
          <span>标记</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          <span>时间</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="mm:ss.mmm" />
        </label>
      </div>
      <button className="primary">添加音乐点</button>
      {msg && <small className="form-msg">{msg}</small>}
    </form>
  );
}

export type { FireworkPoint };
