import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitFork } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataState,
  EmptyState,
  Field,
  InlineError,
  PageHeader,
  Stat,
  StatStrip,
  TextArea,
  Toast,
} from '@x10/shared/ui';

import { ValueLadder } from '../components/ValueLadder';
import { CATEGORY_LABELS, DISPOSITION_LABELS, REASON_LABELS } from '../domain/config';
import { enrichReturns, loadWorkspace, routeDisposition } from '../domain/returns';
import type { BayDisposition } from '../domain/rules';
import { limits, type Schema } from '../model';

export function ForkPage() {
  const { store, me } = useApp<Schema>();
  const [params] = useSearchParams();
  const initialId = params.get('id');

  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [chosenBay, setChosenBay] = useState<BayDisposition | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enriched = useMemo(() => {
    if (!state.data) return [];
    return enrichReturns(state.data.cases, state.data.policies, state.data.returners, state.data.now);
  }, [state.data]);

  const gradedQueue = useMemo(() => enriched.filter((e) => e.item.status === 'graded' && e.ladder), [enriched]);

  const active = useMemo(() => {
    if (selectedId) {
      const found = gradedQueue.find((e) => e.item.id === selectedId);
      if (found) return found;
    }
    return gradedQueue[0] ?? null;
  }, [gradedQueue, selectedId]);

  const effectiveBay: BayDisposition | null = chosenBay ?? active?.ladder?.best.disposition ?? null;
  const isOverride = Boolean(active?.ladder && effectiveBay && effectiveBay !== active.ladder.best.disposition);

  const handleRoute = async () => {
    if (!active || !effectiveBay) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await routeDisposition(store, me, active.item.id, effectiveBay, overrideReason);
      setToast(
        updated.status === 'routed'
          ? `Routed ${updated.rmaNo} to ${DISPOSITION_LABELS[effectiveBay]} (awaiting Returns lead).`
          : `Routed ${updated.rmaNo} to ${DISPOSITION_LABELS[effectiveBay]} and closed.`,
      );
      setChosenBay(null);
      setOverrideReason('');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not route disposition.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fork"
        subtitle="Route each graded return to its highest-recovery bay, or override with a recorded reason."
      />

      <DataState state={state} loadingRows={4}>
        {() => (
          <>
            <StatStrip>
              <Stat label="Graded & ready to route" value={String(gradedQueue.length)} />
              <Stat
                label="Grade C/D (restock blocked)"
                value={String(gradedQueue.filter((e) => e.item.grade === 'C' || e.item.grade === 'D').length)}
                tone="warn"
              />
            </StatStrip>

            {gradedQueue.length === 0 ? (
              <EmptyState title="No graded returns waiting at the Fork" bordered>
                Grade received returns at the Grading bench first.
              </EmptyState>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                <div className="space-y-2" data-testid="fork-queue">
                  {gradedQueue.map((e) => {
                    const isSel = active?.item.id === e.item.id;
                    return (
                      <button
                        key={e.item.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(e.item.id);
                          setChosenBay(null);
                          setOverrideReason('');
                          setError(null);
                        }}
                        className={[
                          'w-full rounded-xl border p-3 text-left transition-colors',
                          isSel ? 'border-accent-7 bg-accent-3/50' : 'border-line bg-surface hover:bg-surface-2',
                        ].join(' ')}
                        data-testid={`fork-item-${e.item.rmaNo}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-fg">{e.item.rmaNo}</span>
                          <Badge tone={e.item.grade === 'C' || e.item.grade === 'D' ? 'warn' : 'brand'} variant="soft" size="sm">
                            Grade {e.item.grade}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm font-medium text-fg truncate">{e.item.productName}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          Best: {e.ladder ? DISPOSITION_LABELS[e.ladder.best.disposition] : '—'} ·{' '}
                          {e.ladder && e.ladder.best.value >= 0
                            ? `+$${e.ladder.best.value.toFixed(2)}`
                            : `−$${Math.abs(e.ladder?.best.value ?? 0).toFixed(2)}`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {active && active.ladder && (
                  <Card className="p-5 space-y-5" data-testid="fork-workspace">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-muted">
                          {active.item.rmaNo} · {CATEGORY_LABELS[active.item.category]} · {REASON_LABELS[active.item.reason]}
                        </div>
                        <h2 className="mt-0.5 text-lg font-semibold text-fg">{active.item.productName}</h2>
                      </div>
                      <Badge tone="brand" variant="soft">
                        Grade {active.item.grade}
                      </Badge>
                    </div>

                    {(active.item.grade === 'C' || active.item.grade === 'D') && (
                      <Callout tone="warn" title={`Grade ${active.item.grade} restock lock (Rule 2)`}>
                        Grades C and D can never return to shelf. Restock is locked out of the ladder below.
                      </Callout>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-mono uppercase tracking-wider text-muted">
                        Select an eligible disposition bay
                      </div>
                      <ValueLadder
                        ladder={active.ladder}
                        selected={effectiveBay}
                        onSelect={(d) => setChosenBay(d)}
                      />
                    </div>

                    {isOverride && (
                      <Field
                        label="Override reason"
                        htmlFor="fork-override-reason"
                        required
                        hint={`Required (${limits.overrideReason.min}+ chars) when routing away from ${DISPOSITION_LABELS[active.ladder.best.disposition]}.`}
                        counter={{ value: overrideReason.length, max: limits.overrideReason.max }}
                      >
                        <TextArea
                          id="fork-override-reason"
                          rows={2}
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Explain why a non-optimal bay was selected…"
                        />
                      </Field>
                    )}

                    {error && <InlineError error={error} />}

                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        icon={<GitFork size={16} />}
                        busy={busy}
                        onClick={handleRoute}
                        data-testid="route-bay-btn"
                      >
                        Route to {effectiveBay ? DISPOSITION_LABELS[effectiveBay] : 'bay'}
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </DataState>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
