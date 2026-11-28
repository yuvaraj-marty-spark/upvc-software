import type { CustomDeductionOverrides } from './slidingCalculations'

export type WindowIdentityRow = {
  id: number
  modelId: string
  height: string
  width: string
  variantLetter?: string
  glassType: string
  toleranceMm: number
  applyTolerance: boolean
  heightAdditionalMm: number
  widthAdditionalMm: number
}

export type WindowInputUnit = 'in' | 'cm' | 'mm'

export function resolveWindowLabels(
  rows: WindowIdentityRow[],
  fromUnit?: WindowInputUnit,
  customFormulas?: Record<string, CustomDeductionOverrides>
): { label: string; serialNo: string }[] {
  void fromUnit
  void customFormulas
  if (!rows.length) return []

  let nextWindowNumber = 0
  let currentBaseNumber = 0

  return rows.map((row) => {
    const letter = row.variantLetter?.toLowerCase().trim() || ''

    if (!letter) {
      currentBaseNumber = ++nextWindowNumber
    } else if (currentBaseNumber === 0) {
      currentBaseNumber = ++nextWindowNumber
    }

    return {
      label: letter ? `W${currentBaseNumber}${letter}` : `W${currentBaseNumber}`,
      serialNo: letter ? `${currentBaseNumber}${letter}` : String(currentBaseNumber),
    }
  })
}
