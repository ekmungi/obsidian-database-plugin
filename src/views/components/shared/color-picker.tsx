/** Color picker popup for select option color customization.
 *  Displays a grid of color swatches matching all ColorKey values.
 *  Closes on outside click or Escape. */

import { h } from "preact";
import { useCallback, useEffect, useRef } from "preact/hooks";
import type { ColorKey } from "../../../types/schema";

/** All available color keys in display order. */
const ALL_COLORS: readonly ColorKey[] = [
  "gray", "red", "orange", "yellow", "green",
  "teal", "blue", "purple", "pink", "brown",
] as const;

/** Swatch preview colors — saturated pastels with semantic text pairings. */
const COLOR_VALUES: Record<ColorKey, string> = {
  gray: "#A8B4C8",
  red: "#E09898",
  orange: "#E0A880",
  yellow: "#E0C470",
  green: "#90C890",
  teal: "#80C8C8",
  blue: "#90A8D8",
  purple: "#B898D8",
  pink: "#D890B8",
  brown: "#B8C488",
};

interface ColorPickerProps {
  /** Currently selected color. */
  readonly value: ColorKey;
  /** Called when user selects a new color. */
  readonly onChange: (color: ColorKey) => void;
  /** Called to dismiss the picker. */
  readonly onClose: () => void;
}

/**
 * Renders a popup grid of color swatches for picking a ColorKey.
 * Active color is highlighted with a border accent.
 * Closes on outside click or Escape key.
 */
export function ColorPicker({ value, onChange, onClose }: ColorPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /** Close on outside click or Escape. */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Use setTimeout to avoid the current click event triggering immediate close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
      document.addEventListener("keydown", handleEscape, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [onClose]);

  /** Handle click on a swatch — select the color and close. */
  const handleSelect = useCallback(
    (color: ColorKey) => {
      onChange(color);
      onClose();
    },
    [onChange, onClose],
  );

  return (
    <div ref={containerRef} class="color-picker-popup">
      {ALL_COLORS.map((color) => (
        <div
          key={color}
          class={`color-picker-swatch${color === value ? " active" : ""}`}
          style={{ backgroundColor: COLOR_VALUES[color] }}
          title={color}
          onClick={() => handleSelect(color)}
        />
      ))}
    </div>
  );
}
