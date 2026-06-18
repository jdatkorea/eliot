import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardTone = "default" | "warning" | "telegram";
export type CardPadding = "sm" | "md";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div";
  tone?: CardTone;
  padding?: CardPadding;
};

const toneClasses: Record<CardTone, string> = {
  default: "rounded border border-slate-200 bg-white",
  warning: "rounded border border-amber-200 bg-amber-50",
  telegram:
    "rounded-[var(--eliot-radius)] bg-[var(--tg-section-bg-color)]",
};

const paddingClasses: Record<CardPadding, string> = {
  sm: "px-2 py-1",
  md: "p-3.5",
};

export default function Card({
  as: Component = "section",
  tone = "default",
  padding = "md",
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(toneClasses[tone], paddingClasses[padding], className)}
      {...props}
    />
  );
}
