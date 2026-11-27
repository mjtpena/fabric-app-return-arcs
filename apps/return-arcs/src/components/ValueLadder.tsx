import { Badge } from '@x10/shared/ui';

import { DISPOSITION_LABELS } from '../domain/config';
import type { BayDisposition, DispositionLadderResult } from '../domain/rules';

interface ValueLadderProps {
  ladder: DispositionLadderResult;
  selected?: BayDisposition | null;
  onSelect?: (d: BayDisposition) => void;
  compact?: boolean;
}

export function ValueLadder({ ladder, selected, onSelect, compact = false }: ValueLadderProps) {
  const maxAbs = Math.max(1, ...ladder.ladder.map((o) => Math.abs(o.value)));

  return (
    <div className="space-y-1.5" data-testid="value-ladder">
      {ladder.ladder.map((opt) => {
        const isBest = opt.disposition === ladder.best.disposition;
        const isSelected = selected === opt.disposition;
        const pct = Math.min(100, Math.round((Math.abs(opt.value) / maxAbs) * 100));
        const positive = opt.value >= 0;

        const rowContent = (
          <div
            className={[
              'w-full rounded-lg border px-3 py-2 text-left transition-colors',
              !opt.eligible
                ? 'border-line bg-surface-sunken/70 opacity-75'
                : isSelected
                  ? 'border-accent-7 bg-accent-3/60'
                  : isBest
                    ? 'border-accent-6 bg-surface'
                    : 'border-line bg-surface hover:bg-surface-2',
            ].join(' ')}
            data-testid={`ladder-row-${opt.disposition}`}
            data-eligible={String(opt.eligible)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-fg">{DISPOSITION_LABELS[opt.disposition]}</span>
                {isBest && opt.eligible && (
                  <Badge tone="brand" variant="soft" size="sm">
                    Best
                  </Badge>
                )}
                {!opt.eligible && (
                  <Badge tone="bad" variant="dot" size="sm">
                    Blocked
                  </Badge>
                )}
              </div>
              <span
                className={[
                  'font-mono text-sm font-medium tabular-nums shrink-0',
                  !opt.eligible ? 'text-muted line-through' : positive ? 'text-fg' : 'text-bad-text',
                ].join(' ')}
              >
                {opt.value >= 0 ? `+$${opt.value.toFixed(2)}` : `−$${Math.abs(opt.value).toFixed(2)}`}
                {!compact && <span className="text-xs text-muted font-normal"> /u</span>}
              </span>
            </div>

            {!compact && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-3">
                  <div
                    className={[
                      'h-full rounded-full',
                      !opt.eligible ? 'bg-gray-6' : positive ? 'bg-accent-9' : 'bg-bad-solid',
                    ].join(' ')}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-muted tabular-nums shrink-0">{opt.formula}</span>
              </div>
            )}

            {opt.ineligibleReason && (
              <p className="mt-1 text-xs text-bad-text" data-testid={`ladder-blocked-${opt.disposition}`}>
                {opt.ineligibleReason}
              </p>
            )}
          </div>
        );

        if (onSelect && opt.eligible) {
          return (
            <button
              key={opt.disposition}
              type="button"
              onClick={() => onSelect(opt.disposition)}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-8 rounded-lg"
            >
              {rowContent}
            </button>
          );
        }

        return <div key={opt.disposition}>{rowContent}</div>;
      })}
    </div>
  );
}
