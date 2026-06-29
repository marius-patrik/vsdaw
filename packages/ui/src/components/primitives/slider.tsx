import { clsx } from "clsx";
import { forwardRef } from "react";
import "./slider.css";

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
    <div className={clsx("sg-slider", isVertical && "sg-slider-vertical", className)}>
      <input
        ref={ref}
        type="range"
        className={clsx("sg-slider-input", isVertical && "sg-slider-input-vertical")}
        {...props}
      />
      {valueLabel && <span className="text-sg-text-secondary text-sg-font-xs">{valueLabel}</span>}
    </div>
  );
});
