/** Extracted relation-specific config fields for the column config modal. */

import { h } from "preact";
import { FolderAutocomplete } from "../shared/folder-autocomplete";

/** Props for the RelationConfigFields component. */
interface RelationConfigFieldsProps {
  readonly target: string;
  readonly onTargetChange: (value: string) => void;
  readonly bidirectional: boolean;
  readonly onBidirectionalChange: (value: boolean) => void;
  readonly reverseColumnId: string;
  readonly onReverseColumnIdChange: (value: string) => void;
  /** All vault folder paths for the target folder autocomplete. */
  readonly folderPaths: readonly string[];
}

/**
 * Render relation-specific config fields: target folder autocomplete,
 * bidirectional toggle, and reverse column ID input.
 * @param props - target, bidirectional, reverseColumnId, folderPaths and their change handlers
 */
export function RelationConfigFields({
  target,
  onTargetChange,
  bidirectional,
  onBidirectionalChange,
  reverseColumnId,
  onReverseColumnIdChange,
  folderPaths,
}: RelationConfigFieldsProps) {
  return (
    <>
      {/* Target Folder — autocomplete dropdown of vault folders */}
      <div class="database-form-group">
        <label class="database-form-label">Target Folder</label>
        <FolderAutocomplete
          value={target}
          onChange={onTargetChange}
          folderPaths={folderPaths}
          placeholder="path/to/related/database"
        />
      </div>

      {/* Bidirectional toggle */}
      <div class="database-form-group">
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontSize: "var(--font-ui-small)",
          }}
        >
          <input
            type="checkbox"
            checked={bidirectional}
            onChange={(e) => onBidirectionalChange((e.target as HTMLInputElement).checked)}
          />
          Bidirectional
        </label>
      </div>

      {/* Reverse Column ID — only shown when bidirectional is enabled */}
      {bidirectional && (
        <div class="database-form-group">
          <label class="database-form-label">Reverse Column ID</label>
          <input
            class="database-form-input"
            type="text"
            value={reverseColumnId}
            onInput={(e) => onReverseColumnIdChange((e.target as HTMLInputElement).value)}
            placeholder="column-id-in-target-database"
          />
        </div>
      )}
    </>
  );
}
