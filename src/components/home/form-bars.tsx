export function FormBars({ values, me }: { values: (number | null)[]; me: boolean }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return <span />;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return (
    <span className="flex h-[22px] items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <i
          key={i}
          className={`w-1.5 rounded-sm ${v === null ? "bg-slate-700/40" : me ? "bg-primary" : "bg-slate-600"}`}
          style={{ height: v === null ? 3 : max === min ? 14 : 8 + ((v - min) / (max - min)) * 14 }}
        />
      ))}
    </span>
  );
}
