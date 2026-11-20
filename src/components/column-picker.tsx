import { SCHEME_COLUMNS } from "@/lib/scheme-format";

export function ColumnPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(id: string) {
    if (disabled || id === "wk" || id === "lsn") return;
    if (value.includes(id)) onChange(value.filter((item) => item !== id));
    else onChange([...value, id]);
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {SCHEME_COLUMNS.map((column) => {
        const locked = column.id === "wk" || column.id === "lsn";
        return (
          <li key={column.id}>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={value.includes(column.id) || locked}
                disabled={disabled || locked}
                onChange={() => toggle(column.id)}
              />
              {column.label}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
