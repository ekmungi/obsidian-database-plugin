/** Color picker popup for select option color customization.
 *  Displays a grid of color swatches matching all ColorKey values. */

import { h } from "preact";
import { useCallback } from "preact/hooks";
import type { ColorKey } from "../../../types/schema";

/** All available color keys in display order. */
const ALL_COLORS: readonly ColorKey[] = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "brown",
] as const;

/** Swatch preview colors — muted palette with semantic pairings. */
const COLOR_VALUES: Record<ColorKey, string> = {
  gray: "#C8CDD4",
  red: "#E8C5C5",
  orange: "#E8C9B8",
  yellow: "#EDD9B0",
  green: "#C3D5C3",
  teal: "#B8D8D8",
  blue: "#C5CDE8",
  purple: "#D8CCEB",
  pink: "#E0C8D8",
  brown: "#D4D9B8",
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
 *
 * @param props - value, onChange, onClose
 * @returns Preact VNode for color picker popup
 */
export function ColorPicker({ value, onChange, onClose }: ColorPickerProps) {
  /** Handle click on a swatch — select the color and close. */
  const handleSelect = useCallback(
    (color: ColorKey) => {
      onChange(color);
      onClose();
    },
    [onChange, onClose],
  );

  /** Stop propagation so backdrop click does not fire through the popup. */
  const stopPropagation = useCallback((e: Event) => {
    e.stopPropagation();
  }, []);

  return (
    <div class="color-picker-popup" onClick={stopPropagation}>
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
