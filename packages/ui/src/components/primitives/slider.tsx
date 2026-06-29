import { clsx } from "clsx";
import { forwardRef } from "react";

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  orientation?: "horizontal" | "vertical";
  valueLabel?: React.ReactNode;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { orientation = "horizontal", valueLabel, className, ...props },
  ref,
) {
  const isVertical = orientation === "vertical";

  return (
    <div className={clsx("flex items-center gap-2", isVertical && "flex-col")}>
      <input
        ref={ref}
        type="range"
        className={clsx(
          "accent-sg-accent",
          isVertical && "h-24 [writing-mode:bt-lr] appearance-slider-vertical",
          className,
        )}
        {...props}
      />
      {valueLabel && <span className="text-sg-text-secondary text-sg-font-xs">{valueLabel}</span>}
    </div>
  );
});
