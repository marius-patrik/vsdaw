import { clsx } from "clsx";
import { forwardRef } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={clsx(
        "h-sg-size-input-height w-full rounded-md border border-sg-border bg-sg-surface-2",
        "px-2 text-sg-text-primary focus:outline-none focus:border-sg-border-focus focus:ring-1 focus:ring-sg-border-focus",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
