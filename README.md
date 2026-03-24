# Obsidian Database Plugin

Notion-like database views for Obsidian. Interactive tables, kanban boards, calendars, and timelines over your markdown files with inline editing.

## What it does

Turn any folder of markdown files into a database. Your YAML frontmatter becomes the data, and the plugin gives you four views to work with it:

- **Table view** -- spreadsheet-like grid with inline editing, sorting, filtering, and search
- **Kanban view** -- drag-and-drop cards grouped by any select/multi-select property
- **Calendar view** -- monthly calendar with events placed by date, drag to reschedule
- **Timeline view** -- horizontal Gantt-style chart showing records as bars across date ranges, with zoom (week/month/quarter/year), today marker, optional grouping, and color-coded bars

All edits write directly to your markdown files' frontmatter. No proprietary database -- your notes stay portable.

## Features

- **Inline editing** -- click any cell to edit. Supports text, number, date, select, multi-select, checkbox, and relation columns.
- **Inline file rename** -- click the cell area around a file name to rename it. Click the name link to open the note.
- **Relations with picker** -- searchable dropdown for linking to notes in other database folders. Respects the target database's `dbViewType` filter. Create new entries directly from the picker.
- **Bidirectional relations** -- per-column toggle that auto-creates the reverse column in the target database. Adding or removing a link automatically syncs the back-link. Deleting a relation column or record cleans up all back-links.
- **Cross-view refresh** -- changes to relations, schema, or records automatically refresh any other open database view affected by the change.
- **Recursive subfolder scanning** -- opt-in "Include subfolders" toggle in settings that scans the entire folder tree for records. Works with `dbViewType` filter. New records still create in the root folder. Relation pickers respect the target database's recursive setting.
- **Row selection and bulk delete** -- checkbox on each row with select-all in the header. Soft red delete button appears in the toolbar when records are selected. Deleting cleans up all bidirectional back-links.
- **Sort** -- click column headers to sort, Shift+click for multi-level sort. Sort dropdown for manual rule management.
- **Filter** -- filter by any column with operators (is, is not, contains, is empty, etc.). Filter values come from your actual data.
- **Search** -- full-text search across all fields via the magnifying glass icon.
- **Column visibility** -- hide/show columns per view via the eye icon dropdown. `db-view-type` column is auto-hidden when the filter is active.
- **Column configuration** -- add, edit, reorder, and delete columns via the gear icon on column headers. Gear icon opens an inline dropdown (not a modal) with auto-save -- changes apply immediately, no Save button needed. Per-column "Wrap text" toggle. "+" button discovers existing frontmatter properties. File column label is editable but type is locked.
- **Column reorder** -- drag column headers to rearrange columns. Drop indicator shows where the column will land. Order persists in the schema.
- **Column resize** -- drag the right edge of any column header to resize. Widths persist per view in the schema.
- **Text overflow** -- by default, long text truncates with ellipsis. Enable "Wrap text" per column to show full content. Applies to text, file names, relations, and multi-select tags.
- **Relation tags** -- linked notes display as styled pill tags with a subtle gray background. Clickable to navigate to the note.
- **Database settings** -- gear dropdown for database name, template folder (with folder autocomplete), and view type filter. All settings auto-save on change.
- **Property type sync** -- column types sync to Obsidian's `types.json` so the Properties editor shows the correct input widgets.
- **Schema-level filter** -- set `dbViewType` in settings to show only files whose `db-view-type` frontmatter matches. Enables multiple databases in one folder.
- **Template picker** -- configure a `templateFolder` in settings, then use the split "+ New" button's dropdown arrow to create records from any `.md` template in that folder. Plain "+ New" click always creates a blank record. No templates configured? The button stays simple with no dropdown.
- **New records** -- "+ New" button creates a note with default frontmatter from the schema (including `db-view-type` if configured) and opens it for editing.
- **Auto-discovery** -- when a database loads, frontmatter properties not yet in the schema are automatically discovered and added as columns with guessed types.
- **Editable database title** -- H2 heading above the view showing the database name. Click to rename -- also renames the `.dbview` file.
- **File explorer entry** -- a `.dbview` file is created in each database folder. Click it to open the database view. Clicking again reveals the existing tab instead of opening a duplicate.
- **Live updates** -- file changes, renames, and deletions are reflected immediately in the view.
- **View management** -- Notion-style tabs for views. Create new table/kanban/calendar/timeline views with the "+" button, rename by double-clicking, right-click for context menu (rename, set as default, delete). Sort and filter state persists per view.
- **View persistence** -- database views survive Obsidian restarts. Tab title shows the database name. View-specific settings (e.g. timeline zoom level) persist across sessions.
- **Codeblock embedding** -- embed interactive database views inside any markdown note using a ` ```database ` codeblock. Full editing, live updates, and view selection. Great for dashboards and project pages.
- **Theme-aware** -- inherits all styles from your Obsidian theme via CSS variables. Select tag colors use a Notion-inspired palette.

## How it compares to Obsidian's built-in tools

Obsidian has **Properties** (a per-file frontmatter editor) and the experimental **Bases** (early beta). This plugin takes a fundamentally different approach — it treats a folder of markdown files as a full database with multiple interactive views.

| Capability | Obsidian Properties / Bases | This Plugin |
|------------|---------------------------|-------------|
| **Views** | Single-file property editor; Bases has a basic table | Table, Kanban, Calendar, Timeline/Gantt |
| **Inline editing** | One file at a time | Edit any cell across all records in any view |
| **Relations** | None | Bidirectional wikilink relations with auto-sync |
| **Rollups** | None | Computed rollup columns across relations |
| **Drag-and-drop** | None | Kanban cards, calendar events, timeline bars |
| **Schema** | No schema — raw frontmatter | Typed columns with options, colors, and validation |
| **Multi-view** | One view per file | Notion-style tabs per database |
| **Codeblock embedding** | No | Interactive views inside any note |
| **Templates** | Requires separate plugin | Built-in multi-folder template picker |
| **Data format** | Frontmatter | Frontmatter (fully compatible — your data stays portable) |
| **Dependencies** | Core Obsidian | Zero external dependencies |

**In short:** If Obsidian Properties is a spreadsheet cell, this plugin is the full spreadsheet — plus kanban, calendar, and Gantt views on top.

## Getting started

1. Install the plugin (copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/obsidian-database-plugin/`)
2. Create a `.database.json` file in any folder to define the schema (see below)
3. Right-click the folder in the file explorer and select "Open as database"
4. A `.dbview` file is created automatically -- click it anytime to reopen the database

### Schema format (`.database.json`)

```json
{
  "name": "Projects",
  "source": ".",
  "dbViewType": "projects",
  "columns": [
    { "id": "name", "type": "file", "label": "Name" },
    { "id": "status", "type": "select", "label": "Status", "options": [
      { "value": "Not Started", "color": "gray" },
      { "value": "In Progress", "color": "blue" },
      { "value": "Done", "color": "green" }
    ]},
    { "id": "due", "type": "date", "label": "Due Date" },
    { "id": "effort", "type": "number", "label": "Effort (hrs)" },
    { "id": "done", "type": "checkbox", "label": "Complete" }
  ],
  "views": [
    { "id": "table-1", "type": "table", "sort": [{"column": "due", "dir": "asc"}] },
    { "id": "kanban-1", "type": "kanban", "groupBy": "status" },
    { "id": "calendar-1", "type": "calendar", "dateField": "due", "colorBy": "status" }
  ]
}
```

### Column types

| Type | Description | YAML format |
|------|-------------|-------------|
| `file` | Note name (auto, first column) | -- |
| `text` | Free text | `key: value` |
| `number` | Numeric value | `key: 42` |
| `date` | Date picker | `key: 2026-03-18` |
| `select` | Single-select with colors | `key: [Value]` |
| `multi-select` | Multi-select with colors | `key: [A, B]` |
| `checkbox` | Boolean toggle | `key: true` |
| `relation` | Link to notes in another folder (with picker and bidirectional sync) | `key: "[[Note]]"` |
| `rollup` | Computed from relations | (read-only) |

### Relation columns

To link between databases, add a relation column with `target` pointing to another database folder. Enable bidirectional sync to auto-create a reverse column in the target:

```json
{
  "id": "tasks",
  "type": "relation",
  "label": "Tasks",
  "target": "Tasks",
  "multiple": true,
  "bidirectional": true,
  "reverseColumnId": "project"
}
```

The reverse column (`project`) is auto-created in the target database's schema with matching bidirectional config. Back-links are synced automatically when relations are added or removed.

### Codeblock embedding

Embed a database view inside any note using a fenced codeblock:

````markdown
```database
source: Projects
view: Main
maxHeight: 400
```
````

| Property | Required | Description |
|----------|----------|-------------|
| `source` | Yes | Folder path containing the `.database.json` schema |
| `view` | No | View name (e.g., `Main`) or type (e.g., `kanban`). Falls back to default view. |
| `maxHeight` | No | Max height in pixels. If set, the view scrolls vertically beyond this height. By default, the view expands to show all rows. |

The embedded view is fully interactive -- you can edit cells, add records, sort, and filter just like in a tab. Multiple codeblocks (same or different databases) work independently. Edits in one view are reflected in all others showing the same data.

### Available colors

`gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `brown`

## Known issues

- **External file renames break relation backlinks** -- when a file linked via a bidirectional relation is renamed outside Obsidian (e.g., in Windows Explorer or via cloud sync), the backlink in the target database becomes stale. Renaming inside Obsidian works correctly. Workaround: after an external rename, manually update the backlink in the target file's frontmatter.

## Development

```bash
npm install
npm run dev       # watch mode
npm run build     # production build
npm test          # run tests (300 tests)
```

### Architecture

Three-layer design:

1. **Data Layer** (`src/data/`) -- frontmatter parsing, file indexing, caching, change watching
2. **Database Engine** (`src/engine/`) -- schema management, query/filter/sort, relation resolution, rollups
3. **View Layer** (`src/views/`) -- Preact components for table, kanban, calendar, cell editors, toolbar

The `DatabaseController` (`src/views/database-controller.ts`) is a shared data layer used by both the tab-based `DatabaseView` and the codeblock renderer. It manages schema, records, file events, and all mutation handlers. The view wrappers are thin: `DatabaseView` (~140 lines) delegates to the controller for all data operations.

### Tech stack

- TypeScript (strict mode)
- Preact (3KB React-compatible UI)
- esbuild (bundler)
- Vitest (testing)
- Obsidian Plugin API

## Roadmap

- Community plugin registry submission (v1.0.0)
- Customizable color schemes
- Formula column support
- Gallery view
- CSV import/export

## License

MIT
