import { useCountUp } from "../motion";

/** A figure such as "3 hr 37 min" with the digits large and the units set small. */
export function Fig({ text }: { text: string }) {
  if (!/\d/.test(text)) return <span className="fig">{text}</span>;
  const parts = text
    .split(/(\d+(?:\.\d+)?%?)/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <span className="fig">
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className="unit">
            {p}
          </span>
        ),
      )}
    </span>
  );
}

/** A Fig that counts up to `value` the first time it appears. */
export function CountFig({ value, format }: { value: number; format: (v: number) => string }) {
  const v = useCountUp(value);
  return (
    <>
      <span aria-hidden="true">
        <Fig text={format(v)} />
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
