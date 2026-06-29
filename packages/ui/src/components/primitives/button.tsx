import { clsx } from "clsx";
import { forwardRef } from "react";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger" | "toggle";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", loading = false, className, children, disabled, ...props },
  ref,
) {
  const isToggle = variant === "toggle";
  const isPressed = isToggle && props["aria-pressed"] === true;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center px-2.5 font-sg-base text-sg-text-primary",
        "rounded-md border border-sg-border transition-colors",
        size === "md" ? "h-sg-size-button-height" : "h-sg-size-button-small-height",
        variant === "primary" && "bg-sg-accent text-sg-accent-fg hover:bg-sg-accent-hover",
        variant === "default" && "bg-sg-surface-2 hover:bg-sg-surface-3",
        variant === "ghost" && "bg-transparent hover:bg-sg-surface-2",
        variant === "danger" && "bg-sg-danger/10 text-sg-danger hover:bg-sg-danger/20",
        isToggle &&
          (isPressed
            ? "bg-sg-accent text-sg-accent-fg border-sg-accent"
            : "bg-sg-surface-2 hover:bg-sg-surface-3"),
        (disabled || loading) && "opacity-50 pointer-events-none",
        className,
      )}
      {...props}
    >
      {loading ? <span className="animate-pulse">…</span> : children}
    </button>
  );
});

export interface IconButtonProps extends ButtonProps {
  icon: React.ReactNode;
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, className, ...props },
  ref,
) {
  return (
    <Button ref={ref} aria-label={label} className={clsx("px-1.5", className)} {...props}>
      {icon}
    </Button>
  );
});

export interface ToggleButtonProps extends Omit<ButtonProps, "variant"> {
  pressed: boolean;
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { pressed, ...props },
  ref,
) {
  return <Button ref={ref} variant="toggle" aria-pressed={pressed} {...props} />;
});
