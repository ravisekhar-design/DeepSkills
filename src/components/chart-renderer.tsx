"use client";

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar,
  FunnelChart, Funnel, LabelList,
  ComposedChart, ReferenceLine,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { GeneratedChartConfig } from '@/ai/flows/chart-generation';

interface ChartRendererProps {
  config: GeneratedChartConfig;
  height?: number;
  onDataPointClick?: (column: string, value: string | number) => void;
}

const CHART_COLORS = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];

const RADIAN = Math.PI / 180;
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: 12,
  },
};

const commonAxisProps = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--border))' },
  tickLine: false,
};

const commonGridProps = {
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border))',
  opacity: 0.4,
};

// ── Color interpolation for heatmap ───────────────────────────────────────────
function lerpColor(t: number, from = [15, 15, 26], to = [99, 102, 241]): string {
  const r = Math.round(from[0] + t * (to[0] - from[0]));
  const g = Math.round(from[1] + t * (to[1] - from[1]));
  const b = Math.round(from[2] + t * (to[2] - from[2]));
  return `rgb(${r},${g},${b})`;
}

export function ChartRenderer({ config, height = 260, onDataPointClick }: ChartRendererProps) {
  const { chartType, xKey, series, data } = config;
  const showLabels = config.showLabels ?? false;

  const handleBarClick = (payload: any) => {
    if (!onDataPointClick || !payload?.activePayload?.[0]?.payload) return;
    const row = payload.activePayload[0].payload;
    if (row[xKey] != null) onDataPointClick(xKey, row[xKey]);
  };

  const handlePieClick = (entry: any) => {
    if (!onDataPointClick) return;
    if (entry?.name != null) onDataPointClick(xKey, entry.name);
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  // ── KPI (single big number) ────────────────────────────────────────────────
  if (chartType === 'kpi') {
    const dk = series[0]?.dataKey ?? xKey;
    const raw = data[0]?.[dk];
    const val = raw == null ? '—' : typeof raw === 'number'
      ? raw >= 1_000_000 ? `${(raw / 1_000_000).toFixed(2)}M`
        : raw >= 1_000 ? `${(raw / 1_000).toFixed(1)}K`
        : Number.isInteger(raw) ? raw.toString() : raw.toFixed(2)
      : String(raw);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ minHeight: height }}>
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{series[0]?.name || config.title}</p>
        <p className="text-6xl font-bold tabular-nums tracking-tight" style={{ color: series[0]?.color || '#6366f1' }}>{val}</p>
        {data.length > 1 && (
          <p className="text-xs text-muted-foreground">{data.length.toLocaleString()} records</p>
        )}
      </div>
    );
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  if (chartType === 'table') {
    const cols = data.length > 0 ? Object.keys(data[0]) : [];
    return (
      <div className="overflow-auto w-full" style={{ maxHeight: height }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {cols.map(c => (
                <th key={c} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 500).map((row: any, ri: number) => (
              <tr key={ri} className="border-b border-border/50 hover:bg-muted/20">
                {cols.map(c => (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                    {row[c] == null ? <span className="text-muted-foreground/50">—</span> : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 500 && (
          <p className="text-[10px] text-muted-foreground text-center py-2">Showing 500 of {data.length.toLocaleString()} rows</p>
        )}
      </div>
    );
  }

  // ── Pie / Donut ────────────────────────────────────────────────────────────
  if (chartType === 'pie' || chartType === 'donut') {
    const pieData = data.map((row: any) => ({
      name: row[xKey],
      value: Number(row[series[0]?.dataKey] ?? 0),
    }));
    const innerRadius = chartType === 'donut' ? '45%' : 0;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderPieLabel}
            innerRadius={innerRadius}
            outerRadius="75%"
            dataKey="value"
            onClick={handlePieClick}
            style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
          >
            {pieData.map((_: any, index: number) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ── Line ───────────────────────────────────────────────────────────────────
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} onClick={handleBarClick} style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={showLabels ? { r: 3, fill: s.color } : false}
              label={showLabels ? { position: 'top', fontSize: 9, fill: 'hsl(var(--muted-foreground))' } : undefined}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ── Area ───────────────────────────────────────────────────────────────────
  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} onClick={handleBarClick} style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.dataKey} id={`grad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color}
              fill={`url(#grad-${s.dataKey})`}
              strokeWidth={2}
              dot={showLabels ? { r: 3, fill: s.color } : false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ── Stacked Bar ────────────────────────────────────────────────────────────
  if (chartType === 'stacked_bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} stackId="stack">
              {showLabels && <LabelList dataKey={s.dataKey} position="inside" fontSize={9} fill="rgba(255,255,255,0.8)" />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Horizontal Bar ─────────────────────────────────────────────────────────
  if (chartType === 'horizontal_bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: showLabels ? 40 : 16, bottom: 4, left: 4 }}>
          <CartesianGrid {...commonGridProps} horizontal={false} />
          <XAxis type="number" {...commonAxisProps} />
          <YAxis type="category" dataKey={xKey} {...commonAxisProps} width={80} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[0, 4, 4, 0]}>
              {showLabels && <LabelList dataKey={s.dataKey} position="right" fontSize={9} fill="hsl(var(--muted-foreground))" />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Scatter ────────────────────────────────────────────────────────────────
  if (chartType === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis type="number" dataKey="x" name={xKey} {...commonAxisProps} label={{ value: xKey, position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis type="number" dataKey="y" name={series[0]?.name} {...commonAxisProps} width={40} />
          <ZAxis range={[30, 30]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Scatter
              key={s.dataKey}
              name={s.name}
              data={data.map((row: any) => ({ x: Number(row[xKey]), y: Number(row[s.dataKey]) }))}
              fill={s.color}
              opacity={0.8}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ── Bubble ─────────────────────────────────────────────────────────────────
  if (chartType === 'bubble') {
    const xDk = series[0]?.dataKey ?? '';
    const yDk = series[1]?.dataKey ?? '';
    const zDk = series[2]?.dataKey ?? '';
    const bubbleData = data.map((row: any) => ({
      name: String(row[xKey] ?? ''),
      x: Number(row[xDk] ?? 0),
      y: Number(row[yDk] ?? 0),
      z: zDk ? Number(row[zDk] ?? 1) : 1,
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis type="number" dataKey="x" name={series[0]?.name || xDk} {...commonAxisProps} label={{ value: series[0]?.name || xDk, position: 'insideBottom', offset: -14, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis type="number" dataKey="y" name={series[1]?.name || yDk} {...commonAxisProps} width={40} />
          <ZAxis type="number" dataKey="z" range={[20, 400]} name={series[2]?.name || zDk || 'size'} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} {...tooltipStyle} />
          <Scatter data={bubbleData} fill={series[0]?.color || CHART_COLORS[0]} opacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ── Radar ──────────────────────────────────────────────────────────────────
  if (chartType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey={xKey} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
          {series.map((s) => (
            <Radar key={s.dataKey} name={s.name} dataKey={s.dataKey} stroke={s.color} fill={s.color} fillOpacity={0.25} />
          ))}
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Tooltip {...tooltipStyle} />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  // ── Treemap ────────────────────────────────────────────────────────────────
  if (chartType === 'treemap') {
    const treemapData = data.map((row: any, i: number) => ({
      name: String(row[xKey] ?? ''),
      value: Number(row[series[0]?.dataKey] ?? 0),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
    const TreemapCell = (props: any) => {
      const { x, y, width, height: h, name, value, fill } = props;
      if (width < 30 || h < 20) return <rect x={x} y={y} width={width} height={h} fill={fill} />;
      return (
        <g>
          <rect x={x} y={y} width={width} height={h} fill={fill} rx={4} />
          <text x={x + width / 2} y={y + h / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600}>
            {width > 50 ? String(name).slice(0, Math.floor(width / 8)) : ''}
          </text>
          <text x={x + width / 2} y={y + h / 2 + 8} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={10}>
            {width > 50 ? String(value) : ''}
          </text>
        </g>
      );
    };
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={treemapData}
          dataKey="value"
          stroke="hsl(var(--background))"
          content={<TreemapCell /> as any}
        />
      </ResponsiveContainer>
    );
  }

  // ── Funnel ─────────────────────────────────────────────────────────────────
  if (chartType === 'funnel') {
    const funnelData = data
      .map((row: any, i: number) => ({
        name: String(row[xKey] ?? ''),
        value: Number(row[series[0]?.dataKey] ?? 0),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a: any, b: any) => b.value - a.value);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip {...tooltipStyle} />
          <Funnel dataKey="value" data={funnelData} isAnimationActive>
            <LabelList position="center" fill="#fff" stroke="none" dataKey="name" fontSize={11} fontWeight={600} />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  // ── Waterfall ──────────────────────────────────────────────────────────────
  if (chartType === 'waterfall') {
    let running = 0;
    const wfData = data.map((row: any) => {
      const v = Number(row[series[0]?.dataKey] ?? 0);
      const isNeg = v < 0;
      const base = isNeg ? running + v : running;
      running += v;
      return {
        [xKey]: row[xKey],
        __base: base < 0 ? 0 : base,
        __bar: Math.abs(v),
        __isNeg: isNeg,
        __total: running,
      };
    });
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={wfData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip
            {...tooltipStyle}
            formatter={(_: any, __: string, props: any) => {
              const entry = wfData[props.index];
              return [entry?.__isNeg ? `-${entry?.__bar}` : `+${entry?.__bar}`, series[0]?.name || 'Value'];
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          {/* Transparent base offset */}
          <Bar dataKey="__base" fill="transparent" stackId="wf" isAnimationActive={false} />
          {/* Actual value bar */}
          <Bar dataKey="__bar" stackId="wf" radius={[3, 3, 0, 0]}>
            {wfData.map((entry, index) => (
              <Cell key={index} fill={entry.__isNeg ? '#ef4444' : '#22d3ee'} />
            ))}
            {showLabels && <LabelList dataKey="__bar" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Heatmap ────────────────────────────────────────────────────────────────
  if (chartType === 'heatmap') {
    const xCats = data.map((row: any) => String(row[xKey] ?? ''));
    const yCats = series.map(s => s.name);
    if (xCats.length === 0 || yCats.length === 0) {
      return <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Add Group By to build the Y axis</div>;
    }
    const allValues = data.flatMap((row: any) => series.map(s => Number(row[s.dataKey] ?? 0)));
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);

    const padL = 80, padT = 30, padR = 20, padB = 30;
    const cellW = Math.max(30, Math.min(60, Math.floor((500 - padL - padR) / xCats.length)));
    const cellH = Math.max(24, Math.min(48, Math.floor((height - padT - padB) / yCats.length)));
    const svgW = padL + xCats.length * cellW + padR;
    const svgH = padT + yCats.length * cellH + padB;

    return (
      <div className="w-full overflow-x-auto">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
          {/* X axis labels */}
          {xCats.map((cat, xi) => (
            <text
              key={xi}
              x={padL + xi * cellW + cellW / 2}
              y={padT - 6}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize={9}
            >
              {String(cat).slice(0, Math.max(3, Math.floor(cellW / 7)))}
            </text>
          ))}
          {/* Y axis labels */}
          {yCats.map((cat, yi) => (
            <text
              key={yi}
              x={padL - 6}
              y={padT + yi * cellH + cellH / 2 + 4}
              textAnchor="end"
              fill="hsl(var(--muted-foreground))"
              fontSize={10}
            >
              {String(cat).slice(0, 10)}
            </text>
          ))}
          {/* Cells */}
          {yCats.map((_, yi) =>
            xCats.map((__, xi) => {
              const val = Number(data[xi]?.[series[yi]?.dataKey] ?? 0);
              const t = maxVal === minVal ? 0.5 : (val - minVal) / (maxVal - minVal);
              return (
                <g key={`${yi}-${xi}`}>
                  <rect
                    x={padL + xi * cellW + 1}
                    y={padT + yi * cellH + 1}
                    width={cellW - 2}
                    height={cellH - 2}
                    fill={lerpColor(t)}
                    rx={3}
                  >
                    <title>{`${yCats[yi]} / ${xCats[xi]}: ${val}`}</title>
                  </rect>
                  {cellW > 32 && cellH > 18 && (
                    <text
                      x={padL + xi * cellW + cellW / 2}
                      y={padT + yi * cellH + cellH / 2 + 4}
                      textAnchor="middle"
                      fill={t > 0.6 ? 'rgba(255,255,255,0.9)' : 'hsl(var(--muted-foreground))'}
                      fontSize={9}
                    >
                      {Number.isInteger(val) ? val : val.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })
          )}
          {/* Color legend */}
          <defs>
            <linearGradient id="hm-legend" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={lerpColor(0)} />
              <stop offset="100%" stopColor={lerpColor(1)} />
            </linearGradient>
          </defs>
          <rect x={padL} y={svgH - padB + 8} width={xCats.length * cellW} height={6} fill="url(#hm-legend)" rx={3} />
          <text x={padL} y={svgH - 2} fill="hsl(var(--muted-foreground))" fontSize={8}>{minVal}</text>
          <text x={padL + xCats.length * cellW} y={svgH - 2} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={8}>{maxVal}</text>
        </svg>
      </div>
    );
  }

  // ── Gauge ──────────────────────────────────────────────────────────────────
  if (chartType === 'gauge') {
    const value = Number(data[0]?.[series[0]?.dataKey] ?? 0);
    // Max value: from series[1] if provided, else max across all data rows
    const maxValue = series[1]
      ? Number(data[0]?.[series[1].dataKey] ?? 100)
      : Math.max(...data.map((r: any) => Number(r[series[0]?.dataKey] ?? 0)), 1);
    const minValue = 0;
    const range = maxValue - minValue || 1;
    const pct = Math.min(1, Math.max(0, (value - minValue) / range));

    const cx = 150, cy = 120, r = 90;
    // Math angle (0=right,90=up,180=left) for pct: angle = π*(1-pct)
    const vAngle = Math.PI * (1 - pct);
    const vx = cx + r * Math.cos(vAngle);
    const vy = cy - r * Math.sin(vAngle);

    // Needle tip shorter
    const nr = r * 0.85;
    const nx = cx + nr * Math.cos(vAngle);
    const ny = cy - nr * Math.sin(vAngle);

    // Gauge colors by threshold

    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <svg viewBox="0 0 300 160" width="100%" height={height} style={{ maxWidth: height * 1.9 }}>
          {/* Background arc */}
          <path
            d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={18}
            strokeLinecap="round"
          />
          {/* Colored value arc */}
          {pct > 0.005 && (
            <path
              d={`M ${cx - r},${cy} A ${r},${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${vx},${vy}`}
              fill="none"
              stroke={pct < 0.33 ? '#22d3ee' : pct < 0.66 ? '#a3e635' : '#ef4444'}
              strokeWidth={18}
              strokeLinecap="round"
            />
          )}
          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="white"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Center circle */}
          <circle cx={cx} cy={cy} r={7} fill="#6366f1" />
          <circle cx={cx} cy={cy} r={3} fill="white" />
          {/* Value text */}
          <text x={cx} y={cy + 26} textAnchor="middle" fill="white" fontSize={22} fontWeight="bold">
            {Number.isInteger(value) ? value : value.toFixed(2)}
          </text>
          <text x={cx} y={cy + 40} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10}>
            {series[0]?.name || 'Value'}
          </text>
          {/* Min / Max labels */}
          <text x={cx - r - 4} y={cy + 16} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={9}>{minValue}</text>
          <text x={cx + r + 4} y={cy + 16} textAnchor="start" fill="hsl(var(--muted-foreground))" fontSize={9}>{maxValue}</text>
          {/* Title */}
          <text x={cx} y={24} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11} fontWeight={600}>
            {config.title}
          </text>
        </svg>
      </div>
    );
  }

  // ── Sankey ─────────────────────────────────────────────────────────────────
  if (chartType === 'sankey') {
    const targetKey = config.targetKey;
    const valueDk = series[0]?.dataKey ?? '';
    if (!targetKey || !valueDk) {
      return <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Configure Source, Target, and Flow Value fields</div>;
    }

    // Aggregate flows
    const flowMap = new Map<string, number>();
    const srcMap = new Map<string, number>();
    const tgtMap = new Map<string, number>();
    for (const row of data) {
      const src = String(row[xKey] ?? '');
      const tgt = String(row[targetKey] ?? '');
      const val = Number(row[valueDk] ?? 0);
      const key = `${src}||${tgt}`;
      flowMap.set(key, (flowMap.get(key) || 0) + val);
      srcMap.set(src, (srcMap.get(src) || 0) + val);
      tgtMap.set(tgt, (tgtMap.get(tgt) || 0) + val);
    }

    const sources = Array.from(srcMap.entries());
    const targets = Array.from(tgtMap.entries());
    const totalFlow = sources.reduce((s, [, v]) => s + v, 0) || 1;

    const W = 500, H = height;
    const padT = 10, padB = 10, padL = 10, padR = 10;
    const nodeW = 18, gap = 8;
    const availH = H - padT - padB;

    function layoutNodes(nodes: [string, number][], xPos: number) {
      const totalGap = gap * Math.max(0, nodes.length - 1);
      const totalNodeH = availH - totalGap;
      let y = padT;
      return nodes.map(([name, value], i) => {
        const h = Math.max(8, (value / totalFlow) * totalNodeH);
        const node = { name, value, x: xPos, y, w: nodeW, h, color: CHART_COLORS[i % CHART_COLORS.length] };
        y += h + gap;
        return node;
      });
    }

    const srcNodes = layoutNodes(sources, padL);
    const tgtNodes = layoutNodes(targets, W - padR - nodeW);

    // Compute link offsets within nodes
    const srcOffsets = new Map(srcNodes.map(n => [n.name, { used: 0, h: n.h }]));
    const tgtOffsets = new Map(tgtNodes.map(n => [n.name, { used: 0, h: n.h }]));

    const links: { path: string; color: string; opacity: number }[] = [];
    for (const [key, val] of flowMap) {
      const [src, tgt] = key.split('||');
      const sNode = srcNodes.find(n => n.name === src);
      const tNode = tgtNodes.find(n => n.name === tgt);
      if (!sNode || !tNode) continue;

      const sOff = srcOffsets.get(src)!;
      const tOff = tgtOffsets.get(tgt)!;
      const lh = (val / totalFlow) * availH;

      const sx = sNode.x + nodeW;
      const sy1 = sNode.y + (sOff.used / sNode.value) * sNode.h;
      const sy2 = sy1 + lh;
      const tx = tNode.x;
      const ty1 = tNode.y + (tOff.used / tNode.value) * tNode.h;
      const ty2 = ty1 + lh;
      const midX = (sx + tx) / 2;

      const path = `M ${sx},${sy1} C ${midX},${sy1} ${midX},${ty1} ${tx},${ty1} L ${tx},${ty2} C ${midX},${ty2} ${midX},${sy2} ${sx},${sy2} Z`;
      links.push({ path, color: sNode.color, opacity: 0.35 });

      sOff.used += val;
      tOff.used += val;
    }

    return (
      <div style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          {/* Links */}
          {links.map((link, i) => (
            <path key={i} d={link.path} fill={link.color} opacity={link.opacity} stroke={link.color} strokeWidth={0.5} />
          ))}
          {/* Source nodes */}
          {srcNodes.map((n, i) => (
            <g key={`s${i}`}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={n.color} rx={3} />
              <text x={n.x + n.w + 4} y={n.y + n.h / 2 + 4} fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{n.name}</text>
            </g>
          ))}
          {/* Target nodes */}
          {tgtNodes.map((n, i) => (
            <g key={`t${i}`}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={CHART_COLORS[i % CHART_COLORS.length]} rx={3} />
              <text x={n.x - 4} y={n.y + n.h / 2 + 4} textAnchor="end" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{n.name}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  // ── Composed (Bar + Line) ──────────────────────────────────────────────────
  if (chartType === 'composed') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) =>
            s.seriesType === 'line' || s.seriesType === 'area' ? (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
            ) : (
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[4, 4, 0, 0]}>
                {showLabels && <LabelList dataKey={s.dataKey} position="top" fontSize={9} fill="hsl(var(--muted-foreground))" />}
              </Bar>
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ── Radial Bar ─────────────────────────────────────────────────────────────
  if (chartType === 'radial_bar') {
    const radialData = data.slice(0, 12).map((row: any, i: number) => ({
      name: String(row[xKey] ?? ''),
      value: Number(row[series[0]?.dataKey] ?? 0),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="15%" outerRadius="90%" data={radialData} startAngle={180} endAngle={0}>
          <RadialBar
            label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }}
            background={{ fill: 'hsl(var(--border))' }}
            dataKey="value"
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  // ── Histogram ─────────────────────────────────────────────────────────────
  if (chartType === 'histogram') {
    const numField = series[0]?.dataKey ?? xKey;
    const values = data
      .map((row: any) => Number(row[numField]))
      .filter((v: number) => !isNaN(v));
    if (values.length === 0) {
      return <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">No numeric data</div>;
    }
    const bins = config.bins ?? 10;
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const bw = maxV === minV ? 1 : (maxV - minV) / bins;
    const histData = Array.from({ length: bins }, (_, i) => {
      const from = minV + i * bw;
      const to = from + bw;
      const count = values.filter((v: number) => i === bins - 1 ? v >= from && v <= to : v >= from && v < to).length;
      const label = bw >= 1 ? `${Math.round(from)}–${Math.round(to)}` : `${from.toFixed(1)}–${to.toFixed(1)}`;
      return { range: label, count };
    });
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={histData} barCategoryGap={2} margin={{ top: 4, right: 8, bottom: 28, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey="range" {...commonAxisProps} angle={-30} textAnchor="end" height={44} tick={{ ...commonAxisProps.tick, fontSize: 9 }} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip {...tooltipStyle} formatter={(v: any) => [v, 'Count']} />
          <Bar dataKey="count" fill={series[0]?.color || CHART_COLORS[0]} radius={[3, 3, 0, 0]}>
            {showLabels && <LabelList dataKey="count" position="top" fontSize={9} fill="hsl(var(--muted-foreground))" />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Default: Bar ───────────────────────────────────────────────────────────
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} onClick={handleBarClick} style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}>
        <CartesianGrid {...commonGridProps} />
        <XAxis dataKey={xKey} {...commonAxisProps} />
        <YAxis {...commonAxisProps} width={40} />
        <Tooltip {...tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[4, 4, 0, 0]}>
            {showLabels && <LabelList dataKey={s.dataKey} position="top" fontSize={9} fill="hsl(var(--muted-foreground))" />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
