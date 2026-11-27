import { useCallback, useMemo, useState } from 'react';
import { PackageCheck, Plus, Sparkles } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Section,
  Select,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Toast,
  Tr,
} from '@x10/shared/ui';

import { CATEGORY_LABELS, ORIGIN_LABELS, REASON_LABELS, STATUS_LABELS } from '../domain/config';
import {
  createReturnRequest,
  enrichReturns,
  issueReturnlessRefund,
  loadWorkspace,
  receiveAtDock,
} from '../domain/returns';
import { evaluateReturnless, evaluateWindow, findPolicy } from '../domain/rules';
import { CATEGORIES, ORIGINS, REASONS, type Category, type Origin, type ReturnReason, type Schema } from '../model';

export function DockPage() {
  const { store, me } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const [scanRma, setScanRma] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // New return request form
  const [rmaNo, setRmaNo] = useState('');
  const [sku, setSku] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<Category>('home');
  const [orderedAt, setOrderedAt] = useState('2026-11-28');
  const [requestedAt, setRequestedAt] = useState('2026-12-07');
  const [customerRef, setCustomerRef] = useState('CUST-105');
  const [reason, setReason] = useState<ReturnReason>('changed_mind');
  const [unitPrice, setUnitPrice] = useState('12');
  const [unitCost, setUnitCost] = useState('4.50');
  const [units, setUnits] = useState('1');
  const [origin, setOrigin] = useState<Origin>('north');
  const [formError, setFormError] = useState<string | null>(null);

  const enriched = useMemo(() => {
    if (!state.data) return [];
    return enrichReturns(state.data.cases, state.data.policies, state.data.returners, state.data.now);
  }, [state.data]);

  const requested = useMemo(() => enriched.filter((e) => e.item.status === 'requested'), [enriched]);
  const received = useMemo(() => enriched.filter((e) => e.item.status === 'received'), [enriched]);
  const overdue = useMemo(() => received.filter((e) => e.overdue48h), [received]);
  const returnlessCandidates = useMemo(() => requested.filter((e) => e.returnlessCandidate), [requested]);

  // Live Rule 1 (window) & Rule 3 (returnless) preview
  const livePreview = useMemo(() => {
    const policies = state.data?.policies ?? [];
    const pol = findPolicy(policies, category, 'B') ?? findPolicy(policies, category, 'A');
    const price = Number(unitPrice) || 0;
    const win =
      orderedAt && requestedAt
        ? evaluateWindow(`${orderedAt}T12:00:00Z`, `${requestedAt}T12:00:00Z`)
        : null;
    const returnless =
      price > 0
        ? evaluateReturnless(price, pol?.handlingCost ?? 7, pol?.returnShipping ?? 5)
        : null;
    return { win, returnless, handling: pol?.handlingCost ?? 7, shipping: pol?.returnShipping ?? 5 };
  }, [state.data?.policies, category, unitPrice, orderedAt, requestedAt]);

  const handleScanReceive = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!scanRma.trim()) return;
    setScanError(null);
    setBusy(true);
    try {
      const updated = await receiveAtDock(store, me, scanRma);
      setScanRma('');
      setToast(`Received ${updated.rmaNo} at the dock.`);
      await state.reload();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not receive RMA.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (acceptReturnless: boolean) => {
    setFormError(null);
    setBusy(true);
    try {
      const res = await createReturnRequest(store, me, {
        rmaNo,
        sku,
        productName,
        category,
        orderedAt: `${orderedAt}T12:00:00Z`,
        requestedAt: `${requestedAt}T12:00:00Z`,
        customerRef,
        reason,
        unitPrice: Number(unitPrice),
        unitCost: Number(unitCost),
        units: Number(units),
        origin,
        acceptReturnless,
      });
      setToast(
        res.record.disposition === 'returnless'
          ? `Issued returnless refund for ${res.record.rmaNo} ($${res.record.refundAmount.toFixed(2)}).`
          : res.wasLate
            ? `Logged ${res.record.rmaNo} as late (outside return window).`
            : `Logged return request ${res.record.rmaNo}.`,
      );
      setRmaNo('');
      setSku('');
      setProductName('');
      await state.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not log return.');
    } finally {
      setBusy(false);
    }
  };

  const handleOfferReturnless = async (id: string, rma: string) => {
    setBusy(true);
    try {
      await issueReturnlessRefund(store, me, id);
      setToast(`Issued returnless refund for ${rma} — item stays with customer.`);
      await state.reload();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to issue returnless refund.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dock"
        subtitle="Scan incoming RMAs, evaluate holiday return windows, and intercept returnless candidates."
      />

      <DataState state={state} loadingRows={4}>
        {() => (
          <>
            <StatStrip>
              <Stat label="In transit (requested)" value={String(requested.length)} />
              <Stat label="At dock (ungraded)" value={String(received.length)} tone={overdue.length > 0 ? 'warn' : 'neutral'} />
              <Stat label="Past 48h target" value={String(overdue.length)} tone={overdue.length > 0 ? 'bad' : 'ok'} />
              <Stat label="Returnless candidates" value={String(returnlessCandidates.length)} tone="info" />
            </StatStrip>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Receive by RMA">
                <Card className="p-4 space-y-3">
                  <form onSubmit={handleScanReceive} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Field label="Scan RMA" htmlFor="dock-scan-rma">
                        <Input
                          id="dock-scan-rma"
                          value={scanRma}
                          onChange={(e) => setScanRma(e.target.value)}
                          placeholder="e.g. RMA-1014"
                        />
                      </Field>
                    </div>
                    <Button type="submit" variant="primary" icon={<PackageCheck size={16} />} busy={busy}>
                      Receive at dock
                    </Button>
                  </form>
                  {scanError && <InlineError error={scanError} />}
                </Card>
              </Section>

              <Section title="Log new return request">
                <Card className="p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="RMA number" htmlFor="new-rma" required>
                      <Input id="new-rma" value={rmaNo} onChange={(e) => setRmaNo(e.target.value)} placeholder="RMA-2099" />
                    </Field>
                    <Field label="SKU" htmlFor="new-sku" required>
                      <Input id="new-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="HM-MUG-12" />
                    </Field>
                    <Field label="Product name" htmlFor="new-product" required>
                      <Input id="new-product" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Enamel Camp Mug" />
                    </Field>
                    <Field label="Category" htmlFor="new-category">
                      <Select id="new-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Order date" htmlFor="new-ordered">
                      <Input id="new-ordered" type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} />
                    </Field>
                    <Field label="Return date" htmlFor="new-requested">
                      <Input id="new-requested" type="date" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} />
                    </Field>
                    <Field label="Unit price ($)" htmlFor="new-price">
                      <Input id="new-price" type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                    </Field>
                    <Field label="Unit cost ($)" htmlFor="new-cost">
                      <Input id="new-cost" type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                    </Field>
                    <Field label="Units" htmlFor="new-units">
                      <Input id="new-units" type="number" min="1" value={units} onChange={(e) => setUnits(e.target.value)} />
                    </Field>
                    <Field label="Customer ref" htmlFor="new-cust">
                      <Input id="new-cust" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} />
                    </Field>
                    <Field label="Origin region" htmlFor="new-origin">
                      <Select id="new-origin" value={origin} onChange={(e) => setOrigin(e.target.value as Origin)}>
                        {ORIGINS.map((o) => (
                          <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Reason" htmlFor="new-reason">
                      <Select id="new-reason" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
                        {REASONS.filter((r) => r !== 'late').map((r) => (
                          <option key={r} value={r}>{REASON_LABELS[r]}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  {livePreview.win && (
                    <div data-testid="window-preview">
                      <Callout
                        tone={livePreview.win.inWindow ? 'ok' : 'warn'}
                        title={
                          livePreview.win.inWindow
                            ? livePreview.win.isHolidayOrder
                              ? 'In holiday return window (through Jan 31)'
                              : 'In 30-day standard return window'
                            : 'Outside return window — will be logged as late'
                        }
                      >
                        {livePreview.win.inWindow
                          ? `Deadline: ${livePreview.win.deadline.slice(0, 10)} (${livePreview.win.daysSinceOrder} days since order).`
                          : `Order exceeded the return window (${livePreview.win.daysSinceOrder} days). Reason becomes "late" and requires Returns lead exception.`}
                      </Callout>
                    </div>
                  )}

                  {livePreview.returnless?.eligible && (
                    <div data-testid="returnless-offer">
                      <Callout
                        tone="info"
                        title="Returnless refund recommended (Rule 3)"
                      >
                        Handling (${livePreview.handling.toFixed(2)}) + return shipping (${livePreview.shipping.toFixed(2)}) = $
                        {livePreview.returnless.totalReturnCost.toFixed(2)}, which exceeds 50% of unit price ($
                        {livePreview.returnless.threshold.toFixed(2)}).
                      </Callout>
                    </div>
                  )}

                  {formError && <InlineError error={formError} />}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      icon={<Plus size={16} />}
                      busy={busy}
                      onClick={() => handleCreate(false)}
                    >
                      Log return request
                    </Button>
                    {livePreview.returnless?.eligible && livePreview.win?.inWindow && (
                      <Button
                        variant="secondary"
                        icon={<Sparkles size={16} />}
                        busy={busy}
                        onClick={() => handleCreate(true)}
                        data-testid="offer-returnless-btn"
                      >
                        Offer returnless refund
                      </Button>
                    )}
                  </div>
                </Card>
              </Section>
            </div>

            <Section title="Awaiting dock receipt & returnless offers">
              <TableWrap label="Requested returns">
                <Table>
                  <thead>
                    <tr>
                      <Th>RMA</Th>
                      <Th>Item</Th>
                      <Th>Origin</Th>
                      <Th numeric>Price</Th>
                      <Th>Rule 3 check</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {requested.map((e) => (
                      <Tr key={e.item.id}>
                        <Td className="font-mono text-xs">{e.item.rmaNo}</Td>
                        <Td>
                          <div className="font-medium text-fg">{e.item.productName}</div>
                          <div className="text-xs text-muted">
                            {CATEGORY_LABELS[e.item.category]} · {e.item.customerRef} · {STATUS_LABELS[e.item.status]}
                          </div>
                        </Td>
                        <Td muted>{ORIGIN_LABELS[e.item.origin]}</Td>
                        <Td numeric>${e.item.unitPrice.toFixed(2)}</Td>
                        <Td>
                          {e.returnlessCandidate ? (
                            <Badge tone="info" variant="soft">
                              Returnless eligible (cost ${e.returnlessEval.totalReturnCost.toFixed(2)})
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted">Ship back to dock</span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            {e.returnlessCandidate && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOfferReturnless(e.item.id, e.item.rmaNo)}
                                data-testid={`returnless-action-${e.item.rmaNo}`}
                              >
                                Issue returnless
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="subtle"
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await receiveAtDock(store, me, e.item.rmaNo);
                                  setToast(`Received ${e.item.rmaNo} at dock.`);
                                  await state.reload();
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Receive
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Section>
          </>
        )}
      </DataState>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
