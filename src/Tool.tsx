// Sheetshape: turns the messy spreadsheet a team runs on into a small app with a proper form, filters and totals.
import { useMemo, useState } from "react";
import { parseCsv, toCsv } from "./lib/csv";
import { download, uid, useStored } from "./lib/store";
import { useShared } from "./lib/useShared";
import { ImportBox, Section, ShareBox, Stat, Stats } from "./ui/kit";

const T = "sheetshape";
type Kind = "text" | "number" | "date" | "email" | "choice" | "yesno";
type Col = { key: string; label: string; kind: Kind; options: string[]; required: boolean };
type Row = Record<string, string> & { _id: string };
type App = { name: string; cols: Col[]; rows: Row[] };
const SAMPLE_CSV = `Client,Contact email,Status,Deal value,Next step date,Owner,Signed
Studio Nord,mehdi@studionord.tn,Proposal sent,12000,2026-10-03,Amira,no
Glazeco,sara@glazeco.com,Won,8500,2026-10-10,Karim,yes
Maison Jasmin,nadia@jasmin.tn,Negotiating,23000,2026-10-01,Amira,no
Atelier Tools,omar@atelier.tn,Lost,4000,,Karim,no
Café Lamine,info@lamine.tn,New lead,3000,2026-10-05,Lina,no
Hotel Azur,events@azur.tn,Proposal sent,41000,2026-10-08,Amira,no`;

/** Guess each column's type from its values. */
function infer(head: string[], rows: string[][]): Col[] {
  return head.map((h, i) => {
    const vals = rows.map(r => (r[i] ?? "").trim()).filter(Boolean), uniq = [...new Set(vals)];
    let kind: Kind = "text";
    if (vals.length && vals.every(v => /^-?[\d\s.,]+$/.test(v))) kind = "number";
    else if (vals.length && vals.every(v => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v))) kind = "date";
    else if (vals.length && vals.every(v => /^[^@\s]+@[^@\s]+\.\w+$/.test(v))) kind = "email";
    else if (uniq.every(v => /^(yes|no|true|false|y|n|oui|non|1|0)$/i.test(v)) && uniq.length <= 2) kind = "yesno";
    else if (uniq.length <= Math.max(6, rows.length / 3) && uniq.length < rows.length) kind = "choice";
    return { key: "c" + i, label: h || `Column ${i + 1}`, kind, options: kind === "choice" ? uniq : [], required: vals.length === rows.length };
  });
}
function fromCsv(text: string, name: string): App {
  const [head, ...rest] = parseCsv(text);
  const cols = infer(head ?? [], rest);
  return { name, cols, rows: rest.map(r => ({ _id: uid(), ...Object.fromEntries(cols.map((c, i) => [c.key, r[i] ?? ""])) })) };
}
const num = (v: string) => parseFloat(v.replace(/\s/g, "").replace(",", ".")) || 0;

function Table({ app, onEdit, onDelete }: { app: App; onEdit?: (r: Row) => void; onDelete?: (id: string) => void }) {
  const [q, setQ] = useState(""), [sort, setSort] = useState<{ k: string; d: 1 | -1 } | null>(null), [f, setF] = useState<Record<string, string>>({});
  const rows = useMemo(() => {
    let r = app.rows.filter(x => (!q || Object.values(x).join(" ").toLowerCase().includes(q.toLowerCase())) && Object.entries(f).every(([k, v]) => !v || x[k] === v));
    if (sort) { const c = app.cols.find(c => c.key === sort.k)!; r = [...r].sort((a, b) => (c.kind === "number" ? num(a[sort.k]) - num(b[sort.k]) : (a[sort.k] ?? "").localeCompare(b[sort.k] ?? "")) * sort.d); }
    return r;
  }, [app, q, sort, f]);
  const numCols = app.cols.filter(c => c.kind === "number");
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row"><input className="input" style={{ flex: 1 }} type="search" placeholder="Search" aria-label="Search rows" value={q} onChange={e => setQ(e.target.value)} />
        {app.cols.filter(c => c.kind === "choice" || c.kind === "yesno").map(c => <select key={c.key} className="input" style={{ width: "auto" }} aria-label={`Filter ${c.label}`} value={f[c.key] ?? ""} onChange={e => setF({ ...f, [c.key]: e.target.value })}><option value="">{c.label}: all</option>{[...new Set(app.rows.map(r => r[c.key]).filter(Boolean))].map(o => <option key={o}>{o}</option>)}</select>)}</div>
      <div className="table-wrap"><table className="t"><thead><tr>{app.cols.map(c => <th key={c.key} className={c.kind === "number" ? "r" : ""} style={{ cursor: "pointer" }} onClick={() => setSort({ k: c.key, d: sort?.k === c.key && sort.d === 1 ? -1 : 1 })}>{c.label}{sort?.k === c.key ? (sort.d === 1 ? " ↑" : " ↓") : ""}</th>)}{onEdit && <th />}</tr></thead>
        <tbody>{rows.map(r => <tr key={r._id}>{app.cols.map(c => <td key={c.key} className={c.kind === "number" ? "r" : ""}>{c.kind === "choice" ? r[c.key] && <span className="pill">{r[c.key]}</span> : c.kind === "yesno" ? (/^(yes|true|y|oui|1)$/i.test(r[c.key]) ? "Yes" : "No") : c.kind === "number" && r[c.key] ? num(r[c.key]).toLocaleString() : r[c.key]}</td>)}
          {onEdit && <td className="r" style={{ whiteSpace: "nowrap" }}><button className="btn ghost small" onClick={() => onEdit(r)}>Edit</button><button className="btn ghost small danger" onClick={() => onDelete?.(r._id)}>×</button></td>}</tr>)}</tbody>
        {numCols.length > 0 && <tfoot><tr>{app.cols.map((c, i) => <td key={c.key} className={c.kind === "number" ? "r" : ""}><strong>{c.kind === "number" ? rows.reduce((a, r) => a + num(r[c.key]), 0).toLocaleString() : i === 0 ? `${rows.length} rows` : ""}</strong></td>)}{onEdit && <td />}</tr></tfoot>}
      </table></div>
    </div>
  );
}

export default function Sheetshape() {
  const shared = useShared<App>();
  const [apps, setApps] = useStored<App[]>(T, "apps", [fromCsv(SAMPLE_CSV, "Sales pipeline")]);
  const [idx, setIdx] = useStored(T, "idx", 0);
  const [draft, setDraft] = useState<Row | null>(null);
  const [tab, setTab] = useState<"app" | "fields">("app");
  const [err, setErr] = useState("");
  if (shared.data) return <Section title={shared.data.name}><Table app={shared.data} /><p className="note" style={{ marginTop: 8 }}>Read-only copy shared with Sheetshape.</p></Section>;
  const app = apps[Math.min(idx, apps.length - 1)];
  const setApp = (a: App) => setApps(apps.map((x, i) => (i === Math.min(idx, apps.length - 1) ? a : x)));
  const save = () => {
    if (!draft) return;
    const missing = app.cols.filter(c => c.required && !(draft[c.key] ?? "").trim()).map(c => c.label);
    const badEmail = app.cols.filter(c => c.kind === "email" && draft[c.key] && !/^[^@\s]+@[^@\s]+\.\w+$/.test(draft[c.key])).map(c => c.label);
    if (missing.length || badEmail.length) { setErr([missing.length ? `Fill in: ${missing.join(", ")}` : "", badEmail.length ? `Check the email in: ${badEmail.join(", ")}` : ""].filter(Boolean).join(". ")); return; }
    setApp({ ...app, rows: app.rows.some(r => r._id === draft._id) ? app.rows.map(r => (r._id === draft._id ? draft : r)) : [draft, ...app.rows] }); setDraft(null); setErr("");
  };
  const choiceStats = app.cols.filter(c => c.kind === "choice").slice(0, 1).flatMap(c => c.options.map(o => ({ o, n: app.rows.filter(r => r[c.key] === o).length, sum: app.cols.filter(x => x.kind === "number").slice(0, 1).reduce((a, x) => a + app.rows.filter(r => r[c.key] === o).reduce((b, r) => b + num(r[x.key]), 0), 0) })));

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "0 1 280px" }}><span>App</span><select id="ss-app" className="input" value={Math.min(idx, apps.length - 1)} onChange={e => setIdx(+e.target.value)}>{apps.map((a, i) => <option key={i} value={i}>{a.name}</option>)}</select></label>
        <div className="seg-mini"><button aria-pressed={tab === "app"} onClick={() => setTab("app")}>Use the app</button><button aria-pressed={tab === "fields"} onClick={() => setTab("fields")}>Fields</button></div>
      </div>
      {tab === "app" && <>
        <Section title={app.name} aside={<><button className="btn small primary" onClick={() => setDraft({ _id: uid(), ...Object.fromEntries(app.cols.map(c => [c.key, ""])) } as Row)}>Add a record</button><button className="btn small" onClick={() => download(`${app.name}.csv`, toCsv([app.cols.map(c => c.label), ...app.rows.map(r => app.cols.map(c => r[c.key] ?? ""))]), "text/csv")}>Export CSV</button></>}>
          <Stats><Stat value={app.rows.length} label="Records" />{choiceStats.slice(0, 4).map(s => <Stat key={s.o} value={s.sum ? s.sum.toLocaleString() : s.n} label={`${s.o}${s.sum ? ` (${s.n})` : ""}`} />)}</Stats>
        </Section>
        {draft && <Section title={app.rows.some(r => r._id === draft._id) ? "Edit record" : "New record"}>
          <div className="ss-form">{app.cols.map(c => (
            <label key={c.key} className="field"><span>{c.label}{c.required ? " *" : ""}</span>
              {c.kind === "choice" ? <select className="input" value={draft[c.key] ?? ""} onChange={e => setDraft({ ...draft, [c.key]: e.target.value })}><option value="">Choose</option>{c.options.map(o => <option key={o}>{o}</option>)}</select>
                : c.kind === "yesno" ? <select className="input" value={/^(yes|true|y|oui|1)$/i.test(draft[c.key] ?? "") ? "yes" : "no"} onChange={e => setDraft({ ...draft, [c.key]: e.target.value })}><option value="no">No</option><option value="yes">Yes</option></select>
                  : <input className="input" type={c.kind === "number" ? "text" : c.kind === "date" ? "date" : c.kind === "email" ? "email" : "text"} inputMode={c.kind === "number" ? "decimal" : undefined} value={draft[c.key] ?? ""} onChange={e => setDraft({ ...draft, [c.key]: e.target.value })} />}
            </label>))}</div>
          {err && <p className="pill bad" style={{ marginTop: 10 }}>{err}</p>}
          <div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={save}>Save</button><button className="btn ghost" onClick={() => { setDraft(null); setErr(""); }}>Cancel</button></div>
        </Section>}
        <Section title="Records"><Table app={app} onEdit={setDraft} onDelete={id => setApp({ ...app, rows: app.rows.filter(r => r._id !== id) })} /></Section>
        <Section title="Share a read-only copy"><ShareBox slug={T} data={app} label="Copy read-only link" message={`${app.name}:`} /></Section>
      </>}
      {tab === "fields" && <Section title="Fields" aside={<button className="btn ghost small danger" onClick={() => { setApps(apps.filter((_, i) => i !== Math.min(idx, apps.length - 1))); setIdx(0); }} disabled={apps.length < 2}>Delete this app</button>}>
        <label className="field" style={{ maxWidth: 360, marginBottom: 12 }}><span>App name</span><input className="input" value={app.name} onChange={e => setApp({ ...app, name: e.target.value })} /></label>
        {app.cols.map(c => <div key={c.key} className="row" style={{ marginBottom: 6, alignItems: "center" }}><input className="input" style={{ flex: 1 }} aria-label="Label" value={c.label} onChange={e => setApp({ ...app, cols: app.cols.map(x => x.key === c.key ? { ...x, label: e.target.value } : x) })} />
          <select className="input" style={{ width: 130 }} aria-label="Type" value={c.kind} onChange={e => setApp({ ...app, cols: app.cols.map(x => x.key === c.key ? { ...x, kind: e.target.value as Kind, options: e.target.value === "choice" ? [...new Set(app.rows.map(r => r[c.key]).filter(Boolean))] : x.options } : x) })}>{(["text", "number", "date", "email", "choice", "yesno"] as Kind[]).map(k => <option key={k} value={k}>{k === "yesno" ? "yes / no" : k}</option>)}</select>
          {c.kind === "choice" && <input className="input" style={{ flex: 2 }} aria-label="Options" value={c.options.join(", ")} onChange={e => setApp({ ...app, cols: app.cols.map(x => x.key === c.key ? { ...x, options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : x) })} />}
          <label className="check note"><input type="checkbox" checked={c.required} onChange={e => setApp({ ...app, cols: app.cols.map(x => x.key === c.key ? { ...x, required: e.target.checked } : x) })} />Required</label></div>)}
      </Section>}
      <Section title="Turn another sheet into an app"><ImportBox label="Paste a sheet copied from Excel or Google Sheets, or a CSV file" rows={4} onText={t => { const a = fromCsv(t, `App ${apps.length + 1}`); if (a.cols.length) { setApps([...apps, a]); setIdx(apps.length); setTab("fields"); } }} /></Section>
      <style>{`.ss-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}`}</style>
    </div>
  );
}
