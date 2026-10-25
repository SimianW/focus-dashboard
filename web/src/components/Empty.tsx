import { link } from "../router";

export function Empty({ title, children, action = true }: { title: string; children?: React.ReactNode; action?: boolean }) {
  return (
    <div className="empty">
      <EmptyArt />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && (
        <div className="row-actions" style={{ justifyContent: "center" }}>
          <a className="btn btn-accent btn-lg" {...link("/add?start=now")}>
            开始学习
          </a>
          <a className="btn btn-ghost btn-lg" {...link("/add")}>
            补记一段
          </a>
        </div>
      )}
    </div>
  );
}

/** One block on a 24-hour strip, two courses stacked in it: what a record looks like. */
function EmptyArt() {
  return (
    <svg className="empty-art" width="260" height="64" viewBox="0 0 260 64" aria-hidden="true">
      <rect x="0" y="8" width="260" height="32" rx="8" fill="var(--sunken)" />
      {[65, 130, 195].map((x) => (
        <rect key={x} x={x} y="8" width="1" height="32" fill="var(--axis)" opacity=".6" />
      ))}
      <rect x="140" y="8" width="66" height="32" rx="5" fill="var(--unfocused)" />
      <path d="M140 23H206V35A5 5 0 0 1 201 40H145A5 5 0 0 1 140 35Z" fill="var(--course-1)" />
      <rect x="140" y="14" width="66" height="8" fill="var(--course-2)" />
      {["0", "6", "12", "18", "24"].map((h, i) => (
        <text key={h} x={i * 65} y="58" fontSize="11" fill="var(--muted)" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
          {h}
        </text>
      ))}
    </svg>
  );
}
