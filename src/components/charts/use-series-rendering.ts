'use client'

import { useCallback, useMemo, useState } from 'react'
import { useChartStable, useYScale } from './chart-context'
import type { LineLoadingPulseMode } from './line-loading-pulse'
import { LINE_LOADING_LOOP_PAUSE_MS } from './line-loading-timing'
import { resolveDashTailBounds } from './path-stroke-utils'
import { isSeriesContentVisible, resolveSeriesPulseMode } from './series-render-state'

export interface UseSeriesRenderingOptions {
  /** Key in data to use for y values */
  dataKey: string
  /** Y-scale group id (Recharts `yAxisId`). Default: `"left"`. */
  yAxisId?: string | number
  /** Data index from which the stroke becomes dashed (inclusive). */
  dashFromIndex?: number
  /** Show the loading pulse overlay. Default: follows chart loading phase. */
  loading?: boolean
  /** Override pulse animation mode (loop / exit / enter). */
  loadingPulseMode?: LineLoadingPulseMode
  /**
   * Called when a pulse cycle completes — fired BEFORE the loop-restart /
   * chart-notify branch (Line's `onLoadingPulseCycleComplete` contract).
   */
  onCycleComplete?: () => void
}

/**
 * Shared setup for series components (Line / Area): stable-slice context
 * reads, the per-axis y-scale, series index + y accessor, dash-tail bounds,
 * and the loading-pulse state machine. Rendering (paths, fills, gradients,
 * path metrics) stays local to each component — only the setup is shared.
 */
export function useSeriesRendering({
  dataKey,
  yAxisId,
  dashFromIndex,
  loading,
  loadingPulseMode,
  onCycleComplete,
}: UseSeriesRenderingOptions) {
  const {
    data,
    renderData,
    xScale,
    innerHeight,
    innerWidth,
    xAccessor,
    lines,
    chartPhase,
    notifyLoadingPulseComplete,
    yDomainTweenDuration,
  } = useChartStable()
  const yScale = useYScale(yAxisId)

  const pulseMode = resolveSeriesPulseMode(chartPhase, loading, loadingPulseMode)
  const showLoadingPulse = pulseMode != null
  const showSeriesContent = isSeriesContentVisible(chartPhase)
  const [pulseEpoch, setPulseEpoch] = useState(0)

  const handleLoadingPulseComplete = useCallback(() => {
    onCycleComplete?.()
    if (pulseMode === 'loop') {
      window.setTimeout(() => {
        setPulseEpoch((epoch) => epoch + 1)
      }, LINE_LOADING_LOOP_PAUSE_MS)
      return
    }
    notifyLoadingPulseComplete?.()
  }, [notifyLoadingPulseComplete, onCycleComplete, pulseMode])

  const seriesIndex = useMemo(() => {
    const index = lines.findIndex((line) => line.dataKey === dataKey)
    return index >= 0 ? index : 0
  }, [lines, dataKey])

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey]
      return typeof value === 'number' ? (yScale(value) ?? 0) : 0
    },
    [dataKey, yScale]
  )

  const hasDashTail = resolveDashTailBounds(dashFromIndex, data.length)

  return {
    // Stable-slice context reads shared by Line and Area
    data,
    renderData,
    xScale,
    innerWidth,
    innerHeight,
    xAccessor,
    chartPhase,
    /** Line's data-transition tween duration; Area ignores it. */
    yDomainTweenDuration,
    yScale,
    seriesIndex,
    getY,
    hasDashTail,
    // Loading-pulse state machine
    pulseMode,
    pulseEpoch,
    showLoadingPulse,
    handleLoadingPulseComplete,
    showSeriesContent,
  }
}
