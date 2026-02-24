import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  secondary: "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3",
  md: "h-10 px-4",
  lg: "h-11 px-5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={[base, variants[variant], sizes[size], className].join(" ")}
      {...props}
    />
  );
}
