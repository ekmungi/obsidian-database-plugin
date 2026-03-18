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
