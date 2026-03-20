/** TypeScript types for database schema stored in .database.json files. */

/** Supported column types in a database view. */
export type ColumnType =
  | "file"
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi-select"
  | "checkbox"
  | "relation"
  | "rollup"
  | "formula";

/** Color keys for select/multi-select options — maps to CSS variables. */
export type ColorKey =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "brown";

/** A single option for select/multi-select columns. */
export interface SelectOption {
  readonly value: string;
  readonly color: ColorKey;
}

/** Rollup aggregation functions. */
export type RollupFunction =
  | "count"
  | "count_values"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "percent_empty"
  | "percent_not_empty"
  | "show_original";

/** Definition of a single column in the database schema. */
export interface ColumnDefinition {
  readonly id: string;
  readonly type: ColumnType;
  readonly label: string;
  readonly options?: readonly SelectOption[];
  /** For relation columns: path to the target database folder. */
  readonly target?: string;
  /** For relation columns: whether multiple values are allowed. */
  readonly multiple?: boolean;
  /** For relation columns: whether to sync back-links to the target database. */
  readonly bidirectional?: boolean;
  /** For relation columns: the column ID in the target database for back-links. */
  readonly reverseColumnId?: string;
  /** For rollup columns: the relation column to aggregate from. */
  readonly relationColumn?: string;
  /** For rollup columns: the target column in the related database. */
  readonly targetColumn?: string;
  /** For rollup columns: the aggregation function. */
  readonly rollupFunction?: RollupFunction;
  /** For formula columns: the expression to evaluate. */
  readonly formula?: string;
  /** Column width in pixels (optional, for table view). */
  readonly width?: number;
  /** When true, cell text wraps instead of truncating with ellipsis. Default: false. */
  readonly wrapText?: boolean;
}

/** Sort direction for view configurations. */
export type SortDirection = "asc" | "desc";

/** A single sort rule. */
export interface SortRule {
  readonly column: string;
  readonly dir: SortDirection;
}

/** Filter operators for query conditions. */
export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty";

/** A single filter condition. */
export interface FilterRule {
  readonly column: string;
  readonly operator: FilterOperator;
  readonly value?: string | number | boolean;
}

/** View types supported by the plugin. */
export type ViewType = "table" | "kanban" | "calendar" | "timeline";

/** Base configuration shared by all view types. */
export interface BaseViewConfig {
  readonly id: string;
  readonly type: ViewType;
  readonly name?: string;
  readonly filters?: readonly FilterRule[];
  readonly hiddenColumns?: readonly string[];
  /** Marks this view as the default — cannot be deleted. */
  readonly isDefault?: boolean;
  /** Optional custom icon name from the Obsidian/Lucide icon set. */
  readonly icon?: string;
}

/** Table-specific view configuration. */
export interface TableViewConfig extends BaseViewConfig {
  readonly type: "table";
  readonly sort?: readonly SortRule[];
  readonly groupBy?: string;
  /** Per-column widths in pixels, keyed by column ID. */
  readonly columnWidths?: Readonly<Record<string, number>>;
}

/** Kanban-specific view configuration. */
export interface KanbanViewConfig extends BaseViewConfig {
  readonly type: "kanban";
  readonly groupBy: string;
  readonly cardFields?: readonly string[];
}

/** Calendar-specific view configuration. */
export interface CalendarViewConfig extends BaseViewConfig {
  readonly type: "calendar";
  readonly dateField: string;
  readonly colorBy?: string;
}

/** Timeline/Gantt-specific view configuration. */
export interface TimelineViewConfig extends BaseViewConfig {
  readonly type: "timeline";
  /** Column ID of the start date field. */
  readonly startDateField: string;
  /** Column ID of the end date field (optional — single-date records show as dots). */
  readonly endDateField: string;
  /** Optional column ID whose select options determine bar colors. */
  readonly colorBy?: string;
  /** Optional column ID to group rows by (collapsible sections). */
  readonly groupBy?: string;
}

/** Union of all view configurations. */
export type ViewConfig = TableViewConfig | KanbanViewConfig | CalendarViewConfig | TimelineViewConfig;

/** The complete database schema stored in .database.json. */
export interface DatabaseSchema {
  readonly name: string;
  readonly source: string;
  readonly templateFolder?: string;
  readonly columns: readonly ColumnDefinition[];
  readonly views: readonly ViewConfig[];
  /** When set, only show files whose frontmatter `db-view-type` matches this value. */
  readonly dbViewType?: string;
  /** When true, scan subfolders recursively for .md files instead of only direct children. */
  readonly recursive?: boolean;
  /** Schema format version — defaults to 1 on load if missing. */
  readonly version?: number;
}
