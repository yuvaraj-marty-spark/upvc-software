import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import type { CalculationResult } from '../types/cad';
import { WINDOW_MODELS, type WindowModelId } from '../utils/slidingCalculations';
import { getModelColor } from '../utils/modelColors';
import {
  Sun,
  Moon,
  Download,
  FileText,
  Grid3X3,
  Columns,
  SplitSquareVertical,
  SplitSquareHorizontal,
  Layers,
} from 'lucide-react';
import './WindowVisualizer2D.css';

export type CadViewMode = 'all_in_one' | 'elevation' | 'section_a' | 'section_b';
export type CadTheme = 'white' | 'blueprint';
export type CadViewSelection = 'single' | 'gallery';

export interface WindowVisualizer2DProps {
  results: CalculationResult[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onExportPDF?: () => void;
  onExportGlassPDF?: () => void;
  language?: 'en' | 'ta';
  isTamil?: boolean;
  onClose?: () => void;
  projectName?: string;
  customerSerial?: string;
  customerName?: string;
}

export const WindowVisualizer2D: React.FC<WindowVisualizer2DProps> = ({
  results,
  selectedIndex,
  onSelectIndex,
  language = 'en',
  isTamil: isTamilProp,
  projectName = '',
  customerSerial = '',
  customerName = '',
}) => {
  const isTamil = isTamilProp ?? language === 'ta';
  const t = (ta: string, en: string) => (isTamil ? ta : en);

  const [cadView, setCadView] = useState<CadViewMode>('all_in_one');
  const [cadTheme, setCadTheme] = useState<CadTheme>('white');
  const [viewMode, setViewMode] = useState<CadViewSelection>('single');
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!results || results.length === 0) {
    return (
      <div className="visualizer-container" style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          {t(
            'அளவுகளை உள்ளிட்டவுடன் 2D CAD வரைபடங்கள் தோன்றும்.',
            'Add window measurements to display architectural 2D CAD drawings.'
          )}
        </p>
      </div>
    );
  }

  const currentResult = results[selectedIndex] || results[0];
  const modelId = (currentResult.input?.modelId || '58-2') as WindowModelId;
  const modelDef = WINDOW_MODELS.find((m) => m.id === modelId) || WINDOW_MODELS[0];
  const activeColor = getModelColor(modelId, currentResult.input?.identificationColor);

  // SVG palette generator
  const isWhite = cadTheme === 'white';
  const c = {
    bg: isWhite ? '#ffffff' : '#0b1329',
    grid: isWhite ? 'rgba(15, 23, 42, 0.04)' : 'rgba(56, 189, 248, 0.06)',
    sheetBorder: isWhite ? '#0f172a' : '#1e3a8a',
    titleBg: isWhite ? '#f8fafc' : '#090d16',
    titleBorder: isWhite ? '#cbd5e1' : '#1e293b',
    lineDark: isWhite ? '#0f172a' : '#f8fafc',
    lineMedium: isWhite ? '#475569' : '#94a3b8',
    lineLight: isWhite ? '#94a3b8' : '#64748b',
    profileStroke: isWhite ? '#0f172a' : '#38bdf8',
    profileFill: isWhite ? '#f8fafc' : '#090d16',
    profileFillDark: isWhite ? '#e2e8f0' : '#1e293b',
    steelFill: isWhite ? '#2563eb' : '#1d4ed8',
    glassFill: isWhite ? '#bae6fd' : '#0369a1',
    glassStroke: isWhite ? '#0284c7' : '#38bdf8',
    glassFillOpacity: isWhite ? 0.55 : 0.4,
    dimLine: isWhite ? '#475569' : '#64748b',
    dimText: isWhite ? '#0f172a' : '#f8fafc',
    dimBadgeBg: isWhite ? '#ffffff' : '#090d16',
    dimBadgeBorder: isWhite ? '#94a3b8' : '#38bdf8',
    sectionCut: isWhite ? '#dc2626' : '#ef4444',
    sectionBubbleFill: isWhite ? '#fee2e2' : '#450a0a',
    rollerWheel: isWhite ? '#d97706' : '#f59e0b',
    rollerStroke: isWhite ? '#78350f' : '#b45309',
    gasket: isWhite ? '#334155' : '#0f172a',
    beadFill: isWhite ? '#e2e8f0' : '#1e293b',
    arrowFill: isWhite ? '#2563eb' : '#38bdf8',
    meshBg: isWhite ? 'rgba(15, 23, 42, 0.05)' : 'rgba(56, 189, 248, 0.05)',
    meshPatternColor: isWhite ? '#0284c7' : '#38bdf8',
  };

  // Vector SVG Download
  const handleDownloadSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const label = currentResult.input?.windowLabel || `Window-${selectedIndex + 1}`;
    link.download = `LS_Interiors_${label}_2D_Architectural_CAD.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export 2D CAD Blueprint PDF
  const handleExportCADPDF = async () => {
    setIsExportingPDF(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const exportList = viewMode === 'gallery' ? results : [currentResult];

      for (let i = 0; i < exportList.length; i++) {
        if (i > 0) doc.addPage();
        const r = exportList[i];
        const label = r.input?.windowLabel || `W${i + 1}`;
        const mDef = WINDOW_MODELS.find((m) => m.id === r.input?.modelId) || WINDOW_MODELS[0];

        // Background
        doc.setFillColor(isWhite ? 255 : 11, isWhite ? 255 : 19, isWhite ? 255 : 41);
        doc.rect(0, 0, 297, 210, 'F');

        // Border
        doc.setDrawColor(isWhite ? 15 : 56, isWhite ? 23 : 189, isWhite ? 42 : 248);
        doc.setLineWidth(0.6);
        doc.rect(6, 6, 285, 198);

        // Header Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(isWhite ? 15 : 248, isWhite ? 23 : 250, isWhite ? 42 : 252);
        doc.text('L.S. INTERIORS — ARCHITECTURAL 2D CAD BLUEPRINT', 12, 13);

        // Customer serial is persistent and shared across the customer's PDFs.
        if (customerSerial) {
          doc.setFillColor(isWhite ? 37 : 29, isWhite ? 99 : 78, isWhite ? 235 : 216);
          doc.roundedRect(255, 8.5, 28, 6.5, 1, 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(customerSerial, 269, 13, { align: 'center' });
        }

        // Subheader Info
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(isWhite ? 37 : 56, isWhite ? 99 : 189, isWhite ? 235 : 248);
        const subText = `${label} • ${mDef.name}  [${r.convertedHeightMM} × ${r.convertedWidthMM} mm / ${r.input.heightInch}" H × ${r.input.widthInch}" W]`;
        doc.text(subText, 12, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(isWhite ? 71 : 148, isWhite ? 85 : 163, isWhite ? 105 : 184);
        const metaText = `Customer: ${customerName || 'General Order'}${projectName ? ` | Project: ${projectName}` : ''} | Scale: Proportional (NTS) | Date: ${new Date().toLocaleDateString('en-GB')}`;
        doc.text(metaText, 12, 23);

        // If current SVG is available, render via canvas to image
        if (svgRef.current && (viewMode === 'single' || i === selectedIndex)) {
          try {
            const svgData = new XMLSerializer().serializeToString(svgRef.current);
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const blobURL = URL.createObjectURL(blob);
            const img = new Image();

            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 2400;
                canvas.height = 1600;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = isWhite ? '#ffffff' : '#0b1329';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  const imgData = canvas.toDataURL('image/jpeg', 0.95);
                  doc.addImage(imgData, 'JPEG', 8, 26, 281, 172);
                }
                URL.revokeObjectURL(blobURL);
                resolve();
              };
              img.onerror = () => {
                URL.revokeObjectURL(blobURL);
                reject();
              };
              img.src = blobURL;
            });
          } catch (e) {
            console.error('Failed to capture SVG canvas for PDF:', e);
          }
        }
      }

      const serialPart = customerSerial
        ? `_${customerSerial.replace(/[^a-z0-9-]/gi, '_')}`
        : '';
      const fileName = `LS_Interiors_2D_CAD_Blueprints${serialPart}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Failed to generate 2D CAD PDF:', err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  /**
   * Render Comprehensive Architectural Drawing Canvas for a given CalculationResult
   */
  const renderArchitecturalSheet = (result: CalculationResult, uniquePrefix: string) => {
    const input = result.input;
    const resModelId = (input.modelId || '58-2') as WindowModelId;
    const resModelDef = WINDOW_MODELS.find((m) => m.id === resModelId) || WINDOW_MODELS[0];
    const category = resModelDef.category;

    const outerW = result.convertedWidthMM || 1000;
    const outerH = result.convertedHeightMM || 1200;

    const isDoor = category === 'door';
    const isSliding = category === 'sliding';
    const isOpen = category === 'open' || category === 'door';
    const isFixed = category === 'fixed';
    const isVentilator = category === 'ventilator';
    const isMeshWindow =
      resModelId === '58-2.5' || resModelId === '66-2.5' || resModelId === '85-2.5' || resModelDef.name.includes('Mesh') || resModelDef.name.includes('MESH');

    // View bounding logic
    const isAllInOne = cadView === 'all_in_one';
    const isElevationOnly = cadView === 'elevation';
    const isSectionAOnly = cadView === 'section_a';
    const isSectionBOnly = cadView === 'section_b';

    const svgW = isSectionBOnly ? 480 : isSectionAOnly ? 960 : 1000;
    const svgH = isSectionBOnly ? 720 : isSectionAOnly ? 500 : 680;

    // Geometry coordinates for Elevation
    let elevBoxX = 30;
    let elevBoxY = 82;
    let elevBoxW = isAllInOne ? 640 : 860;
    let elevBoxH = isAllInOne ? 380 : 540;

    if (isElevationOnly) {
      elevBoxX = 50;
      elevBoxY = 70;
      elevBoxW = 860;
      elevBoxH = 540;
    }

    const pad = 45;
    const maxEW = elevBoxW - pad * 2;
    const maxEH = elevBoxH - pad * 2;
    const elevScale = Math.min(maxEW / outerW, maxEH / outerH);

    const elevW = Math.round(outerW * elevScale);
    const elevH = Math.round(outerH * elevScale);
    const elevX = elevBoxX + Math.round((elevBoxW - elevW) / 2);
    const elevY = elevBoxY + Math.round((elevBoxH - elevH) / 2);

    const frameThick = Math.max(6, Math.min(18, Math.round(elevW * 0.045)));
    const innerX = elevX + frameThick;
    const innerY = elevY + frameThick;
    const innerW = elevW - frameThick * 2;
    const innerH = elevH - frameThick * 2;

    // Geometry coordinates for Section B-B (Vertical Section Cut)
    const secBX = isSectionBOnly ? 60 : 700;
    const secBY = isSectionBOnly ? 60 : 82;
    const secBW = isSectionBOnly ? 360 : 270;
    const secBH = isSectionBOnly ? 600 : 380;

    // Geometry coordinates for Section A-A (Horizontal Plan Cut)
    const secAX = isSectionAOnly ? 50 : 30;
    const secAY = isSectionAOnly ? 100 : 482;
    const secAW = isSectionAOnly ? 860 : 940;
    const secAH = isSectionAOnly ? 340 : 178;

    // Midpoints for red cutting-plane lines
    const cutLineAY = Math.round(elevY + elevH * 0.52);
    const cutLineBX = Math.round(elevX + elevW * 0.48);

    return (
      <svg
        ref={uniquePrefix === 'main' ? svgRef : undefined}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="visualizer-cad-canvas"
        style={{ backgroundColor: c.bg }}
      >
        <defs>
          {/* 45° Diamond wire mesh hatch for mosquito panels */}
          <pattern
            id={`${uniquePrefix}-diamond-mesh`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0 4 L 4 0 L 8 4 L 4 8 Z"
              fill="none"
              stroke={c.meshPatternColor}
              strokeWidth="0.7"
              strokeOpacity="0.8"
            />
          </pattern>

          {/* Dimension tick arrow marker */}
          <marker
            id={`${uniquePrefix}-dim-arrow`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={c.dimLine} />
          </marker>

          {/* Sliding direction arrow marker */}
          <marker
            id={`${uniquePrefix}-slide-arrow`}
            viewBox="0 0 12 12"
            refX="6"
            refY="6"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 1 2 L 10 6 L 1 10 z" fill={c.arrowFill} />
          </marker>

          {/* Red Section Cut Marker */}
          <marker
            id={`${uniquePrefix}-sec-arrow`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 1 2 L 9 5 L 1 8 z" fill={c.sectionCut} />
          </marker>
        </defs>

        {/* CAD Blueprint Background Grid */}
        <pattern
          id={`${uniquePrefix}-cad-grid`}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke={c.grid}
            strokeWidth="0.8"
          />
        </pattern>
        <rect width={svgW} height={svgH} fill={`url(#${uniquePrefix}-cad-grid)`} />

        {/* Outer Architectural Sheet Border */}
        <rect
          x="10"
          y="10"
          width={svgW - 20}
          height={svgH - 20}
          fill="none"
          stroke={c.sheetBorder}
          strokeWidth="1.2"
        />
        <rect
          x="13"
          y="13"
          width={svgW - 26}
          height={svgH - 26}
          fill="none"
          stroke={c.sheetBorder}
          strokeWidth="0.5"
        />

        {/* ========================================================= */}
        {/* TOP TECHNICAL TITLE BLOCK BANNER                          */}
        {/* ========================================================= */}
        {(!isSectionAOnly && !isSectionBOnly) && (
          <g id="title-block">
            <rect
              x="18"
              y="18"
              width={svgW - 36}
              height="44"
              fill={c.titleBg}
              stroke={c.titleBorder}
              strokeWidth="0.8"
            />
            {/* Title Line 1 */}
            <text
              x="30"
              y="34"
              fill={c.lineDark}
              fontSize="11"
              fontWeight="bold"
              fontFamily="monospace"
              letterSpacing="0.6"
            >
              L.S. INTERIORS • ARCHITECTURAL 2D CAD BLUEPRINT
            </text>
            {/* Title Line 2: Label & Dimensions */}
            <text
              x="30"
              y="50"
              fill={c.steelFill}
              fontSize="9.5"
              fontWeight="bold"
            >
              {`${input.windowLabel || 'Window'} • ${resModelDef.name}  [${result.convertedHeightMM} × ${result.convertedWidthMM} mm / ${input.heightInch}" H × ${input.widthInch}" W]`}
            </text>

            {/* Top-Right Info: Profile & Cuts Summary */}
            <text
              x={svgW - 30}
              y="34"
              fill={c.lineDark}
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="end"
            >
              {`PROFILE: ${resModelDef.material}  |  SCALE: PROPORTIONAL (NTS)`}
            </text>
            <text
              x={svgW - 30}
              y="50"
              fill={c.lineMedium}
              fontSize="8"
              fontFamily="monospace"
              textAnchor="end"
            >
              {isFixed
                ? `Direct Glass: ${result.mirror.heightMM || '-'}×${result.mirror.widthMM || '-'} mm  |  Glazing Bead: 45° Mitre`
                : isVentilator
                ? `Type: ${resModelId.includes('fan') ? 'Exhaust Fan + Louver' : 'Airflow Louvers'}  |  Frame: ${result.convertedHeightMM}×${result.convertedWidthMM} mm`
                : `Sash: ${result.panel.heightMM || '-'}×${result.panel.widthMM || '-'} mm  |  Glass: ${result.mirror.heightMM || '-'}×${result.mirror.widthMM || '-'} mm${result.interlockMM ? `  |  Interlock: ${result.interlockMM} mm` : ''}`}
            </text>
          </g>
        )}

        {/* ========================================================= */}
        {/* 1. FRONT ELEVATION VIEW (OUTSIDE VIEW)                   */}
        {/* ========================================================= */}
        {(isAllInOne || isElevationOnly) && (
          <g id="elevation-group">
            {/* Elevation Label */}
            <text
              x={elevX + elevW / 2}
              y={elevY - 38}
              fill={c.lineDark}
              fontSize="10"
              fontWeight="bold"
              letterSpacing="0.8"
              textAnchor="middle"
            >
              {t('முகப்பு தோற்றம் (FRONT ELEVATION - OUTSIDE VIEW)', 'FRONT ELEVATION (OUTSIDE VIEW)')}
            </text>

            {/* OVERALL WIDTH DIMENSION (TOP) */}
            <g id="dim-width">
              <line
                x1={elevX}
                y1={elevY - 4}
                x2={elevX}
                y2={elevY - 18}
                stroke={c.dimLine}
                strokeWidth="0.75"
                strokeDasharray="2 2"
              />
              <line
                x1={elevX + elevW}
                y1={elevY - 4}
                x2={elevX + elevW}
                y2={elevY - 18}
                stroke={c.dimLine}
                strokeWidth="0.75"
                strokeDasharray="2 2"
              />
              <line
                x1={elevX + 3}
                y1={elevY - 12}
                x2={elevX + elevW - 3}
                y2={elevY - 12}
                stroke={c.dimLine}
                strokeWidth="1"
                markerStart={`url(#${uniquePrefix}-dim-arrow)`}
                markerEnd={`url(#${uniquePrefix}-dim-arrow)`}
              />
              <rect
                x={elevX + elevW / 2 - 50}
                y={elevY - 20}
                width="100"
                height="15"
                rx="3"
                fill={c.dimBadgeBg}
                stroke={c.dimBadgeBorder}
                strokeWidth="0.6"
              />
              <text
                x={elevX + elevW / 2}
                y={elevY - 9.5}
                fill={c.dimText}
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {`W: ${outerW} mm (${input.widthInch}")`}
              </text>
            </g>

            {/* OVERALL HEIGHT DIMENSION (LEFT) */}
            <g id="dim-height">
              <line
                x1={elevX - 4}
                y1={elevY}
                x2={elevX - 18}
                y2={elevY}
                stroke={c.dimLine}
                strokeWidth="0.75"
                strokeDasharray="2 2"
              />
              <line
                x1={elevX - 4}
                y1={elevY + elevH}
                x2={elevX - 18}
                y2={elevY + elevH}
                stroke={c.dimLine}
                strokeWidth="0.75"
                strokeDasharray="2 2"
              />
              <line
                x1={elevX - 12}
                y1={elevY + 3}
                x2={elevX - 12}
                y2={elevY + elevH - 3}
                stroke={c.dimLine}
                strokeWidth="1"
                markerStart={`url(#${uniquePrefix}-dim-arrow)`}
                markerEnd={`url(#${uniquePrefix}-dim-arrow)`}
              />
              <g transform={`translate(${elevX - 19}, ${elevY + elevH / 2}) rotate(-90)`}>
                <rect
                  x="-50"
                  y="-7.5"
                  width="100"
                  height="15"
                  rx="3"
                  fill={c.dimBadgeBg}
                  stroke={c.dimBadgeBorder}
                  strokeWidth="0.6"
                />
                <text
                  x="0"
                  y="3"
                  fill={c.dimText}
                  fontSize="8"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {`H: ${outerH} mm (${input.heightInch}")`}
                </text>
              </g>
            </g>

            {/* OUTER UPVC FRAME MITRE BOX */}
            <rect
              x={elevX}
              y={elevY}
              width={elevW}
              height={elevH}
              fill={c.profileFill}
              stroke={c.profileStroke}
              strokeWidth="1.5"
            />
            {/* 45° Welded Mitre Corner Lines */}
            <line x1={elevX} y1={elevY} x2={innerX} y2={innerY} stroke={c.lineMedium} strokeWidth="1" />
            <line x1={elevX + elevW} y1={elevY} x2={innerX + innerW} y2={innerY} stroke={c.lineMedium} strokeWidth="1" />
            <line x1={elevX} y1={elevY + elevH} x2={innerX} y2={innerY + innerH} stroke={c.lineMedium} strokeWidth="1" />
            <line x1={elevX + elevW} y1={elevY + elevH} x2={innerX + innerW} y2={innerY + innerH} stroke={c.lineMedium} strokeWidth="1" />

            {/* Inner Frame Chamber */}
            <rect
              x={innerX}
              y={innerY}
              width={innerW}
              height={innerH}
              fill={isWhite ? '#f8fafc' : '#070b14'}
              stroke={c.profileStroke}
              strokeWidth="0.9"
            />

            {/* ========================================================= */}
            {/* MODEL-SPECIFIC INTERIOR ELEVATION CONTENT                 */}
            {/* ========================================================= */}
            {isSliding ? (
              // A. SLIDING WINDOW PANELS
              <g id="sliding-sashes">
                {(() => {
                  const pCount = Math.max(2, result.panel.count || 2);
                  const sashW = innerW / pCount;
                  const sThick = Math.max(5, Math.min(10, sashW * 0.06));

                  return Array.from({ length: pCount }).map((_, pIdx) => {
                    const sX = innerX + pIdx * sashW;
                    const isMesh = isMeshWindow && pIdx === pCount - 1;
                    const gX = sX + sThick;
                    const gY = innerY + sThick;
                    const gW = Math.max(8, sashW - sThick * 2);
                    const gH = Math.max(8, innerH - sThick * 2);

                    return (
                      <g key={`sliding-sash-${pIdx}`}>
                        {/* Sash Profile Outer Box */}
                        <rect
                          x={sX + 1}
                          y={innerY + 1}
                          width={sashW - 2}
                          height={innerH - 2}
                          fill={c.profileFillDark}
                          stroke={c.profileStroke}
                          strokeWidth="1.2"
                        />
                        {/* 45° Sash Mitres */}
                        <line x1={sX + 1} y1={innerY + 1} x2={gX} y2={gY} stroke={c.lineMedium} strokeWidth="0.8" />
                        <line x1={sX + sashW - 1} y1={innerY + 1} x2={gX + gW} y2={gY} stroke={c.lineMedium} strokeWidth="0.8" />
                        <line x1={sX + 1} y1={innerY + innerH - 1} x2={gX} y2={gY + gH} stroke={c.lineMedium} strokeWidth="0.8" />
                        <line x1={sX + sashW - 1} y1={innerY + innerH - 1} x2={gX + gW} y2={gY + gH} stroke={c.lineMedium} strokeWidth="0.8" />

                        {isMesh ? (
                          // Mosquito Mesh Screen
                          <g>
                            <rect x={gX} y={gY} width={gW} height={gH} fill={c.meshBg} stroke={c.lineMedium} strokeWidth="0.8" />
                            <rect x={gX} y={gY} width={gW} height={gH} fill={`url(#${uniquePrefix}-diamond-mesh)`} />
                            {/* Sliding Arrow Left */}
                            <line
                              x1={gX + gW * 0.65}
                              y1={gY + gH * 0.5}
                              x2={gX + gW * 0.35}
                              y2={gY + gH * 0.5}
                              stroke={c.arrowFill}
                              strokeWidth="1.6"
                              markerEnd={`url(#${uniquePrefix}-slide-arrow)`}
                            />
                            <rect
                              x={gX + gW / 2 - 38}
                              y={gY + gH / 2 - 12}
                              width="76"
                              height="24"
                              rx="3"
                              fill={c.dimBadgeBg}
                              stroke={c.dimBadgeBorder}
                              strokeWidth="0.6"
                            />
                            <text x={gX + gW / 2} y={gY + gH / 2 - 2} fill={c.steelFill} fontSize="7" fontWeight="bold" textAnchor="middle">
                              MOSQUITO MESH
                            </text>
                            <text x={gX + gW / 2} y={gY + gH / 2 + 7} fill={c.lineDark} fontSize="6.5" fontFamily="monospace" textAnchor="middle">
                              {`${result.panel.heightMM}×${result.panel.widthMM}`}
                            </text>
                          </g>
                        ) : (
                          // Glass Sash
                          <g>
                            <rect
                              x={gX}
                              y={gY}
                              width={gW}
                              height={gH}
                              fill={c.glassFill}
                              fillOpacity={c.glassFillOpacity}
                              stroke={c.glassStroke}
                              strokeWidth="1"
                            />
                            {/* Glass Specular Sheen Diagonal Lines */}
                            <line x1={gX + 12} y1={gY + 8} x2={gX + 28} y2={gY + 38} stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" />
                            <line x1={gX + 18} y1={gY + 8} x2={gX + 38} y2={gY + 44} stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.4" />

                            {/* Direction Arrow */}
                            <line
                              x1={pIdx % 2 === 0 ? gX + gW * 0.35 : gX + gW * 0.65}
                              y1={gY + gH * 0.5}
                              x2={pIdx % 2 === 0 ? gX + gW * 0.65 : gX + gW * 0.35}
                              y2={gY + gH * 0.5}
                              stroke={c.arrowFill}
                              strokeWidth="1.6"
                              markerEnd={`url(#${uniquePrefix}-slide-arrow)`}
                            />

                            {/* Sash Cut Badge */}
                            <rect
                              x={gX + gW / 2 - 36}
                              y={gY + gH / 2 - 12}
                              width="72"
                              height="24"
                              rx="3"
                              fill={c.dimBadgeBg}
                              stroke={c.dimBadgeBorder}
                              strokeWidth="0.6"
                            />
                            <text x={gX + gW / 2} y={gY + gH / 2 - 2} fill={c.steelFill} fontSize="7" fontWeight="bold" textAnchor="middle">
                              {`SASH ${pIdx + 1}`}
                            </text>
                            <text x={gX + gW / 2} y={gY + gH / 2 + 7} fill={c.lineDark} fontSize="6.5" fontFamily="monospace" textAnchor="middle">
                              {`${result.panel.heightMM}×${result.panel.widthMM}`}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
            ) : isOpen ? (
              // B. OPEN CASEMENT / DOOR
              <g id="casement-door-elevation">
                {(() => {
                  const isDouble = resModelId.includes('double') || resModelId === 'open-double';
                  const isTriple = resModelId === 'open-triple';
                  const hasBottom = !resModelId.includes('without-bottom');
                  const sThick = Math.max(7, Math.round(frameThick * 1.05));

                  if (!isDouble && !isTriple) {
                    // Single Casement / Single Door
                    const gX = innerX + sThick;
                    const gY = innerY + sThick;
                    const gW = innerW - sThick * 2;
                    const gH = hasBottom ? innerH - sThick * 2 : innerH - sThick;

                    return (
                      <g>
                        {/* Sash Frame */}
                        <rect
                          x={innerX + 2}
                          y={innerY + 2}
                          width={innerW - 4}
                          height={hasBottom ? innerH - 4 : innerH - 2}
                          fill={c.profileFillDark}
                          stroke={c.profileStroke}
                          strokeWidth="1.3"
                        />
                        {/* 45° Mitres */}
                        <line x1={innerX + 2} y1={innerY + 2} x2={gX} y2={gY} stroke={c.lineMedium} strokeWidth="0.8" />
                        <line x1={innerX + innerW - 2} y1={innerY + 2} x2={gX + gW} y2={gY} stroke={c.lineMedium} strokeWidth="0.8" />
                        {hasBottom && (
                          <>
                            <line x1={innerX + 2} y1={innerY + innerH - 2} x2={gX} y2={gY + gH} stroke={c.lineMedium} strokeWidth="0.8" />
                            <line x1={innerX + innerW - 2} y1={innerY + innerH - 2} x2={gX + gW} y2={gY + gH} stroke={c.lineMedium} strokeWidth="0.8" />
                          </>
                        )}

                        {/* Glass */}
                        <rect
                          x={gX}
                          y={gY}
                          width={gW}
                          height={gH}
                          fill={c.glassFill}
                          fillOpacity={c.glassFillOpacity}
                          stroke={c.glassStroke}
                          strokeWidth="1"
                        />
                        <line x1={gX + 16} y1={gY + 12} x2={gX + 44} y2={gY + 54} stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.5" />

                        {/* Casement Opening Swing Triangle (Dashed) */}
                        <path
                          d={`M ${gX + 4} ${gY + 4} L ${gX + gW - 6} ${gY + gH / 2} L ${gX + 4} ${gY + gH - 4}`}
                          fill="none"
                          stroke={c.steelFill}
                          strokeWidth="1.2"
                          strokeDasharray="5 3"
                        />

                        {/* Door / Casement Lever Handle */}
                        <rect
                          x={innerX + innerW - sThick + 2}
                          y={innerY + innerH / 2 - 12}
                          width="4"
                          height="24"
                          rx="1.5"
                          fill={c.lineDark}
                        />

                        {/* Badge */}
                        <rect
                          x={gX + gW / 2 - 42}
                          y={gY + gH / 2 - 13}
                          width="84"
                          height="26"
                          rx="3"
                          fill={c.dimBadgeBg}
                          stroke={c.dimBadgeBorder}
                          strokeWidth="0.7"
                        />
                        <text x={gX + gW / 2} y={gY + gH / 2 - 2} fill={c.steelFill} fontSize="7" fontWeight="bold" textAnchor="middle">
                          {isDoor ? 'DOOR SASH' : 'CASEMENT SASH'}
                        </text>
                        <text x={gX + gW / 2} y={gY + gH / 2 + 8} fill={c.lineDark} fontSize="6.5" fontFamily="monospace" textAnchor="middle">
                          {`${result.panel.heightMM} × ${result.panel.widthMM} mm`}
                        </text>
                      </g>
                    );
                  } else {
                    // Double Casement with Central T-Mullion
                    const mullionW = Math.max(10, Math.min(18, Math.round(innerW * 0.05)));
                    const mullionX = innerX + (innerW - mullionW) / 2;
                    const bayW = (innerW - mullionW) / 2;

                    return (
                      <g>
                        {/* Central Mullion */}
                        <rect x={mullionX} y={innerY} width={mullionW} height={innerH} fill={c.profileFill} stroke={c.profileStroke} strokeWidth="1.3" />
                        <rect x={mullionX + 3} y={innerY + 4} width={mullionW - 6} height={innerH - 8} fill={c.steelFill} fillOpacity="0.75" />

                        {/* Left Sash */}
                        <rect x={innerX + 2} y={innerY + 2} width={bayW - 2} height={innerH - 4} fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1.1" />
                        <path d={`M ${innerX + 8} ${innerY + 8} L ${innerX + bayW - 8} ${innerY + innerH / 2} L ${innerX + 8} ${innerY + innerH - 8}`} fill="none" stroke={c.steelFill} strokeWidth="1" strokeDasharray="4 2" />

                        {/* Right Sash */}
                        <rect x={mullionX + mullionW} y={innerY + 2} width={bayW - 2} height={innerH - 4} fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1.1" />
                        <path d={`M ${innerX + innerW - 8} ${innerY + 8} L ${mullionX + mullionW + 8} ${innerY + innerH / 2} L ${innerX + innerW - 8} ${innerY + innerH - 8}`} fill="none" stroke={c.steelFill} strokeWidth="1" strokeDasharray="4 2" />

                        <text x={mullionX + mullionW / 2} y={innerY + innerH / 2} fill="#ffffff" fontSize="6" fontWeight="bold" textAnchor="middle">T-MULLION</text>
                      </g>
                    );
                  }
                })()}
              </g>
            ) : isFixed ? (
              // C. FIXED WINDOW DIRECT GLAZING
              <g id="fixed-direct-glazing">
                {/* Snap-in Glazing Bead Line */}
                <rect
                  x={innerX + 8}
                  y={innerY + 8}
                  width={innerW - 16}
                  height={innerH - 16}
                  fill={c.glassFill}
                  fillOpacity={c.glassFillOpacity}
                  stroke={c.glassStroke}
                  strokeWidth="1.2"
                />
                {/* 45° Corner Glazing Bead Mitres */}
                <line x1={innerX} y1={innerY} x2={innerX + 8} y2={innerY + 8} stroke={c.lineMedium} strokeWidth="0.8" />
                <line x1={innerX + innerW} y1={innerY} x2={innerX + innerW - 8} y2={innerY + 8} stroke={c.lineMedium} strokeWidth="0.8" />
                <line x1={innerX} y1={innerY + innerH} x2={innerX + 8} y2={innerY + innerH - 8} stroke={c.lineMedium} strokeWidth="0.8" />
                <line x1={innerX + innerW} y1={innerY + innerH} x2={innerX + innerW - 8} y2={innerY + innerH - 8} stroke={c.lineMedium} strokeWidth="0.8" />

                {/* Glass Setting Blocks */}
                <rect x={innerX + 24} y={innerY + innerH - 14} width="22" height="6" fill="#1e293b" />
                <rect x={innerX + innerW - 46} y={innerY + innerH - 14} width="22" height="6" fill="#1e293b" />

                {/* Diagonal Reflection Lines */}
                <line x1={innerX + 24} y1={innerY + 20} x2={innerX + 64} y2={innerY + 80} stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.5" />
                <line x1={innerX + 34} y1={innerY + 20} x2={innerX + 80} y2={innerY + 90} stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.4" />

                {/* Direct Glass Badge */}
                <rect
                  x={innerX + innerW / 2 - 45}
                  y={innerY + innerH / 2 - 13}
                  width="90"
                  height="26"
                  rx="3"
                  fill={c.dimBadgeBg}
                  stroke={c.dimBadgeBorder}
                  strokeWidth="0.75"
                />
                <text x={innerX + innerW / 2} y={innerY + innerH / 2 - 2} fill={c.steelFill} fontSize="7.5" fontWeight="bold" textAnchor="middle">
                  DIRECT FIXED GLASS
                </text>
                <text x={innerX + innerW / 2} y={innerY + innerH / 2 + 8} fill={c.lineDark} fontSize="6.5" fontFamily="monospace" textAnchor="middle">
                  {`${result.mirror.heightMM} × ${result.mirror.widthMM} mm`}
                </text>
              </g>
            ) : (
              // D. VENTILATOR (LOUVER & FAN PORT)
              <g id="ventilator-elevation">
                {(() => {
                  const isFan = resModelId.includes('fan');
                  const isFanRight = resModelId === 'ventilator-fan-right';

                  if (isFan) {
                    const fanBayW = Math.round(innerW * 0.44);
                    const louverBayW = innerW - fanBayW - 10;
                    const fanX = isFanRight ? innerX + louverBayW + 10 : innerX;
                    const louverX = isFanRight ? innerX : innerX + fanBayW + 10;
                    const mullionX = isFanRight ? innerX + louverBayW : innerX + fanBayW;

                    return (
                      <g>
                        {/* Vertical Mullion */}
                        <rect x={mullionX} y={innerY} width="10" height={innerH} fill={c.profileFill} stroke={c.profileStroke} strokeWidth="1.2" />

                        {/* Exhaust Fan Bay */}
                        <rect x={fanX} y={innerY} width={fanBayW} height={innerH} fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
                        <circle cx={fanX + fanBayW / 2} cy={innerY + innerH / 2} r={Math.min(fanBayW, innerH) * 0.36} fill={isWhite ? '#ffffff' : '#020617'} stroke={c.steelFill} strokeWidth="1.5" />
                        {/* 4 Fan Blades */}
                        <line x1={fanX + fanBayW / 2 - 18} y1={innerY + innerH / 2} x2={fanX + fanBayW / 2 + 18} y2={innerY + innerH / 2} stroke={c.arrowFill} strokeWidth="3" strokeLinecap="round" />
                        <line x1={fanX + fanBayW / 2} y1={innerY + innerH / 2 - 18} x2={fanX + fanBayW / 2} y2={innerY + innerH / 2 + 18} stroke={c.arrowFill} strokeWidth="3" strokeLinecap="round" />
                        <circle cx={fanX + fanBayW / 2} cy={innerY + innerH / 2} r="5" fill={c.rollerWheel} />
                        <text x={fanX + fanBayW / 2} y={innerY + innerH - 8} fill={c.steelFill} fontSize="6.5" fontWeight="bold" textAnchor="middle">EXHAUST FAN</text>

                        {/* Louver Bay */}
                        <rect x={louverX} y={innerY} width={louverBayW} height={innerH} fill={c.glassFill} fillOpacity={c.glassFillOpacity} stroke={c.glassStroke} strokeWidth="1" />
                        {[0.2, 0.4, 0.6, 0.8].map((ratio, idx) => (
                          <line
                            key={`louver-line-${idx}`}
                            x1={louverX + 4}
                            y1={innerY + innerH * ratio}
                            x2={louverX + louverBayW - 4}
                            y2={innerY + innerH * ratio - 6}
                            stroke={c.lineDark}
                            strokeWidth="1.5"
                          />
                        ))}
                        <text x={louverX + louverBayW / 2} y={innerY + 14} fill={c.lineDark} fontSize="6.5" fontWeight="bold" textAnchor="middle">AIRFLOW LOUVERS</text>
                      </g>
                    );
                  } else {
                    // Standard Louver Ventilator
                    return (
                      <g>
                        <rect x={innerX} y={innerY} width={innerW} height={innerH} fill={c.glassFill} fillOpacity={c.glassFillOpacity} stroke={c.glassStroke} strokeWidth="1" />
                        {[0.16, 0.33, 0.5, 0.66, 0.83].map((ratio, idx) => (
                          <line
                            key={`std-louver-${idx}`}
                            x1={innerX + 6}
                            y1={innerY + innerH * ratio}
                            x2={innerX + innerW - 6}
                            y2={innerY + innerH * ratio - 8}
                            stroke={c.lineDark}
                            strokeWidth="1.6"
                          />
                        ))}
                        <text x={innerX + innerW / 2} y={innerY + innerH / 2} fill={c.steelFill} fontSize="8" fontWeight="bold" textAnchor="middle">
                          ADJUSTABLE GLASS LOUVERS (AIRFLOW)
                        </text>
                      </g>
                    );
                  }
                })()}
              </g>
            )}

            {/* ========================================================= */}
            {/* ARCHITECTURAL RED CUTTING-PLANE SECTION LINES             */}
            {/* ========================================================= */}
            {/* SECTION A-A CUT LINE (Horizontal with red bubbles & arrows) */}
            <g id="cut-line-a-a">
              <line
                x1={elevX - 22}
                y1={cutLineAY}
                x2={elevX + elevW + 22}
                y2={cutLineAY}
                stroke={c.sectionCut}
                strokeWidth="1.2"
                strokeDasharray="5 3"
              />
              {/* Left Bubble (A) */}
              <circle cx={elevX - 16} cy={cutLineAY} r="7.5" fill={c.sectionBubbleFill} stroke={c.sectionCut} strokeWidth="1.2" />
              <text x={elevX - 16} y={cutLineAY + 3} fill={c.sectionCut} fontSize="7" fontWeight="bold" textAnchor="middle">A</text>
              <line x1={elevX - 16} y1={cutLineAY + 7.5} x2={elevX - 16} y2={cutLineAY + 15} stroke={c.sectionCut} strokeWidth="1.2" markerEnd={`url(#${uniquePrefix}-sec-arrow)`} />

              {/* Right Bubble (A) */}
              <circle cx={elevX + elevW + 16} cy={cutLineAY} r="7.5" fill={c.sectionBubbleFill} stroke={c.sectionCut} strokeWidth="1.2" />
              <text x={elevX + elevW + 16} y={cutLineAY + 3} fill={c.sectionCut} fontSize="7" fontWeight="bold" textAnchor="middle">A</text>
              <line x1={elevX + elevW + 16} y1={cutLineAY + 7.5} x2={elevX + elevW + 16} y2={cutLineAY + 15} stroke={c.sectionCut} strokeWidth="1.2" markerEnd={`url(#${uniquePrefix}-sec-arrow)`} />
            </g>

            {/* SECTION B-B CUT LINE (Vertical with red bubbles & arrows - User image point!) */}
            <g id="cut-line-b-b">
              <line
                x1={cutLineBX}
                y1={elevY - 22}
                x2={cutLineBX}
                y2={elevY + elevH + 22}
                stroke={c.sectionCut}
                strokeWidth="1.2"
                strokeDasharray="5 3"
              />
              {/* Top Bubble (B) with rightward arrow */}
              <circle cx={cutLineBX} cy={elevY - 16} r="7.5" fill={c.sectionBubbleFill} stroke={c.sectionCut} strokeWidth="1.2" />
              <text x={cutLineBX} y={elevY - 13} fill={c.sectionCut} fontSize="7" fontWeight="bold" textAnchor="middle">B</text>
              <line x1={cutLineBX + 7.5} y1={elevY - 16} x2={cutLineBX + 15} y2={elevY - 16} stroke={c.sectionCut} strokeWidth="1.2" markerEnd={`url(#${uniquePrefix}-sec-arrow)`} />

              {/* Bottom Bubble (B) with rightward arrow */}
              <circle cx={cutLineBX} cy={elevY + elevH + 16} r="7.5" fill={c.sectionBubbleFill} stroke={c.sectionCut} strokeWidth="1.2" />
              <text x={cutLineBX} y={elevY + elevH + 19} fill={c.sectionCut} fontSize="7" fontWeight="bold" textAnchor="middle">B</text>
              <line x1={cutLineBX + 7.5} y1={elevY + elevH + 16} x2={cutLineBX + 15} y2={elevY + elevH + 16} stroke={c.sectionCut} strokeWidth="1.2" markerEnd={`url(#${uniquePrefix}-sec-arrow)`} />
            </g>
          </g>
        )}

        {/* ========================================================= */}
        {/* 2. SECTION B-B (VERTICAL PROFILE CUT THROUGH HEAD & SILL) */}
        {/* ========================================================= */}
        {(isAllInOne || isSectionBOnly) && (
          <g id="section-b-group">
            {/* Header Title */}
            <text
              x={secBX + secBW / 2}
              y={secBY - 38}
              fill={c.lineDark}
              fontSize="10"
              fontWeight="bold"
              letterSpacing="0.8"
              textAnchor="middle"
            >
              {t('செக்ஷன் B-B (குறுக்குவெட்டுத் தோற்றம்)', 'SECTION B-B (VERTICAL PROFILE CUT)')}
            </text>
            <text
              x={secBX + secBW / 2}
              y={secBY - 24}
              fill={c.lineLight}
              fontSize="7"
              fontFamily="monospace"
              textAnchor="middle"
            >
              HEAD, TOP GUIDE, SASH RAIL, ROLLER WHEEL & TRACK SILL
            </text>

            {/* Container */}
            <rect
              x={secBX}
              y={secBY - 14}
              width={secBW}
              height={secBH + 14}
              fill={isWhite ? '#ffffff' : '#070b14'}
              stroke={c.titleBorder}
              strokeWidth="0.8"
              rx="3"
            />

            {/* Top Head Frame Profile */}
            <rect x={secBX + 20} y={secBY} width={secBW - 40} height="36" fill={c.profileFill} stroke={c.profileStroke} strokeWidth="1.2" />
            <rect x={secBX + 35} y={secBY + 6} width={secBW - 70} height="24" fill={c.steelFill} fillOpacity="0.8" />
            <text x={secBX + secBW / 2} y={secBY + 21} fill="#ffffff" fontSize="6.5" fontWeight="bold" textAnchor="middle">STEEL REINFORCEMENT</text>
            <text x={secBX + 14} y={secBY + 18} fill={c.lineMedium} fontSize="6" textAnchor="end">Head</text>

            {/* Top Sash Rails */}
            <rect x={secBX + 35} y={secBY + 42} width="45" height="28" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
            <rect x={secBX + 45} y={secBY + 46} width="16" height="18" fill={c.steelFill} fillOpacity="0.7" />

            <rect x={secBX + 95} y={secBY + 42} width="45" height="28" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
            <rect x={secBX + 105} y={secBY + 46} width="16" height="18" fill={c.steelFill} fillOpacity="0.7" />

            {/* Vertical Glass Ribbons */}
            <rect x={secBX + 55} y={secBY + 70} width="4" height={secBH - 170} fill={c.glassFill} stroke={c.glassStroke} strokeWidth="0.8" />
            <rect x={secBX + 115} y={secBY + 70} width="4" height={secBH - 170} fill={c.glassFill} stroke={c.glassStroke} strokeWidth="0.8" />

            {/* Break-lines (standard architectural zig-zag) */}
            <path
              d={`M ${secBX + 20} ${secBY + secBH / 2 - 10} L ${secBX + 80} ${secBY + secBH / 2 - 10} L ${secBX + 90} ${secBY + secBH / 2 - 18} L ${secBX + 100} ${secBY + secBH / 2 - 2} L ${secBX + 110} ${secBY + secBH / 2 - 10} L ${secBX + secBW - 20} ${secBY + secBH / 2 - 10}`}
              fill="none"
              stroke={c.lineDark}
              strokeWidth="0.9"
            />
            <path
              d={`M ${secBX + 20} ${secBY + secBH / 2 + 10} L ${secBX + 80} ${secBY + secBH / 2 + 10} L ${secBX + 90} ${secBY + secBH / 2 + 2} L ${secBX + 100} ${secBY + secBH / 2 + 18} L ${secBX + 110} ${secBY + secBH / 2 + 10} L ${secBX + secBW - 20} ${secBY + secBH / 2 + 10}`}
              fill="none"
              stroke={c.lineDark}
              strokeWidth="0.9"
            />

            {/* Bottom Sash Rails with Roller Wheels */}
            <rect x={secBX + 35} y={secBY + secBH - 78} width="45" height="34" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
            {/* Roller Wheel 1 */}
            <circle cx={secBX + 57.5} cy={secBY + secBH - 44} r="8" fill={c.rollerWheel} stroke={c.rollerStroke} strokeWidth="1" />
            <circle cx={secBX + 57.5} cy={secBY + secBH - 44} r="2.5" fill={c.steelFill} />

            <rect x={secBX + 95} y={secBY + secBH - 78} width="45" height="34" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
            {/* Roller Wheel 2 */}
            <circle cx={secBX + 117.5} cy={secBY + secBH - 44} r="8" fill={c.rollerWheel} stroke={c.rollerStroke} strokeWidth="1" />
            <circle cx={secBX + 117.5} cy={secBY + secBH - 44} r="2.5" fill={c.steelFill} />

            {/* Bottom Multi-Track Sill Profile */}
            <rect x={secBX + 20} y={secBY + secBH - 44} width={secBW - 40} height="40" fill={c.profileFill} stroke={c.profileStroke} strokeWidth="1.2" />
            {/* Track 1 SS Rail */}
            <path d={`M ${secBX + 54} ${secBY + secBH - 44} L ${secBX + 54} ${secBY + secBH - 48} L ${secBX + 61} ${secBY + secBH - 48} L ${secBX + 61} ${secBY + secBH - 44} Z`} fill={c.steelFill} />
            {/* Track 2 SS Rail */}
            <path d={`M ${secBX + 114} ${secBY + secBH - 44} L ${secBX + 114} ${secBY + secBH - 48} L ${secBX + 121} ${secBY + secBH - 48} L ${secBX + 121} ${secBY + secBH - 44} Z`} fill={c.steelFill} />

            {/* Drainage Weep Hole / Chamber */}
            <rect x={secBX + 35} y={secBY + secBH - 36} width={secBW - 70} height="24" fill={c.steelFill} fillOpacity="0.8" />
            <circle cx={secBX + 30} cy={secBY + secBH - 20} r="3" fill="none" stroke={c.dimLine} strokeWidth="0.8" />
            <text x={secBX + 14} y={secBY + secBH - 22} fill={c.lineMedium} fontSize="6" textAnchor="end">Sill</text>

            <text x={secBX + 57.5} y={secBY + secBH + 8} fill={c.lineDark} fontSize="6.5" fontWeight="bold" textAnchor="middle">Track 1</text>
            <text x={secBX + 117.5} y={secBY + secBH + 8} fill={c.lineDark} fontSize="6.5" fontWeight="bold" textAnchor="middle">Track 2</text>
          </g>
        )}

        {/* ========================================================= */}
        {/* 3. SECTION A-A (HORIZONTAL PLAN CUT)                      */}
        {/* ========================================================= */}
        {(isAllInOne || isSectionAOnly) && (
          <g id="section-a-group">
            {/* Section A-A Header */}
            <text
              x={secAX + secAW / 2}
              y={secAY - 10}
              fill={c.lineDark}
              fontSize="10"
              fontWeight="bold"
              letterSpacing="0.8"
              textAnchor="middle"
            >
              {t('செக்ஷன் A-A (கிடைமட்ட பிளான் தோற்றம்)', 'SECTION A-A (HORIZONTAL PLAN CUT)')}
            </text>
            <text
              x={secAX + secAW / 2}
              y={secAY}
              fill={c.lineLight}
              fontSize="7"
              fontFamily="monospace"
              textAnchor="middle"
            >
              WALL CONTACT, JAMBS, STILES & INTERLOCK MEETING REINFORCEMENTS
            </text>

            {/* Container */}
            <rect
              x={secAX}
              y={secAY + 6}
              width={secAW}
              height={secAH - 6}
              fill={isWhite ? '#ffffff' : '#070b14'}
              stroke={c.titleBorder}
              strokeWidth="0.8"
              rx="3"
            />

            {/* Left Frame Jamb */}
            <rect x={secAX + 10} y={secAY + 20} width="40" height={secAH - 44} fill={c.profileFill} stroke={c.profileStroke} strokeWidth="1.2" />
            <rect x={secAX + 16} y={secAY + 26} width="24" height={(secAH - 44) * 0.5} fill={c.steelFill} fillOpacity="0.8" />
            <line x1={secAX + 10} y1={secAY + 14} x2={secAX + 10} y2={secAY + secAH - 14} stroke={c.lineDark} strokeWidth="1.5" />
            <text x={secAX + 30} y={secAY + secAH - 12} fill={c.lineMedium} fontSize="6.5" textAnchor="middle">Left Jamb</text>

            {/* Left Outer Sash Stile */}
            <rect x={secAX + 54} y={secAY + 28} width="26" height="28" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
            {/* Woolpile Weatherseal */}
            <line x1={secAX + 52} y1={secAY + 30} x2={secAX + 52} y2={secAY + 54} stroke={c.lineDark} strokeWidth="2" strokeDasharray="2 1" />

            {/* Left Glass Span */}
            <rect x={secAX + 80} y={secAY + 40} width={secAW / 2 - 120} height="4" fill={c.glassFill} stroke={c.glassStroke} strokeWidth="0.8" />

            {/* Center Meeting Interlock Stiles (J-Hook Overlap) */}
            {(() => {
              const midX = secAX + secAW / 2;
              return (
                <g id="interlock-detail">
                  {/* Outer Interlock Stile */}
                  <rect x={midX - 22} y={secAY + 28} width="22" height="28" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
                  <path d={`M ${midX} ${secAY + 30} L ${midX + 6} ${secAY + 30} L ${midX + 6} ${secAY + 42} L ${midX + 2} ${secAY + 42}`} fill="none" stroke={c.profileStroke} strokeWidth="1.2" />

                  {/* Inner Interlock Stile */}
                  <rect x={midX} y={secAY + 42} width="22" height="28" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />
                  <path d={`M ${midX} ${secAY + 68} L ${midX - 6} ${secAY + 68} L ${midX - 6} ${secAY + 56} L ${midX - 2} ${secAY + 56}`} fill="none" stroke={c.profileStroke} strokeWidth="1.2" />

                  {/* Woolpile weatherstrip in interlock */}
                  <line x1={midX - 3} y1={secAY + 32} x2={midX - 3} y2={secAY + 52} stroke={c.lineDark} strokeWidth="2" strokeDasharray="2 1" />
                  <text x={midX} y={secAY + 80} fill={c.steelFill} fontSize="6.5" fontWeight="bold" textAnchor="middle">
                    Interlock Hooks
                  </text>
                </g>
              );
            })()}

            {/* Right Glass Span */}
            <rect x={secAX + secAW / 2 + 22} y={secAY + 54} width={secAW / 2 - 120} height="4" fill={c.glassFill} stroke={c.glassStroke} strokeWidth="0.8" />

            {/* Right Outer Sash Stile */}
            <rect x={secAX + secAW - 80} y={secAY + 42} width="26" height="28" fill={c.profileFillDark} stroke={c.profileStroke} strokeWidth="1" />

            {/* Right Frame Jamb */}
            <rect x={secAX + secAW - 50} y={secAY + 20} width="40" height={secAH - 44} fill={c.profileFill} stroke={c.profileStroke} strokeWidth="1.2" />
            <rect x={secAX + secAW - 44} y={secAY + 26} width="24" height={(secAH - 44) * 0.5} fill={c.steelFill} fillOpacity="0.8" />
            <line x1={secAX + secAW - 10} y1={secAY + 14} x2={secAX + secAW - 10} y2={secAY + secAH - 14} stroke={c.lineDark} strokeWidth="1.5" />
            <text x={secAX + secAW - 30} y={secAY + secAH - 12} fill={c.lineMedium} fontSize="6.5" textAnchor="middle">Right Jamb</text>
          </g>
        )}
      </svg>
    );
  };

  return (
    <div className="visualizer-container">
      {/* Studio Header & Global Controls */}
      <div className="visualizer-header">
        <div className="visualizer-title-group">
          <Layers className="w-5 h-5 text-blue-500" />
          <h3 className="visualizer-title">
            <span>{t('2D ஆர்க்கிடெக்சரல் வரைபடங்கள்', '2D Architectural CAD Blueprints')}</span>
          </h3>
          <span className="visualizer-badge">PRO CAD</span>
          {customerSerial && (
            <span
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {customerSerial}
            </span>
          )}
        </div>

        {/* Action & Theme Controls */}
        <div className="visualizer-controls">
          {/* Theme Selector */}
          <div className="visualizer-pill-group">
            <button
              type="button"
              onClick={() => setCadTheme('white')}
              className={`visualizer-pill-btn ${cadTheme === 'white' ? 'active-white' : ''}`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('CAD ஒயிட்', 'CAD White')}</span>
            </button>
            <button
              type="button"
              onClick={() => setCadTheme('blueprint')}
              className={`visualizer-pill-btn ${cadTheme === 'blueprint' ? 'active-blueprint' : ''}`}
            >
              <Moon className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('ப்ளூபிரிண்ட்', 'Blueprint')}</span>
            </button>
          </div>

          {/* Mode Selector */}
          <div className="visualizer-pill-group">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`visualizer-pill-btn ${viewMode === 'single' ? 'active-blueprint' : ''}`}
            >
              <span>{t('ஒற்றை', 'Single')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className={`visualizer-pill-btn ${viewMode === 'gallery' ? 'active-blueprint' : ''}`}
            >
              <span>{t(`அனைத்தும் (${results.length})`, `All (${results.length})`)}</span>
            </button>
          </div>

          {/* Export Actions */}
          <button
            type="button"
            className="visualizer-action-btn"
            onClick={handleDownloadSVG}
            title="Download Vector SVG"
          >
            <Download className="w-3.5 h-3.5" />
            <span>SVG</span>
          </button>

          <button
            type="button"
            className="visualizer-action-btn"
            onClick={handleExportCADPDF}
            disabled={isExportingPDF}
            title="Export Architectural CAD Blueprint PDF"
            style={{ backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#3b82f6' }}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isExportingPDF ? t('தயாராகிறது...', 'Generating PDF...') : t('CAD PDF ஏற்றுமதி', 'Export CAD PDF')}</span>
          </button>
        </div>
      </div>

      {/* Window Tabs Bar (Single Mode) */}
      {viewMode === 'single' && (
        <div className="visualizer-nav-bar">
          {results.map((r, idx) => {
            const isSel = idx === selectedIndex;
            const rColor = getModelColor(r.input?.modelId, r.input?.identificationColor);
            const label = r.input?.windowLabel || `W${idx + 1}`;
            return (
              <button
                key={r.id || idx}
                type="button"
                className={`visualizer-nav-tab ${isSel ? 'active' : ''}`}
                onClick={() => onSelectIndex(idx)}
              >
                <span className="visualizer-color-dot" style={{ backgroundColor: rColor }} />
                <span>{label}</span>
                <span style={{ fontSize: '10px', opacity: 0.85, fontFamily: 'monospace' }}>
                  {r.convertedHeightMM}×{r.convertedWidthMM}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Window Subtitle & Architectural CAD View Selection Pills */}
      {viewMode === 'single' && (
        <div className="visualizer-view-bar">
          <div className="visualizer-active-info">
            <span
              className="visualizer-model-tag"
              style={{
                backgroundColor: activeColor,
                color: '#0f172a',
                border: '1px solid rgba(0, 0, 0, 0.15)',
              }}
            >
              {modelDef.name}
            </span>
            <span className="visualizer-dim-tag">
              {`${currentResult.input.windowLabel || `W${selectedIndex + 1}`} • ${currentResult.convertedHeightMM} × ${currentResult.convertedWidthMM} mm (${currentResult.input.heightInch}" H × ${currentResult.input.widthInch}" W)`}
            </span>
          </div>

          {/* Architectural CAD View Selection Pills */}
          <div className="visualizer-cad-views">
            <button
              type="button"
              onClick={() => setCadView('all_in_one')}
              className={`visualizer-view-btn ${cadView === 'all_in_one' ? 'active' : ''}`}
              title="All-in-One Architectural Sheet: Elevation + Section A-A + Section B-B"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>{t('முழு CAD தாள்', 'All-in-One CAD')}</span>
            </button>

            <button
              type="button"
              onClick={() => setCadView('elevation')}
              className={`visualizer-view-btn ${cadView === 'elevation' ? 'active' : ''}`}
              title="Maximized Front Elevation View"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{t('முகப்புத் தோற்றம்', 'Elevation')}</span>
            </button>

            <button
              type="button"
              onClick={() => setCadView('section_a')}
              className={`visualizer-view-btn ${cadView === 'section_a' ? 'active' : ''}`}
              title="Section A-A: Horizontal Plan Cross-Section"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>{t('செக்ஷன் A-A (பிளான்)', 'Section A-A (Plan)')}</span>
            </button>

            <button
              type="button"
              onClick={() => setCadView('section_b')}
              className={`visualizer-view-btn ${cadView === 'section_b' ? 'active' : ''}`}
              title="Section B-B: Vertical Profile Cross-Section"
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" />
              <span>{t('செக்ஷன் B-B (செங்குத்து)', 'Section B-B (Vertical)')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Drawing Stage */}
      <div className={`visualizer-stage theme-${cadTheme}`}>
        {viewMode === 'single' ? (
          <div className="visualizer-single-stage">
            {renderArchitecturalSheet(currentResult, 'main')}
          </div>
        ) : (
          <div className="visualizer-gallery-grid">
            {results.map((r, i) => (
              <div
                key={r.id || i}
                className="visualizer-gallery-card"
                onClick={() => {
                  onSelectIndex(i);
                  setViewMode('single');
                }}
              >
                <div className="visualizer-gallery-header">
                  <strong>{r.input.windowLabel || `W${i + 1}`}</strong>
                  <span>{r.convertedHeightMM} × {r.convertedWidthMM} mm</span>
                </div>
                {renderArchitecturalSheet(r, `gal-${i}`)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Specs Footer Bar */}
      <div className="visualizer-spec-bar">
        <div className="visualizer-spec-card">
          <span className="visualizer-spec-label">{t('வெளிப்புற சட்டம்', 'Outer Frame')}</span>
          <span className="visualizer-spec-value">
            {currentResult.convertedHeightMM} × {currentResult.convertedWidthMM} mm
          </span>
          <span className="visualizer-spec-sub">{modelDef.material}</span>
        </div>

        <div className="visualizer-spec-card">
          <span className="visualizer-spec-label">{t('ஷட்டர் கட்டிங்', 'Sash Cut')}</span>
          <span className="visualizer-spec-value">
            {currentResult.panel.heightMM > 0
              ? `${currentResult.panel.heightMM} × ${currentResult.panel.widthMM} mm`
              : '-'}
          </span>
          <span className="visualizer-spec-sub">
            {currentResult.panel.count > 0 ? `${currentResult.panel.count * 2} pcs (45° Mitre)` : '-'}
          </span>
        </div>

        {currentResult.interlockMM && (
          <div className="visualizer-spec-card">
            <span className="visualizer-spec-label">{t('இன்டர்லாக்', 'Interlock')}</span>
            <span className="visualizer-spec-value">{currentResult.interlockMM} mm</span>
            <span className="visualizer-spec-sub">{t('உல்பைல் பிரஷ்', 'Woolpile Brush')}</span>
          </div>
        )}

        <div className="visualizer-spec-card">
          <span className="visualizer-spec-label">{t('கண்ணாடி அளவு', 'Glass Cut')}</span>
          <span className="visualizer-spec-value">
            {currentResult.mirror && currentResult.mirror.count > 0
              ? `${currentResult.mirror.heightMM} × ${currentResult.mirror.widthMM} mm`
              : '-'}
          </span>
          <span className="visualizer-spec-sub">
            {currentResult.mirror && currentResult.mirror.count > 0
              ? `${currentResult.mirror.count} pcs (${currentResult.mirror.glassType || '5mm'})`
              : '-'}
          </span>
        </div>
      </div>
    </div>
  );
};
