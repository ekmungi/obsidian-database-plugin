/**
 * Tests for the useVirtualScroll hook and its calculateVisibleRange helper.
 * Validates visible range calculation, overscan, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { calculateVisibleRange } from "../use-virtual-scroll";

describe("calculateVisibleRange", () => {
  it("calculates correct range at the top of the list", () => {
    const range = calculateVisibleRange(
      0,     // scrollTop
      300,   // containerHeight
      100,   // itemCount
      30,    // itemHeight
      5,     // overscan
    );

    // Visible: 0-9 (300/30 = 10 items), with overscan: start=max(0, -5)=0, end=min(100, 15)=15
    expect(range.start).toBe(0);
    expect(range.end).toBe(15);
  });

  it("calculates correct range in the middle of the list", () => {
    const range = calculateVisibleRange(
      600,   // scrollTop — item 20
      300,   // containerHeight — 10 items visible
      100,   // itemCount
      30,    // itemHeight
      5,     // overscan
    );

    // Raw start: 600/30=20, raw end: 20+10=30
    // With overscan: start=15, end=35
    expect(range.start).toBe(15);
    expect(range.end).toBe(35);
  });

  it("clamps range at the bottom of the list", () => {
    const range = calculateVisibleRange(
      2700,  // scrollTop — item 90
      300,   // containerHeight — 10 items visible
      100,   // itemCount
      30,    // itemHeight
      5,     // overscan
    );

    // Raw start: 2700/30=90, raw end: 90+10=100
    // With overscan: start=85, end=min(100, 105)=100
    expect(range.start).toBe(85);
    expect(range.end).toBe(100);
  });

  it("handles zero items", () => {
    const range = calculateVisibleRange(0, 300, 0, 30, 5);

    expect(range.start).toBe(0);
    expect(range.end).toBe(0);
  });

  it("handles zero item height", () => {
    const range = calculateVisibleRange(0, 300, 100, 0, 5);

    expect(range.start).toBe(0);
    expect(range.end).toBe(0);
  });

  it("handles very small list that fits entirely in viewport", () => {
    const range = calculateVisibleRange(
      0,     // scrollTop
      500,   // containerHeight — could fit ~16 items
      3,     // itemCount — only 3 items
      30,    // itemHeight
      5,     // overscan
    );

    expect(range.start).toBe(0);
    expect(range.end).toBe(3);
  });

  it("handles zero overscan", () => {
    const range = calculateVisibleRange(
      300,   // scrollTop — item 10
      300,   // containerHeight — 10 items visible
      100,   // itemCount
      30,    // itemHeight
      0,     // overscan — no extra items
    );

    expect(range.start).toBe(10);
    expect(range.end).toBe(20);
  });

  it("handles large overscan that exceeds item count", () => {
    const range = calculateVisibleRange(
      0,     // scrollTop
      300,   // containerHeight
      20,    // itemCount
      30,    // itemHeight
      50,    // overscan — larger than total items
    );

    expect(range.start).toBe(0);
    expect(range.end).toBe(20);
  });

  it("handles fractional scroll positions", () => {
    const range = calculateVisibleRange(
      45,    // scrollTop — between item 1 and 2
      300,   // containerHeight
      100,   // itemCount
      30,    // itemHeight
      5,     // overscan
    );

    // Raw start: floor(45/30) = 1, visible count: ceil(300/30)=10, raw end: 11
    // With overscan: start=max(0, -4)=0, end=min(100, 16)=16
    expect(range.start).toBe(0);
    expect(range.end).toBe(16);
  });

  it("handles container height smaller than one item", () => {
    const range = calculateVisibleRange(
      0,     // scrollTop
      15,    // containerHeight — less than one item height
      100,   // itemCount
      30,    // itemHeight
      5,     // overscan
    );

    // visible count: ceil(15/30) = 1
    // start=0, end=min(100, 6)=6
    expect(range.start).toBe(0);
    expect(range.end).toBe(6);
  });
});
