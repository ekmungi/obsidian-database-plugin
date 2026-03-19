# Obsidian Database Plugin

Notion-like database views for Obsidian. Interactive tables, kanban boards, and calendars over your markdown files with inline editing.

## What it does

Turn any folder of markdown files into a database. Your YAML frontmatter becomes the data, and the plugin gives you three views to work with it:

- **Table view** -- spreadsheet-like grid with inline editing, sorting, filtering, and search
- **Kanban view** -- drag-and-drop cards grouped by any select/multi-select property
- **Calendar view** -- monthly calendar with events placed by date, drag to reschedule

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
- **Column configuration** -- add, edit, reorder, and delete columns via the gear icon on column headers. "+" button discovers existing frontmatter properties. File column label is editable but type is locked.
- **Database settings** -- gear dropdown for database name, template folder (with folder autocomplete), and view type filter.
- **Property type sync** -- column types sync to Obsidian's `types.json` so the Properties editor shows the correct input widgets.
- **Schema-level filter** -- set `dbViewType` in settings to show only files whose `db-view-type` frontmatter matches. Enables multiple databases in one folder.
- **New records** -- "+ New" button creates a note with default frontmatter from the schema (including `db-view-type` if configured) and opens it for editing.
- **File explorer entry** -- a `.dbview` file is created in each database folder. Click it to open the database view.
- **Live updates** -- file changes, renames, and deletions are reflected immediately in the view.
- **View persistence** -- database views survive Obsidian restarts. Tab title shows the database name.
- **Theme-aware** -- inherits all styles from your Obsidian theme via CSS variables. Select tag colors use a Notion-inspired palette.

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

### Available colors

`gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `brown`

## Development

```bash
npm install
npm run dev       # watch mode
npm run build     # production build
npm test          # run tests (234 tests)
```

### Architecture

Three-layer design:

1. **Data Layer** (`src/data/`) -- frontmatter parsing, file indexing, caching, change watching
2. **Database Engine** (`src/engine/`) -- schema management, query/filter/sort, relation resolution, rollups
3. **View Layer** (`src/views/`) -- Preact components for table, kanban, calendar, cell editors, toolbar

### Tech stack

- TypeScript (strict mode)
- Preact (3KB React-compatible UI)
- esbuild (bundler)
- Vitest (testing)
- Obsidian Plugin API

## Roadmap

- Recursive subfolder scanning
- Codeblock embedding (inline database views in notes)
- Customizable color schemes
- Gallery and timeline views
- Formula column support

## License

MIT
