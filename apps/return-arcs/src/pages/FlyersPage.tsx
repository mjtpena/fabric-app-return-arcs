import { useCallback, useMemo } from 'react';

import { SimpleBarChart } from '@x10/shared/charts';
import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Callout,
  DataState,
  PageHeader,
  Section,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { SERIAL_MIN_BRACKETED_SIZES, SERIAL_MIN_RETURNS, SERIAL_RATE } from '../domain/config';
import { loadWorkspace } from '../domain/returns';
import { evaluateSerialReturner } from '../domain/rules';
import type { Schema } from '../model';

export function FlyersPage() {
  const { store } = useApp<Schema>();
  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  const rows = useMemo(() => {
    if (!state.data) return [];
    const openByCust = new Map<string, number>();
    for (const c of state.data.cases) {
      if (c.status !== 'closed') {
        openByCust.set(c.customerRef, (openByCust.get(c.customerRef) ?? 0) + 1);
      }
    }
    return state.data.returners
      .map((stat) => ({
        stat,
        eval: evaluateSerialReturner(stat),
        openCount: openByCust.get(stat.customerRef) ?? 0,
      }))
      .sort((a, b) => Number(b.eval.flagged) - Number(a.eval.flagged) || b.eval.rate - a.eval.rate);
  }, [state.data]);

  const flagged = rows.filter((r) => r.eval.flagged);
  const chartData = rows.slice(0, 8).map((r) => ({
    name: r.stat.customerRef,
    rate: r.eval.ratePct,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repeat flyers"
        subtitle="12-month return rate and size-bracketing signals surfaced to graders without auto-denying."
      />

      <Callout tone="info" title="Awareness signal, never auto-denial (Rule 4)">
        Customers with return rate ≥ {Math.round(SERIAL_RATE * 100)}% and at least {SERIAL_MIN_RETURNS} returns in 12 months,
        or {SERIAL_MIN_BRACKETED_SIZES}+ sizes of the same SKU bracketed, are flagged on the Grading bench for closer inspection.
      </Callout>

      <DataState state={state} loadingRows={4}>
        {() => (
          <>
            <StatStrip>
              <Stat label="Tracked accounts" value={String(rows.length)} />
              <Stat label="Flagged repeat flyers" value={String(flagged.length)} tone={flagged.length > 0 ? 'warn' : 'ok'} />
              <Stat
                label="Size-bracketing flags"
                value={String(flagged.filter((r) => r.eval.reason === 'bracketing' || r.eval.reason === 'both').length)}
              />
              <Stat
                label="Open RMAs from flagged"
                value={String(flagged.reduce((s, r) => s + r.openCount, 0))}
                tone="warn"
              />
            </StatStrip>

            <Section title="Return rate by account (%)">
              <SimpleBarChart
                title="12-month return rate by account"
                summary="Percentage of orders returned per customer account; accounts at or above 40% with 5+ returns are flagged."
                data={chartData}
                xKey="name"
                series={[{ key: 'rate', label: 'Return rate (%)' }]}
                yFormat={(v) => `${v}%`}
                height={220}
              />
            </Section>

            <Section title="Customer returner statistics">
              <TableWrap label="Repeat flyers table">
                <Table>
                  <thead>
                    <tr>
                      <Th>Customer ref</Th>
                      <Th numeric>Orders (12m)</Th>
                      <Th numeric>Returns (12m)</Th>
                      <Th numeric>Return rate</Th>
                      <Th numeric>Sizes bracketed</Th>
                      <Th numeric>Open RMAs</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ stat, eval: ev, openCount }) => (
                      <Tr key={stat.id} data-testid={`flyer-row-${stat.customerRef}`}>
                        <Td className="font-mono text-xs font-medium">{stat.customerRef}</Td>
                        <Td numeric>{stat.orders12m}</Td>
                        <Td numeric>{stat.returns12m}</Td>
                        <Td numeric className={ev.flagged ? 'font-semibold text-warn-text' : undefined}>
                          {ev.ratePct}%
                        </Td>
                        <Td numeric>{stat.sizesBracketed}</Td>
                        <Td numeric>{openCount}</Td>
                        <Td>
                          {ev.flagged ? (
                            <Badge tone="warn" variant="soft">
                              Flagged · {ev.reason === 'both' ? 'Rate & bracketing' : ev.reason === 'bracketing' ? 'Size bracketing' : 'High rate'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              Clear{ev.rate >= SERIAL_RATE ? ` (<${SERIAL_MIN_RETURNS} returns)` : ''}
                            </Badge>
                          )}
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
    </div>
  );
}
