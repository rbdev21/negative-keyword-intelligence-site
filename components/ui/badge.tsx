import type { HTMLAttributes } from "react";

export function Badge({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700",
        className,
      ].join(" ")}
      {...props}
    />
  );
}
