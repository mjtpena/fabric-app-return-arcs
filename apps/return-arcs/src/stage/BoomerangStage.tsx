import { useMemo } from 'react';

import { useReducedMotion, useThemeColors } from '@x10/shared/ui';

import { DISPOSITION_LABELS, ORIGIN_LABELS } from '../domain/config';
import { dispositionForCase, type EnrichedReturn } from '../domain/returns';
import { daysSince } from '../domain/rules';
import { BAY_DISPOSITIONS, type Origin } from '../model';

export type ArcLens = 'grade' | 'recovery' | 'volume' | 'reason' | 'days';
export type ViewRole = 'grader' | 'lead';
export type FocusFilter =
  | { kind: 'all' }
  | { kind: 'overdue' }
  | { kind: 'lead' }
  | { kind: 'serial' }
  | { kind: 'returnless' }
  | { kind: 'late' }
  | { kind: 'case'; id: string };

interface BoomerangStageProps {
  items: EnrichedReturn[];
  lens: ArcLens;
  role: ViewRole;
  focus: FocusFilter;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  now: Date;
}

const DOCK = { x: 460, y: 214 };
const ORIGIN_POS: Record<Origin, { x: number; y: number; labelOffset: { dx: number; dy: number } }> = {
  north: { x: 460, y: 54, labelOffset: { dx: 0, dy: -22 } },
  west: { x: 108, y: 214, labelOffset: { dx: -8, dy: -24 } },
  east: { x: 812, y: 214, labelOffset: { dx: 8, dy: -24 } },
  south: { x: 460, y: 342, labelOffset: { dx: 0, dy: 24 } },
};

const BAY_Y = 446;
const BAY_X: Record<(typeof BAY_DISPOSITIONS)[number], number> = {
  restock: 120,
  open_box: 256,
  refurbish: 392,
  liquidate: 528,
  donate: 664,
  scrap: 800,
};

export function matchesFocus(e: EnrichedReturn, focus: FocusFilter): boolean {
  switch (focus.kind) {
    case 'all':
      return true;
    case 'overdue':
      return e.overdue48h;
    case 'lead':
      return e.needsLead;
    case 'serial':
      return Boolean(e.serial?.flagged) && e.item.status !== 'closed';
    case 'returnless':
      return e.returnlessCandidate || e.item.disposition === 'returnless';
    case 'late':
      return e.item.reason === 'late';
    case 'case':
      return e.item.id === focus.id;
  }
}

export function BoomerangStage({
  items,
  lens,
  role,
  focus,
  selectedId,
  onSelect,
  now,
}: BoomerangStageProps) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();

  const palette = useMemo(() => {
    // Calm festive winter drafting palette: copper/orange accent + slate blue + teal + plum + warm amber.
    // Never pairs red + green together.
    const blue = colors.info;
    const teal = colors.dark ? '#52b8a8' : '#1f7a6c';
    const plum = colors.dark ? '#c77db5' : '#8a3d79';
    const neutral = colors.gray[8];
    const gradeMap = {
      A: colors.accent[9],
      B: blue,
      C: plum,
      D: colors.bad,
      ungraded: colors.warn,
    };
    const reasonMap = {
      defective: colors.bad,
      wrong_size: colors.accent[9],
      changed_mind: blue,
      not_as_described: plum,
      gift_return: teal,
      late: colors.warn,
    };
    return { blue, teal, plum, neutral, gradeMap, reasonMap };
  }, [colors]);

  const arcColor = (e: EnrichedReturn): string => {
    switch (lens) {
      case 'grade':
        return e.item.grade ? palette.gradeMap[e.item.grade] : palette.gradeMap.ungraded;
      case 'recovery':
        if (e.recoveryValue > 60) return colors.accent[9];
        if (e.recoveryValue >= 0) return palette.blue;
        return colors.bad;
      case 'volume':
        if (e.item.units >= 3) return colors.accent[9];
        if (e.item.units === 2) return palette.plum;
        return palette.blue;
      case 'reason':
        return palette.reasonMap[e.item.reason];
      case 'days': {
        if (e.overdue48h) return colors.bad;
        const d = daysSince(e.item.requestedAt, now);
        if (d > 5) return colors.warn;
        return palette.teal;
      }
    }
  };

  const originCounts = useMemo(() => {
    const counts: Record<Origin, { count: number; units: number }> = {
      north: { count: 0, units: 0 },
      south: { count: 0, units: 0 },
      east: { count: 0, units: 0 },
      west: { count: 0, units: 0 },
    };
    for (const e of items) {
      counts[e.item.origin].count += 1;
      counts[e.item.origin].units += e.item.units;
    }
    return counts;
  }, [items]);

  const bayStats = useMemo(() => {
    const stats = Object.fromEntries(
      BAY_DISPOSITIONS.map((d) => [d, { count: 0, recovery: 0 }]),
    ) as Record<(typeof BAY_DISPOSITIONS)[number], { count: number; recovery: number }>;
    for (const e of items) {
      const disp = dispositionForCase(e);
      if (disp && disp !== 'returnless') {
        stats[disp].count += 1;
        stats[disp].recovery += e.recoveryValue;
      }
    }
    return stats;
  }, [items]);

  const returnlessCount = useMemo(
    () => items.filter((e) => e.item.disposition === 'returnless' || e.returnlessCandidate).length,
    [items],
  );

  // Build deterministic spread offsets per origin & per bay so arcs fan cleanly without overlapping into one line
  const arcGeometry = useMemo(() => {
    const byOrigin: Record<Origin, number> = { north: 0, south: 0, east: 0, west: 0 };
    const originTotals: Record<Origin, number> = { north: 0, south: 0, east: 0, west: 0 };
    for (const e of items) originTotals[e.item.origin] += 1;

    const byBay: Record<string, number> = {};
    const bayTotals: Record<string, number> = {};
    for (const e of items) {
      const d = dispositionForCase(e);
      if (d && d !== 'returnless') bayTotals[d] = (bayTotals[d] ?? 0) + 1;
    }

    return items.map((e) => {
      const o = e.item.origin;
      const oIdx = byOrigin[o]++;
      const oTotal = Math.max(1, originTotals[o]);
      const oSpread = ((oIdx + 0.5) / oTotal - 0.5) * 2; // -1..1

      const start = ORIGIN_POS[o];
      // Boomerang curve control point perpendicular to origin -> dock vector
      const dx = DOCK.x - start.x;
      const dy = DOCK.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const bow = oSpread * (o === 'north' || o === 'south' ? 115 : 88);
      const cx = (start.x + DOCK.x) / 2 + nx * bow;
      const cy = (start.y + DOCK.y) / 2 + ny * bow;
      const inPath = `M ${start.x} ${start.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${DOCK.x} ${DOCK.y}`;

      // Outgoing disposition arc from dock to bay
      const disp = dispositionForCase(e);
      let outPath: string | null = null;
      if (disp && disp !== 'returnless') {
        const bIdx = byBay[disp] ?? 0;
        byBay[disp] = bIdx + 1;
        const bTotal = Math.max(1, bayTotals[disp] ?? 1);
        const bSpread = ((bIdx + 0.5) / bTotal - 0.5) * 2;
        const bx = BAY_X[disp] + bSpread * 16;
        const by = BAY_Y;

        // Arc height encodes recovery value: positive arches loftily, negative (scrap/donate) sags BELOW BAY_Y!
        const clampedVal = Math.max(-60, Math.min(400, e.recoveryValue));
        const midX = (DOCK.x + bx) / 2 + bSpread * 18;
        let ctrlY: number;
        if (clampedVal < 0) {
          // Sag noticeably below the disposition baseline (y = 446 -> 516..556)
          ctrlY = BAY_Y + 72 + Math.min(42, Math.abs(clampedVal) * 1.4);
        } else {
          // Loft upward proportional to recovery value
          const lift = 36 + (clampedVal / 400) * 135;
          ctrlY = Math.min(BAY_Y - 24, (DOCK.y + BAY_Y) / 2 - lift * 0.45);
        }
        outPath = `M ${DOCK.x} ${DOCK.y} Q ${midX.toFixed(1)} ${ctrlY.toFixed(1)} ${bx.toFixed(1)} ${by}`;
      }

      const ageDays = daysSince(e.item.requestedAt, now);
      const durationSec = Math.max(1.8, Math.min(7.5, 7.2 - ageDays * 0.35));

      return { e, inPath, outPath, disp, durationSec };
    });
  }, [items, now]);

  const isRoleEmphasized = (e: EnrichedReturn): boolean => {
    if (role === 'lead') return e.needsLead;
    return e.item.status === 'received' || e.item.status === 'graded' || e.overdue48h || Boolean(e.serial?.flagged);
  };

  return (
    <div className="relative h-full w-[calc(100%-var(--side-w,0px))] flex items-center justify-center select-none overflow-hidden">
      <svg
        viewBox="0 0 920 560"
        className="h-full w-full max-h-[calc(100vh-110px)] max-w-[1100px] px-2 pb-12 pt-10"
        role="img"
        aria-label="Return Arcs compass plane showing incoming regional returns and outgoing disposition recovery arcs"
        data-testid="boomerang-stage"
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) onSelect(null);
        }}
      >
        <defs>
          <radialGradient id="dock-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.accent[9]} stopOpacity={colors.dark ? 0.32 : 0.2} />
            <stop offset="100%" stopColor={colors.accent[9]} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="baseline-fade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.world.grid} stopOpacity="0" />
            <stop offset="12%" stopColor={colors.gray[7]} stopOpacity="0.8" />
            <stop offset="88%" stopColor={colors.gray[7]} stopOpacity="0.8" />
            <stop offset="100%" stopColor={colors.world.grid} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Drafting compass rings centered on the Returns Dock */}
        <g pointerEvents="none" opacity={colors.dark ? 0.45 : 0.65}>
          {[68, 130, 192].map((r) => (
            <circle
              key={r}
              cx={DOCK.x}
              cy={DOCK.y}
              r={r}
              fill="none"
              stroke={colors.world.grid}
              strokeWidth={1}
              strokeDasharray={r === 130 ? '3 5' : undefined}
            />
          ))}
          {/* Cardinal hairlines */}
          <line x1={120} y1={DOCK.y} x2={800} y2={DOCK.y} stroke={colors.world.grid} strokeWidth={1} />
          <line x1={DOCK.x} y1={58} x2={DOCK.x} y2={342} stroke={colors.world.grid} strokeWidth={1} />
        </g>

        {/* Disposition baseline (arcs below this line = negative recovery / scrap sag) */}
        <g pointerEvents="none">
          <line x1={48} y1={BAY_Y} x2={872} y2={BAY_Y} stroke="url(#baseline-fade)" strokeWidth={1.5} />
          <text
            x={54}
            y={BAY_Y - 18}
            textAnchor="start"
            fill={colors.world['ink-muted']}
            fontSize={9.5}
            fontFamily="var(--font-mono)"
          >
            $0 RECOVERY BASELINE
          </text>
          <text
            x={868}
            y={BAY_Y - 18}
            textAnchor="end"
            fill={colors.bad}
            fontSize={9.5}
            fontFamily="var(--font-mono)"
            opacity={0.9}
          >
            BELOW LINE = NET LOSS SAG
          </text>
        </g>

        {/* Returnless bypass loop at the dock */}
        <g
          className="cursor-pointer"
          onClick={() => onSelect(null)}
          data-testid="returnless-halo"
        >
          <path
            d={`M ${DOCK.x + 28} ${DOCK.y - 16} C ${DOCK.x + 88} ${DOCK.y - 68}, ${DOCK.x + 98} ${DOCK.y + 8}, ${DOCK.x + 30} ${DOCK.y + 12}`}
            fill="none"
            stroke={palette.teal}
            strokeWidth={1.6}
            strokeDasharray="4 4"
            opacity={focus.kind === 'returnless' ? 1 : 0.65}
          />
          <text
            x={DOCK.x + 92}
            y={DOCK.y - 26}
            fill={colors.world['ink-muted']}
            fontSize={10}
            fontFamily="var(--font-mono)"
          >
            RETURNLESS ({returnlessCount})
          </text>
        </g>

        {/* Incoming boomerang arcs (Origin -> Dock) & Outgoing disposition arcs (Dock -> Bay) */}
        <g>
          {arcGeometry.map(({ e, inPath, outPath, durationSec }) => {
            const focused = matchesFocus(e, focus);
            const selected = selectedId === e.item.id;
            const roleActive = isRoleEmphasized(e);
            const baseOpacity =
              selected
                ? 1
                : focus.kind !== 'all'
                  ? focused
                    ? 0.92
                    : 0.1
                  : roleActive
                    ? 0.78
                    : 0.22;

            const color = arcColor(e);
            const width = Math.min(5.2, 1.3 + e.item.units * 0.85) + (selected ? 1.4 : 0);
            const isWithering = e.overdue48h;
            const dash = isWithering ? '3 6 1.5 7' : '10 6';

            return (
              <g
                key={e.item.id}
                data-testid={`arc-${e.item.rmaNo}`}
                data-rma={e.item.rmaNo}
                className="cursor-pointer transition-opacity duration-150"
                opacity={baseOpacity}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect(selected ? null : e.item.id);
                }}
              >
                {/* Invisible wider hit target for easy clicking */}
                <path d={inPath} fill="none" stroke="transparent" strokeWidth={12} />
                {/* Incoming arc */}
                <path
                  d={inPath}
                  fill="none"
                  stroke={color}
                  strokeWidth={width}
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  className={!reduced ? 'arc-animated' : undefined}
                  style={!reduced ? ({ '--arc-dur': `${durationSec.toFixed(2)}s` } as React.CSSProperties) : undefined}
                />

                {/* Outgoing disposition arc */}
                {outPath && (
                  <>
                    <path d={outPath} fill="none" stroke="transparent" strokeWidth={12} />
                    <path
                      d={outPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={Math.max(1.2, width * 0.85)}
                      strokeLinecap="round"
                      strokeDasharray={e.recoveryValue < 0 ? '4 4' : undefined}
                      opacity={0.85}
                    />
                  </>
                )}
              </g>
            );
          })}
        </g>

        {/* Four compass-point Origin nodes */}
        {(Object.keys(ORIGIN_POS) as Origin[]).map((o) => {
          const pos = ORIGIN_POS[o];
          const stat = originCounts[o];
          return (
            <g key={o} pointerEvents="none" data-testid={`origin-${o}`}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={15}
                fill={colors.surface}
                stroke={colors.gray[7]}
                strokeWidth={1.5}
              />
              <circle cx={pos.x} cy={pos.y} r={4.5} fill={colors.accent[9]} />
              <text
                x={pos.x + pos.labelOffset.dx}
                y={pos.y + pos.labelOffset.dy}
                textAnchor="middle"
                fill={colors.world.ink}
                fontSize={11}
                fontWeight={600}
                fontFamily="var(--font-mono)"
              >
                {ORIGIN_LABELS[o].toUpperCase()}
              </text>
              <text
                x={pos.x + pos.labelOffset.dx}
                y={pos.y + pos.labelOffset.dy + 13}
                textAnchor="middle"
                fill={colors.world['ink-muted']}
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {stat.count} · {stat.units}u
              </text>
            </g>
          );
        })}

        {/* Central Returns Dock medallion */}
        <g pointerEvents="none" data-testid="returns-dock">
          <circle cx={DOCK.x} cy={DOCK.y} r={46} fill="url(#dock-glow)" />
          <circle
            cx={DOCK.x}
            cy={DOCK.y}
            r={27}
            fill={colors.surface}
            stroke={colors.accent[9]}
            strokeWidth={2.2}
          />
          <circle
            cx={DOCK.x}
            cy={DOCK.y}
            r={20}
            fill="none"
            stroke={colors.accent[7]}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={DOCK.x}
            y={DOCK.y - 2}
            textAnchor="middle"
            fill={colors.world.ink}
            fontSize={9.5}
            fontWeight={700}
            fontFamily="var(--font-mono)"
          >
            DOCK
          </text>
          <text
            x={DOCK.x}
            y={DOCK.y + 11}
            textAnchor="middle"
            fill={colors.accent[11]}
            fontSize={10}
            fontWeight={600}
            fontFamily="var(--font-mono)"
          >
            {items.length}
          </text>
        </g>

        {/* Six Disposition Bays along the bottom */}
        {BAY_DISPOSITIONS.map((disp) => {
          const x = BAY_X[disp];
          const stat = bayStats[disp];
          const neg = stat.recovery < 0;
          return (
            <g key={disp} pointerEvents="none" data-testid={`bay-${disp}`}>
              <rect
                x={x - 52}
                y={BAY_Y - 12}
                width={104}
                height={42}
                rx={8}
                fill={colors.surface}
                stroke={neg ? colors.bad : colors.gray[6]}
                strokeWidth={1.25}
              />
              <circle cx={x - 38} cy={BAY_Y + 9} r={4} fill={neg ? colors.bad : colors.accent[9]} />
              <text
                x={x - 28}
                y={BAY_Y + 6}
                fill={colors.world.ink}
                fontSize={10.5}
                fontWeight={600}
              >
                {DISPOSITION_LABELS[disp]}
              </text>
              <text
                x={x - 28}
                y={BAY_Y + 20}
                fill={neg ? colors.bad : colors.world['ink-muted']}
                fontSize={9.5}
                fontFamily="var(--font-mono)"
              >
                {stat.count} · {stat.recovery >= 0 ? `+$${Math.round(stat.recovery)}` : `−$${Math.abs(Math.round(stat.recovery))}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
