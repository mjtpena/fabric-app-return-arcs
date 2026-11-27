import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  DataState,
  EmptyState,
  InlineError,
  PageHeader,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Toast,
  Tr,
} from '@x10/shared/ui';

import { DISPOSITION_LABELS, LEAD_REFUND_OVER, REASON_LABELS } from '../domain/config';
import { approveLeadAction, enrichReturns, loadWorkspace } from '../domain/returns';
import type { ReturnCase, Schema } from '../model';

export function WriteOffPage() {
  const { store, me } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [approving, setApproving] = useState<ReturnCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const enriched = useMemo(() => {
    if (!state.data) return [];
    return enrichReturns(state.data.cases, state.data.policies, state.data.returners, state.data.now);
  }, [state.data]);

  const pending = useMemo(() => enriched.filter((e) => e.needsLead), [enriched]);
  const approvedHistory = useMemo(
    () => enriched.filter((e) => e.item.approvedBySub !== null),
    [enriched],
  );

  const totalPendingRefunds = useMemo(
    () => pending.reduce((sum, e) => sum + e.item.refundAmount, 0),
    [pending],
  );

  const handleConfirmApprove = async (note: string) => {
    if (!approving) return;
    setError(null);
    try {
      await approveLeadAction(store, me, approving.id, note);
      setToast(`Approved ${approving.rmaNo} ($${approving.refundAmount.toFixed(2)}).`);
      setApproving(null);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
      setApproving(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Write-off book"
        subtitle={`Returns lead approvals for refunds over $${LEAD_REFUND_OVER}, scrap/donate write-offs, and late exceptions.`}
      />

      {!me.isAdmin && (
        <Callout tone="warn" icon={<ShieldAlert size={16} />} title="Returns lead role required">
          Signed in as {me.displayName}. You can review pending write-offs and high-value refunds here, but only the Returns lead can approve them.
        </Callout>
      )}

      {error && <InlineError error={error} />}

      <DataState state={state} loadingRows={4}>
        {() => (
          <>
            <StatStrip>
              <Stat label="Pending lead approval" value={String(pending.length)} tone={pending.length > 0 ? 'warn' : 'ok'} />
              <Stat label="Pending refund exposure" value={`$${Math.round(totalPendingRefunds).toLocaleString()}`} />
              <Stat
                label="Refunds > $500"
                value={String(pending.filter((e) => e.item.refundAmount > LEAD_REFUND_OVER).length)}
                tone="bad"
              />
              <Stat label="Approved by lead" value={String(approvedHistory.length)} tone="ok" />
            </StatStrip>

            {pending.length === 0 ? (
              <EmptyState title="Write-off book is clear" bordered>
                No high-value refunds, write-offs, or late exceptions are awaiting sign-off.
              </EmptyState>
            ) : (
              <TableWrap label="Pending lead approvals">
                <Table>
                  <thead>
                    <tr>
                      <Th>RMA</Th>
                      <Th>Item</Th>
                      <Th>Trigger</Th>
                      <Th>Bay</Th>
                      <Th numeric>Refund</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((e) => {
                      const triggers: string[] = [];
                      if (e.item.refundAmount > LEAD_REFUND_OVER) triggers.push(`Refund > $${LEAD_REFUND_OVER}`);
                      if (e.item.disposition === 'scrap' || e.item.disposition === 'donate') {
                        triggers.push(`${DISPOSITION_LABELS[e.item.disposition]} write-off`);
                      }
                      if (e.item.reason === 'late') triggers.push('Late window exception');

                      return (
                        <Tr key={e.item.id} data-testid={`writeoff-row-${e.item.rmaNo}`}>
                          <Td className="font-mono text-xs">{e.item.rmaNo}</Td>
                          <Td>
                            <div className="font-medium text-fg">{e.item.productName}</div>
                            <div className="text-xs text-muted">
                              Grade {e.item.grade ?? '—'} · {REASON_LABELS[e.item.reason]} · {e.item.notes ?? 'No notes'}
                            </div>
                          </Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              {triggers.map((t) => (
                                <Badge key={t} tone="warn" variant="soft" size="sm">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          </Td>
                          <Td>{e.item.disposition ? DISPOSITION_LABELS[e.item.disposition] : 'Ungraded'}</Td>
                          <Td numeric className="font-semibold">
                            ${e.item.refundAmount.toFixed(2)}
                          </Td>
                          <Td>
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<CheckCircle2 size={14} />}
                              disabled={!me.isAdmin}
                              onClick={() => setApproving(e.item)}
                              data-testid={`approve-btn-${e.item.rmaNo}`}
                            >
                              Approve
                            </Button>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </>
        )}
      </DataState>

      <ConfirmDialog
        open={Boolean(approving)}
        onClose={() => setApproving(null)}
        title={approving ? `Approve ${approving.rmaNo}` : 'Approve'}
        body={
          approving
            ? `Release $${approving.refundAmount.toFixed(2)} refund and sign off on ${approving.productName}.`
            : ''
        }
        confirmLabel="Approve and release"
        noteLabel="Lead sign-off note (optional)"
        onConfirm={handleConfirmApprove}
      />

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
