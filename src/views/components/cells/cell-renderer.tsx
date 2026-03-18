/** Universal cell renderer — picks the right editor based on column type. */

import { h } from "preact";
import { useCallback, useMemo } from "preact/hooks";
import type { ColumnDefinition } from "../../../types/schema";
import type { CellValue, DatabaseRecord } from "../../../types/record";
import { TextCell } from "./text-cell";
import { NumberCell } from "./number-cell";
import { DateCell } from "./date-cell";
import { CheckboxCell } from "./checkbox-cell";
import { SelectCell } from "./select-cell";
import { MultiSelectCell } from "./multi-select-cell";
import { RelationCell } from "./relation-cell";
import { RollupCell } from "./rollup-cell";

/** Props for the CellRenderer component. */
interface CellRendererProps {
  readonly column: ColumnDefinition;
  readonly value: CellValue;
  readonly onChange: (value: CellValue) => void;
  readonly onNavigate?: (noteName: string) => void;
  /** All records — used to compute in-use values for select dropdowns. */
  readonly records?: readonly DatabaseRecord[];
}

/**
 * Render the appropriate cell editor for a given column type.
 * @param props.column - Column definition determining which editor to use.
 * @param props.value - Current cell value.
 * @param props.onChange - Called when the cell value changes.
 * @param props.onNavigate - Called to navigate to a linked note (relations).
 */
export function CellRenderer({
  column,
  value,
  onChange,
  onNavigate,
  records,
}: CellRendererProps) {
  /** Compute all record values for this column (for select in-use/available sections). */
  const allRecordValues = useMemo(() => {
    if (!records || (column.type !== "select" && column.type !== "multi-select")) return undefined;
    const vals = new Set<string>();
    for (const r of records) {
      const v = r.values[column.id];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === "string" && item) vals.add(item);
        }
      } else if (typeof v === "string" && v) {
        vals.add(v);
      }
    }
    return Array.from(vals);
  }, [records, column.id, column.type]);

  /** Wrap onChange for text cells to match CellValue signature. */
  const handleTextChange = useCallback(
    (v: string) => onChange(v),
    [onChange]
  );

  /** Wrap onChange for number cells. */
  const handleNumberChange = useCallback(
    (v: number | null) => onChange(v),
    [onChange]
  );

  /** Wrap onChange for date cells. */
  const handleDateChange = useCallback(
    (v: string | null) => onChange(v),
    [onChange]
  );

  /** Wrap onChange for checkbox cells. */
  const handleCheckboxChange = useCallback(
    (v: boolean) => onChange(v),
    [onChange]
  );

  /** Wrap onChange for select cells. */
  const handleSelectChange = useCallback(
    (v: string | null) => onChange(v),
    [onChange]
  );

  /** Wrap onChange for multi-select cells. */
  const handleMultiSelectChange = useCallback(
    (v: readonly string[]) => onChange(v),
    [onChange]
  );

  /** Wrap onChange for relation cells. */
  const handleRelationChange = useCallback(
    (v: string) => onChange(v),
    [onChange]
  );

  switch (column.type) {
    case "text":
      return (
        <TextCell
          value={typeof value === "string" ? value : value !== null ? String(value) : null}
          onChange={handleTextChange}
        />
      );

    case "number":
      return (
        <NumberCell
          value={typeof value === "number" ? value : null}
          onChange={handleNumberChange}
        />
      );

    case "date":
      return (
        <DateCell
          value={typeof value === "string" ? value : null}
          onChange={handleDateChange}
        />
      );

    case "checkbox":
      return (
        <CheckboxCell
          value={typeof value === "boolean" ? value : false}
          onChange={handleCheckboxChange}
        />
      );

    case "select": {
      // Handle both plain string and array values (Obsidian stores list types as arrays)
      const selectVal = typeof value === "string" ? value
        : Array.isArray(value) && value.length > 0 ? String(value[0])
        : null;
      return (
        <SelectCell
          value={selectVal}
          options={column.options ?? []}
          allRecordValues={allRecordValues}
          onChange={handleSelectChange}
        />
      );
    }

    case "multi-select": {
      // Handle both array and single string values
      const multiVal = Array.isArray(value) ? (value as readonly string[])
        : typeof value === "string" && value ? [value]
        : null;
      return (
        <MultiSelectCell
          value={multiVal}
          options={column.options ?? []}
          allRecordValues={allRecordValues}
          onChange={handleMultiSelectChange}
        />
      );
    }

    case "relation":
      return (
        <RelationCell
          value={value}
          onChange={handleRelationChange}
          onNavigate={onNavigate ?? (() => {})}
        />
      );

    case "rollup":
    case "formula":
      return <RollupCell value={value} />;

    default:
      return (
        <TextCell
          value={value !== null ? String(value) : null}
          onChange={handleTextChange}
        />
      );
  }
}
