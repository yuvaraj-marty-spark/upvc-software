// Bridge between MeasurementRow state and CalculationResult for CAD and PDF Engine
import type { MeasurementRow } from '../pages/Measurements';
import type {
  CalculationResult,
  WindowInput,
  FrameOutput,
  PanelOutput,
  MirrorOutput,
  FrameType,
  WindowType,
  UnitType,
  UPVCSeries,
  CasementSubtype,
  VentilatorSubtype,
  VentilatorFanSide
} from '../types/cad';
import {
  calculateSlidingWindow,
  WINDOW_MODELS,
  type CustomDeductionOverrides,
  type WindowModelId
} from './slidingCalculations';

export function convertMeasurementsToCalculationResults(
  rows: MeasurementRow[],
  windowLabels: string[],
  customFormulas: Record<string, CustomDeductionOverrides> = {},
  fromUnit: 'in' | 'cm' | 'mm' = 'in'
): CalculationResult[] {
  if (!rows || !Array.isArray(rows)) return [];

  const results: CalculationResult[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (!row) continue;
    const rawModel = typeof row.modelId === 'string' ? row.modelId.trim() : '';
    if (!rawModel) continue;

    const hNum = parseFloat(row.height) || 0;
    const wNum = parseFloat(row.width) || 0;
    if (hNum <= 0 && wNum <= 0) continue;

    const label = windowLabels[idx] || `W${idx + 1}`;
    const modelOverrides = customFormulas[rawModel];
    const calcUnit = fromUnit === 'in' ? 'inches' : fromUnit === 'cm' ? 'cm' : 'mm';
    const calc = calculateSlidingWindow({
      modelId: rawModel as WindowModelId,
      height: hNum,
      width: wNum,
      unit: calcUnit,
      toleranceMm: row.toleranceMm,
      applyTolerance: row.applyTolerance,
      heightAdditionalMm: row.heightAdditionalMm,
      widthAdditionalMm: row.widthAdditionalMm,
      customOverrides: modelOverrides,
    });

      const modelDef = WINDOW_MODELS.find((m) => m.id === rawModel) || WINDOW_MODELS[0];
      const unit: UnitType = fromUnit === 'in' ? 'inch' : fromUnit === 'cm' ? 'cm' : 'mm';
      const widthInch = fromUnit === 'in' ? wNum : wNum / 25.4;
      const heightInch = fromUnit === 'in' ? hNum : hNum / 25.4;

      let windowType: WindowType = 'sliding';
      let frameType: FrameType = '2-track';
      let casementSubtype: CasementSubtype = 'single';
      let ventilatorSubtype: VentilatorSubtype = 'normal';
      let ventilatorFanSide: VentilatorFanSide = 'left';
      let profileSeries: UPVCSeries = '58mm';

      if (rawModel.startsWith('58-')) {
      windowType = 'sliding';
      profileSeries = '58mm';
      frameType =
        row.modelId === '58-2.5'
          ? '2.5-track'
          : row.modelId === '58-3'
          ? '3-track'
          : row.modelId === '58-4'
          ? '4-track'
          : '2-track';
    } else if (row.modelId.startsWith('66-')) {
      windowType = 'sliding';
      profileSeries = '66mm';
      frameType =
        row.modelId === '66-2.5'
          ? '2.5-track'
          : row.modelId === '66-3'
          ? '3-track'
          : '2-track';
    } else if (row.modelId.startsWith('85-')) {
      windowType = 'sliding';
      profileSeries = '85mm';
      frameType =
        row.modelId === '85-2.5'
          ? '2.5-track'
          : row.modelId === '85-3' || row.modelId === '85-3-mesh'
          ? '3-track'
          : '2-track';
    } else if (row.modelId.startsWith('open-')) {
      windowType = 'open';
      profileSeries = '60mm';
      frameType = 'no-track';
      casementSubtype =
        row.modelId === 'open-triple'
          ? 'triple'
          : row.modelId === 'open-double'
          ? 'double'
          : 'single';
    } else if (row.modelId.includes('door')) {
      windowType = 'open';
      profileSeries = '108mm';
      frameType = 'no-track';
      casementSubtype =
        row.modelId === 'door-with-bottom' || row.modelId === 'double-door-with-bottom'
          ? 'door_with_bottom'
          : 'door_without_bottom';
    } else if (row.modelId === 'fixed') {
      windowType = 'fixed';
      profileSeries = '58mm';
      frameType = 'no-track';
    } else if (row.modelId.startsWith('ventilator')) {
      windowType = 'ventilator';
      profileSeries = '58mm';
      frameType = 'no-track';
      ventilatorSubtype = row.modelId === 'ventilator-normal' ? 'normal' : 'fan';
      ventilatorFanSide = row.modelId === 'ventilator-fan-right' ? 'right' : 'left';
      // Explicitly supports ventilator-fan-left and ventilator-fan-right
    }

    const input: WindowInput = {
      widthInch: Number(widthInch.toFixed(2)),
      heightInch: Number(heightInch.toFixed(2)),
      widthCm: fromUnit === 'cm' ? wNum : undefined,
      heightCm: fromUnit === 'cm' ? hNum : undefined,
      widthMM: fromUnit === 'mm' ? wNum : undefined,
      heightMM: fromUnit === 'mm' ? hNum : undefined,
      frameType,
      windowType,
      casementSubtype,
      ventilatorSubtype,
      ventilatorFanSide,
      unit,
      profileSeries,
      windowNumber: idx + 1,
      windowLabel: label,
      variantLetter: row.variantLetter || undefined,
      glassType: row.glassType || '5mm_single',
      modelId: rawModel,
      identificationColor: row.identificationColor,
    };

    const frame: FrameOutput = {
      widthMM: calc.outerFrameWidth,
      heightMM: calc.outerFrameHeight,
      topBottomCutMM: calc.outerFrameWidth,
      leftRightCutMM: calc.outerFrameHeight,
      cutAngle: '45_degree',
      weldingAllowanceMM: 0,
      profileDepthMM: parseInt(calc.materialMM) || 60,
      trackCount:
        frameType === '4-track' ? 4 : frameType === '3-track' ? 3 : 2,
      mullionCutMM: calc.mullion ?? undefined,
      steelCutTopBottomMM: 0,
      steelCutLeftRightMM: 0,
    };

    const panelCount = (calc.sashHeightPieces || 0) / 2;
    const panel: PanelOutput = {
      count: panelCount,
      widthMM: calc.sashWidth || 0,
      heightMM: calc.sashHeight || 0,
      shutterType: modelDef.name,
      cutAngle: '45_degree',
      weldingAllowanceMM: 0,
      interlockOverlapMM: 0,
      verticalStyleCutMM: calc.sashHeight || 0,
      topBottomRailCutMM: calc.sashWidth || 0,
      steelCutVerticalMM: 0,
      steelCutHorizontalMM: 0,
      interlockMM: calc.interlock ?? undefined,
      verticalPieces: calc.sashHeightPieces || 0,
      horizontalPieces: calc.sashWidthPieces || 0,
    };

    const mirrorCount = calc.glassPieces || 0;
    const mirror: MirrorOutput = {
      count: mirrorCount,
      widthMM: calc.glassWidth || 0,
      heightMM: calc.glassHeight || 0,
      sqFeet: Number(
        (
          ((calc.glassWidth || 0) * (calc.glassHeight || 0) * mirrorCount) /
          92903
        ).toFixed(2)
      ),
      sqMeters: Number(
        (
          ((calc.glassWidth || 0) * (calc.glassHeight || 0) * mirrorCount) /
          1000000
        ).toFixed(2)
      ),
      glassType: row.glassType || 'Clear 5mm',
    };

    const additionalPanels: PanelOutput[] = [];
    if (calc.meshHeight && calc.meshWidth) {
      additionalPanels.push({
        count: 1,
        widthMM: calc.meshWidth,
        heightMM: calc.meshHeight,
        shutterType: 'Mosquito Mesh Sash',
        cutAngle: '45_degree',
        weldingAllowanceMM: 0,
        interlockOverlapMM: 0,
        verticalStyleCutMM: calc.meshHeight,
        topBottomRailCutMM: calc.meshWidth,
        steelCutVerticalMM: 0,
        steelCutHorizontalMM: 0,
      });
    }

    results.push({
      id: String(row.id || idx + 1),
      timestamp: new Date().toISOString(),
      input,
      convertedWidthMM: calc.outerFrameWidth,
      convertedHeightMM: calc.outerFrameHeight,
      ruleVersion: '1.0',
      ruleProfileName: modelDef.name,
      frame,
      panel,
      mirror,
      interlockMM: calc.interlock ?? undefined,
      mullionMM: calc.mullion ?? undefined,
      mullionPieces: calc.mullionPieces,
      additionalPanels: additionalPanels.length > 0 ? additionalPanels : undefined,
    });
  }

  return results;
}
