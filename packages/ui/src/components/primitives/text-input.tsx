import { clsx } from "clsx";
import { forwardRef } from "react";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, error, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "h-sg-size-input-height w-full rounded-md border border-sg-border bg-sg-surface-2",
        "px-2 text-sg-text-primary placeholder:text-sg-text-disabled",
        "focus:outline-none focus:border-sg-border-focus focus:ring-1 focus:ring-sg-border-focus",
        error && "border-sg-danger focus:border-sg-danger focus:ring-sg-danger",
        className,
      )}
      {...props}
    />
  );
});
