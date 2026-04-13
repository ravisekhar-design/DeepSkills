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
  ComposedChart,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { GeneratedChartConfig } from '@/ai/flows/chart-generation';

interface ChartRendererProps {
  config: GeneratedChartConfig;
  height?: number;
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

export function ChartRenderer({ config, height = 260 }: ChartRendererProps) {
  const { chartType, xKey, series, data } = config;

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No data to display
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
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid {...commonGridProps} />
          <XAxis dataKey={xKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={40} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ── Area ───────────────────────────────────────────────────────────────────
  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
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
            <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={s.color} fill={`url(#grad-${s.dataKey})`} strokeWidth={2} />
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
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} stackId="stack" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Horizontal Bar ─────────────────────────────────────────────────────────
  if (chartType === 'horizontal_bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid {...commonGridProps} horizontal={false} />
          <XAxis type="number" {...commonAxisProps} />
          <YAxis type="category" dataKey={xKey} {...commonAxisProps} width={80} />
          <Tooltip {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[0, 4, 4, 0]} />
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
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
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

  // ── Default: Bar ───────────────────────────────────────────────────────────
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid {...commonGridProps} />
        <XAxis dataKey={xKey} {...commonAxisProps} />
        <YAxis {...commonAxisProps} width={40} />
        <Tooltip {...tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
