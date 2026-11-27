import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import {
  Badge,
  FilterSelect,
  SearchInput,
  Table,
  TableWrap,
  Td,
  Th,
  Toolbar,
  Tr,
} from '@x10/shared/ui';

import { ValueLadder } from '../components/ValueLadder';
import { CATEGORY_LABELS, DISPOSITION_LABELS, ORIGIN_LABELS, REASON_LABELS, STATUS_LABELS } from '../domain/config';
import type { EnrichedReturn } from '../domain/returns';
import { CATEGORIES, ORIGINS } from '../model';

interface ArcListProps {
  items: EnrichedReturn[];
}

export function ArcList({ items }: ArcListProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(items.find((e) => e.ladder)?.item.id ?? null);

  const filtered = items.filter((e) => {
    if (category !== 'all' && e.item.category !== category) return false;
    if (origin !== 'all' && e.item.origin !== origin) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        e.item.rmaNo.toLowerCase().includes(q) ||
        e.item.productName.toLowerCase().includes(q) ||
        e.item.sku.toLowerCase().includes(q) ||
        e.item.customerRef.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6" data-testid="arc-list">
      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Search returns"
          placeholder="Search RMA, SKU, product, customer…"
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]}
        />
        <FilterSelect
          label="Origin"
          value={origin}
          onChange={setOrigin}
          options={[{ value: 'all', label: 'All' }, ...ORIGINS.map((o) => ({ value: o, label: ORIGIN_LABELS[o] }))]}
        />
      </Toolbar>

      <TableWrap label="Returns table with recovery value ladder">
        <Table>
          <thead>
            <tr>
              <Th>RMA</Th>
              <Th>Item</Th>
              <Th>Origin</Th>
              <Th>Status</Th>
              <Th>Grade</Th>
              <Th>Disposition</Th>
              <Th numeric>Recovery</Th>
              <Th numeric>Refund</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const open = expandedId === e.item.id;
              return (
                <Fragment key={e.item.id}>
                  <Tr
                    selected={open}
                    onClick={() => setExpandedId(open ? null : e.item.id)}
                  >
                    <Td>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-fg"
                        aria-expanded={open}
                      >
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {e.item.rmaNo}
                      </button>
                    </Td>
                    <Td>
                      <div className="font-medium text-fg">{e.item.productName}</div>
                      <div className="text-xs text-muted">
                        {CATEGORY_LABELS[e.item.category]} · {REASON_LABELS[e.item.reason]} · {e.item.customerRef}
                        {e.serial?.flagged && (
                          <span className="ml-1.5 text-warn-text font-medium">· Serial ({e.serial.ratePct}%)</span>
                        )}
                      </div>
                    </Td>
                    <Td muted>{ORIGIN_LABELS[e.item.origin]}</Td>
                    <Td>
                      <Badge
                        tone={e.overdue48h ? 'bad' : e.needsLead ? 'warn' : e.item.status === 'closed' ? 'ok' : 'info'}
                      >
                        {e.overdue48h ? 'Overdue >48h' : STATUS_LABELS[e.item.status]}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">{e.item.grade ?? '—'}</span>
                    </Td>
                    <Td>
                      {e.item.disposition ? DISPOSITION_LABELS[e.item.disposition] : e.returnlessCandidate ? 'Returnless offer' : 'Pending'}
                    </Td>
                    <Td numeric>
                      <span className={e.recoveryValue < 0 ? 'text-bad-text' : 'text-fg'}>
                        {e.recoveryValue >= 0 ? `+$${e.recoveryValue.toFixed(2)}` : `−$${Math.abs(e.recoveryValue).toFixed(2)}`}
                      </span>
                    </Td>
                    <Td numeric>
                      ${e.item.refundAmount.toFixed(2)}
                    </Td>
                  </Tr>
                  {open && (
                    <tr key={`${e.item.id}-ladder`} className="bg-surface-sunken/50">
                      <td colSpan={8} className="px-4 py-3">
                        {e.ladder ? (
                          <div className="space-y-2">
                            <div className="text-xs font-mono uppercase tracking-wider text-muted">
                              Recovery value ladder (Grade {e.item.grade} · {e.item.units} unit{e.item.units > 1 ? 's' : ''})
                            </div>
                            <ValueLadder ladder={e.ladder} selected={e.item.disposition && e.item.disposition !== 'returnless' ? e.item.disposition : null} />
                          </div>
                        ) : (
                          <div className="text-xs text-muted">
                            Not yet graded.{' '}
                            {e.returnlessCandidate
                              ? `Qualifies for returnless refund: handling + shipping ($${e.returnlessEval.totalReturnCost.toFixed(2)}) exceeds 50% of $${e.item.unitPrice.toFixed(2)}.`
                              : 'Grade at the Grading bench to unlock the disposition value ladder.'}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
