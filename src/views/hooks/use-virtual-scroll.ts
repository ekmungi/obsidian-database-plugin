/**
 * Virtual scrolling hook — renders only visible rows for large datasets.
 * Calculates visible range based on scroll position, container height, and item height.
 */

import { useState, useCallback, useEffect } from "preact/hooks";
import type { RefObject } from "preact";

/** Options for configuring virtual scroll behavior. */
export interface VirtualScrollOptions {
  /** Total number of items in the list. */
  readonly itemCount: number;
  /** Height of each item in pixels (fixed). */
  readonly itemHeight: number;
  /** Ref to the scrollable container element. */
  readonly containerRef: RefObject<HTMLElement>;
  /** Number of extra items to render above/below the viewport (default 5). */
  readonly overscan?: number;
}

/** Return value from the useVirtualScroll hook. */
export interface VirtualScrollResult {
  /** Inclusive start and exclusive end indices of visible items. */
  readonly visibleRange: { readonly start: number; readonly end: number };
  /** Total height of all items in pixels (for spacer element). */
  readonly totalHeight: number;
  /** Pixel offset for positioning the first visible item. */
  readonly offsetY: number;
  /** Scroll event handler to attach to the container. */
  readonly onScroll: (e: Event) => void;
}

/**
 * Calculate the visible range of items given scroll state.
 * Pure function — no side effects.
 * @param scrollTop - Current scroll position in pixels.
 * @param containerHeight - Height of the visible container in pixels.
 * @param itemCount - Total number of items.
 * @param itemHeight - Height of each item in pixels.
 * @param overscan - Number of extra items above/below viewport.
 * @returns Object with start (inclusive) and end (exclusive) indices.
 */
export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemCount: number,
  itemHeight: number,
  overscan: number,
): { readonly start: number; readonly end: number } {
  if (itemCount === 0 || itemHeight === 0) {
    return { start: 0, end: 0 };
  }

  const rawStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const rawEnd = rawStart + visibleCount;

  const start = Math.max(0, rawStart - overscan);
  const end = Math.min(itemCount, rawEnd + overscan);

  return { start, end };
}

/**
 * Hook for virtual scrolling in list/table views.
 * Only renders items within the visible viewport plus overscan buffer.
 * @param options - Virtual scroll configuration.
 * @returns Visible range, total height, offset, and scroll handler.
 */
export function useVirtualScroll(options: VirtualScrollOptions): VirtualScrollResult {
  const { itemCount, itemHeight, containerRef, overscan = 5 } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  /** Update container height on mount and resize. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerHeight(el.clientHeight);

    // Use ResizeObserver if available for dynamic container sizing
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }

    return undefined;
  }, [containerRef]);

  /** Handle scroll events — update scroll position. */
  const onScroll = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    setScrollTop(target.scrollTop);
  }, []);

  const totalHeight = itemCount * itemHeight;

  const visibleRange = calculateVisibleRange(
    scrollTop,
    containerHeight,
    itemCount,
    itemHeight,
    overscan,
  );

  const offsetY = visibleRange.start * itemHeight;

  return {
    visibleRange,
    totalHeight,
    offsetY,
    onScroll,
  };
}
