import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';

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
  LinkButton,
  PageHeader,
  SegmentedControl,
  Stat,
  StatStrip,
  TextArea,
  Toast,
} from '@x10/shared/ui';

import { ValueLadder } from '../components/ValueLadder';
import {
  CATEGORY_LABELS,
  DAMAGE_FEE_PCT,
  GRADE_DESCRIPTIONS,
  LEAD_REFUND_OVER,
  ORIGIN_LABELS,
  REASON_LABELS,
} from '../domain/config';
import { enrichReturns, gradeReturn, loadWorkspace } from '../domain/returns';
import { bestDisposition, calculateRefund, hoursSince } from '../domain/rules';
import { GRADES, type Grade, type Schema } from '../model';

export function BenchPage() {
  const { store, me } = useApp<Schema>();
  const [params] = useSearchParams();
  const initialId = params.get('id');

  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [grade, setGrade] = useState<Grade>('B');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enriched = useMemo(() => {
    if (!state.data) return [];
    return enrichReturns(state.data.cases, state.data.policies, state.data.returners, state.data.now);
  }, [state.data]);

  const queue = useMemo(
    () =>
      enriched
        .filter((e) => e.item.status === 'received')
        .sort((a, b) => (a.item.receivedAt ?? '').localeCompare(b.item.receivedAt ?? '')),
    [enriched],
  );

  const active = useMemo(() => {
    if (selectedId) {
      const found = enriched.find((e) => e.item.id === selectedId);
      if (found) return found;
    }
    return queue[0] ?? null;
  }, [enriched, queue, selectedId]);

  const previewLadder = useMemo(() => {
    if (!active || !state.data) return null;
    return bestDisposition(active.item, grade, state.data.policies);
  }, [active, grade, state.data]);

  const previewRefund = useMemo(() => {
    if (!active) return null;
    return calculateRefund(active.item.unitPrice, active.item.units, grade, active.item.reason);
  }, [active, grade]);

  const handleSaveGrade = async () => {
    if (!active) return;
    setError(null);
    setBusy(true);
    try {
      await gradeReturn(store, me, active.item.id, grade, notes);
      setToast(`Graded ${active.item.rmaNo} as Grade ${grade}. Ready for Fork.`);
      setNotes('');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save grade.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grading bench"
        subtitle="Inspect received returns, review repeat-returner signals, and preview the recovery value ladder."
        actions={
          <LinkButton to="/fork" variant="secondary" size="sm">
            Open Fork
          </LinkButton>
        }
      />

      <DataState state={state} loadingRows={4}>
        {() => (
          <>
            <StatStrip>
              <Stat label="At dock awaiting grade" value={String(queue.length)} />
              <Stat
                label="Overdue (> 48h)"
                value={String(queue.filter((q) => q.overdue48h).length)}
                tone={queue.some((q) => q.overdue48h) ? 'bad' : 'ok'}
              />
              <Stat
                label="Serial returners in queue"
                value={String(queue.filter((q) => q.serial?.flagged).length)}
                tone="warn"
              />
            </StatStrip>

            {queue.length === 0 ? (
              <EmptyState title="Grading bench is clear" bordered>
                All received returns have been graded. Check the Dock for incoming shipments.
              </EmptyState>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                <div className="space-y-2" data-testid="bench-queue">
                  {queue.map((e) => {
                    const isSel = active?.item.id === e.item.id;
                    const hrs = Math.round(hoursSince(e.item.receivedAt, state.data?.now ?? new Date()));
                    return (
                      <button
                        key={e.item.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(e.item.id);
                          setGrade(e.item.grade ?? 'B');
                          setNotes(e.item.notes ?? '');
                          setError(null);
                        }}
                        className={[
                          'w-full rounded-xl border p-3 text-left transition-colors',
                          isSel ? 'border-accent-7 bg-accent-3/50' : 'border-line bg-surface hover:bg-surface-2',
                        ].join(' ')}
                        data-testid={`bench-item-${e.item.rmaNo}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-fg">{e.item.rmaNo}</span>
                          <Badge tone={e.overdue48h ? 'bad' : 'neutral'} size="sm">
                            {hrs}h at dock
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm font-medium text-fg truncate">{e.item.productName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span>{e.item.customerRef}</span>
                          <span>·</span>
                          <span>${e.item.unitPrice.toFixed(2)}</span>
                          {e.serial?.flagged && (
                            <Badge tone="warn" variant="soft" size="sm">
                              Serial {e.serial.ratePct}%
                            </Badge>
                          )}
                          {e.item.reason === 'late' && (
                            <Badge tone="bad" variant="soft" size="sm">
                              Late
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {active && (
                  <Card className="p-5 space-y-5" data-testid="bench-workspace">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-muted">
                          {active.item.rmaNo} · {active.item.sku} · {CATEGORY_LABELS[active.item.category]} ·{' '}
                          {ORIGIN_LABELS[active.item.origin]}
                        </div>
                        <h2 className="mt-0.5 text-lg font-semibold text-fg">{active.item.productName}</h2>
                        <div className="mt-1 text-sm text-muted">
                          {active.item.units} unit{active.item.units > 1 ? 's' : ''} · Unit price ${active.item.unitPrice.toFixed(2)} ·
                          Reason: {REASON_LABELS[active.item.reason]}
                        </div>
                      </div>
                      <Badge tone={active.overdue48h ? 'bad' : 'info'}>
                        {active.overdue48h ? 'Past 48h SLA' : 'Within SLA'}
                      </Badge>
                    </div>

                    {active.serial?.flagged && (
                      <div data-testid="serial-returner-banner">
                        <Callout
                          tone="warn"
                          icon={<AlertTriangle size={16} />}
                          title={`Repeat-returner signal: ${active.item.customerRef} (${active.serial.summary})`}
                        >
                          Shown for inspection awareness only — Rule 4 never auto-denies a return. Verify item serial, tags, and accessories carefully.
                        </Callout>
                      </div>
                    )}

                    {active.serial && !active.serial.flagged && (
                      <div className="text-xs text-muted" data-testid="customer-history-ok">
                        Customer {active.item.customerRef}: {active.serial.summary} — not flagged under Rule 4.
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-fg">Inspection grade</label>
                      <SegmentedControl
                        label="Inspection grade"
                        value={grade}
                        onChange={(v) => setGrade(v as Grade)}
                        options={GRADES.map((g) => ({ value: g, label: `Grade ${g}` }))}
                        fullWidth
                      />
                      <p className="text-xs text-muted">{GRADE_DESCRIPTIONS[grade]}</p>
                    </div>

                    {previewRefund && (
                      <div className="rounded-lg border border-line bg-surface-sunken/60 p-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-mono uppercase text-muted">Computed refund (Rule 5)</div>
                          <div className="mt-0.5 font-mono text-lg font-semibold text-fg tabular-nums">
                            ${previewRefund.refundAmount.toFixed(2)}
                          </div>
                          {previewRefund.damageFeeApplied && (
                            <div className="text-xs text-warn-text">
                              Includes {DAMAGE_FEE_PCT}% damage fee (−${previewRefund.damageFee.toFixed(2)}) for Grade {grade} non-defective return.
                            </div>
                          )}
                        </div>
                        {previewRefund.needsLeadApproval && (
                          <Badge tone="warn" variant="soft">
                            Exceeds ${LEAD_REFUND_OVER} — needs Returns lead
                          </Badge>
                        )}
                      </div>
                    )}

                    {previewLadder && (
                      <div className="space-y-2">
                        <div className="text-xs font-mono uppercase tracking-wider text-muted">
                          Recovery value ladder preview (Rule 2)
                        </div>
                        <ValueLadder ladder={previewLadder} />
                      </div>
                    )}

                    <Field label="Inspection notes" htmlFor="bench-notes" counter={{ value: notes.length, max: 300 }}>
                      <TextArea
                        id="bench-notes"
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Seal condition, accessories present, cosmetic marks…"
                      />
                    </Field>

                    {error && <InlineError error={error} />}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="primary"
                        icon={<Check size={16} />}
                        busy={busy}
                        onClick={handleSaveGrade}
                        data-testid="save-grade-btn"
                      >
                        Save Grade {grade}
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
