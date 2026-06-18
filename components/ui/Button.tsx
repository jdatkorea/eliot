import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "tab";
export type ButtonTone = "default" | "telegram";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  fullWidth?: boolean;
  selected?: boolean;
  className?: string;
};

export type ButtonProps = ButtonBaseProps &
  (
    | (ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
    | (AnchorHTMLAttributes<HTMLAnchorElement> & { href: string })
  );

const variantClasses: Record<
  ButtonVariant,
  Record<ButtonTone, string>
> = {
  primary: {
    default:
      "rounded border border-indigo-500 bg-indigo-600 px-2 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50",
    telegram:
      "rounded-[var(--eliot-radius)] px-3.5 py-3.5 text-base font-semibold bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] disabled:opacity-45",
  },
  secondary: {
    default:
      "rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[10px] font-semibold leading-tight text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50",
    telegram:
      "rounded-[var(--eliot-radius-sm)] px-3 py-2.5 text-[15px] font-medium bg-[var(--tg-secondary-bg-color)] text-[var(--tg-link-color)] border border-[var(--tg-link-color)]",
  },
  ghost: {
    default:
      "shrink-0 rounded border border-slate-200 bg-white px-1.5 py-px text-[10px] font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50",
    telegram:
      "rounded-[var(--eliot-radius-sm)] px-3 py-2.5 text-[15px] font-medium bg-[var(--tg-secondary-bg-color)] text-[var(--tg-link-color)]",
  },
  tab: {
    default:
      "rounded px-2 py-1 text-[10px] font-semibold transition-colors",
    telegram:
      "rounded px-2 py-1 text-[10px] font-semibold transition-colors",
  },
};

const tabStateClasses: Record<ButtonTone, { selected: string; idle: string }> = {
  default: {
    selected: "bg-indigo-600 text-white",
    idle: "bg-transparent text-slate-600 hover:bg-slate-100",
  },
  telegram: {
    selected: "bg-indigo-600 text-white",
    idle: "bg-transparent text-slate-600 hover:bg-slate-100",
  },
};

export default function Button({
  variant = "primary",
  tone = "default",
  fullWidth = false,
  selected = false,
  className,
  href,
  ...props
}: ButtonProps) {
  const classes = cn(
    variantClasses[variant][tone],
    variant === "tab" &&
      (selected ? tabStateClasses[tone].selected : tabStateClasses[tone].idle),
    fullWidth && "block w-full",
    className,
  );

  if (href) {
    const { type: _type, ...anchorProps } = props as AnchorHTMLAttributes<HTMLAnchorElement>;
    return <a href={href} className={classes} {...anchorProps} />;
  }

  const { type = "button", ...buttonProps } = props as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button
      type={type}
      className={classes}
      aria-pressed={variant === "tab" ? selected : undefined}
      {...buttonProps}
    />
  );
}
