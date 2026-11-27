import { useCallback, useMemo, useState } from 'react';
import { Keyboard, X } from 'lucide-react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  DataState,
  Dialog,
  FloatingPanel,
  IconButton,
  Kbd,
  Legend,
  LensBar,
  LinkButton,
  StagePage,
  TodayPanel,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useThemeColors,
  type LegendItem,
  type LensOption,
  type TodayItem,
} from '@x10/shared/ui';

import { ValueLadder } from '../components/ValueLadder';
import { DISPOSITION_LABELS, ORIGIN_LABELS, REASON_LABELS, STATUS_LABELS } from '../domain/config';
import { enrichReturns, loadWorkspace } from '../domain/returns';
import type { Schema } from '../model';
import { ArcList } from '../stage/ArcList';
import { BoomerangStage, type ArcLens, type FocusFilter, type ViewRole } from '../stage/BoomerangStage';

const LENSES: LensOption<ArcLens>[] = [
  { value: 'grade', label: 'Grade', description: 'Arc colour by inspection grade A–D' },
  { value: 'recovery', label: 'Recovery', description: 'Positive recovery vs net loss sag' },
  { value: 'volume', label: 'Volume', description: 'Unit count per return' },
  { value: 'reason', label: 'Reason', description: 'Defective, sizing, changed mind, or late' },
  { value: 'days', label: 'Days', description: '48-hour grading SLA & age' },
];

export function HomePage() {
  const { store, me } = useApp<Schema>();
  const colors = useThemeColors();

  const [view, setView] = useState<'stage' | 'list'>('stage');
  const [lens, setLens] = useState<ArcLens>('grade');
  const [role, setRole] = useState<ViewRole>(me.isAdmin ? 'lead' : 'grader');
  const [focus, setFocus] = useState<FocusFilter>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(() => loadWorkspace(store), [store]);
  const state = useAsync(load, [load]);
  usePolling(state.reload, 5000);

  useHotkeys({
    'shift+?': () => setHelpOpen((o) => !o),
    escape: () => {
      if (selectedId) setSelectedId(null);
      else if (focus.kind !== 'all') setFocus({ kind: 'all' });
    },
  });

  const enriched = useMemo(() => {
    if (!state.data) return [];
    return enrichReturns(state.data.cases, state.data.policies, state.data.returners, state.data.now);
  }, [state.data]);

  const counts = useMemo(() => {
    const overdue = enriched.filter((e) => e.overdue48h);
    const leadWait = enriched.filter((e) => e.needsLead);
    const serialOpen = enriched.filter((e) => e.serial?.flagged && e.item.status !== 'closed');
    const returnless = enriched.filter((e) => e.returnlessCandidate);
    const late = enriched.filter((e) => e.item.reason === 'late');
    const netRecovery = enriched.reduce((sum, e) => sum + e.recoveryValue, 0);
    return { overdue, leadWait, serialOpen, returnless, late, netRecovery };
  }, [enriched]);

  const todayItems: TodayItem[] = useMemo(() => {
    const list: TodayItem[] = [];
    if (counts.overdue.length > 0) {
      list.push({
        id: 'overdue',
        title: 'Ungraded past 48h target',
        severity: 'bad',
        value: String(counts.overdue.length),
        unit: 'returns',
        lens: 'days',
        meta: 'Withering dashes on incoming arcs',
      });
    }
    if (counts.leadWait.length > 0) {
      list.push({
        id: 'lead',
        title: 'Write-offs & refunds > $500',
        severity: 'warn',
        value: String(counts.leadWait.length),
        unit: 'awaiting lead',
        lens: 'recovery',
        meta: 'Approve in Write-off book',
      });
    }
    if (counts.serialOpen.length > 0) {
      list.push({
        id: 'serial',
        title: 'Serial returners with open RMAs',
        severity: 'warn',
        value: String(counts.serialOpen.length),
        unit: 'flagged',
        lens: 'grade',
        meta: 'Visible to grader · never auto-denied',
      });
    }
    if (counts.returnless.length > 0) {
      list.push({
        id: 'returnless',
        title: 'Returnless refund candidates',
        severity: 'info',
        value: String(counts.returnless.length),
        unit: 'offers',
        lens: 'recovery',
        meta: 'Return cost > 50% of unit price',
      });
    }
    if (counts.late.length > 0) {
      list.push({
        id: 'late',
        title: 'Beyond return window',
        severity: 'bad',
        value: String(counts.late.length),
        unit: 'late',
        lens: 'reason',
        meta: 'Needs Returns lead exception',
      });
    }
    return list;
  }, [counts]);

  const legendItems: LegendItem[] = useMemo(() => {
    const teal = colors.dark ? '#52b8a8' : '#1f7a6c';
    const plum = colors.dark ? '#c77db5' : '#8a3d79';
    switch (lens) {
      case 'grade':
        return [
          { label: 'Grade A (Restock)', color: colors.accent[9], shape: 'line' },
          { label: 'Grade B (Open-Box)', color: colors.info, shape: 'line' },
          { label: 'Grade C (No Restock)', color: plum, shape: 'line' },
          { label: 'Grade D (Damaged)', color: colors.bad, shape: 'line' },
          { label: 'Ungraded / >48h', color: colors.warn, shape: 'dash' },
        ];
      case 'recovery':
        return [
          { label: 'High recovery (>$60)', color: colors.accent[9], shape: 'line' },
          { label: 'Modest ($0–$60)', color: colors.info, shape: 'line' },
          { label: 'Net loss (sags below)', color: colors.bad, shape: 'dash' },
        ];
      case 'volume':
        return [
          { label: '3+ units (thick arc)', color: colors.accent[9], shape: 'line' },
          { label: '2 units', color: plum, shape: 'line' },
          { label: '1 unit', color: colors.info, shape: 'line' },
        ];
      case 'reason':
        return [
          { label: 'Defective', color: colors.bad, shape: 'line' },
          { label: 'Wrong size', color: colors.accent[9], shape: 'line' },
          { label: 'Changed mind', color: colors.info, shape: 'line' },
          { label: 'Not as described', color: plum, shape: 'line' },
          { label: 'Gift return', color: teal, shape: 'line' },
          { label: 'Late window', color: colors.warn, shape: 'dash' },
        ];
      case 'days':
        return [
          { label: 'On time (<48h)', color: teal, shape: 'line' },
          { label: 'Aging (>5d open)', color: colors.warn, shape: 'line' },
          { label: 'Overdue >48h at dock', color: colors.bad, shape: 'dash' },
        ];
    }
  }, [lens, colors]);

  const activeTodayId = focus.kind !== 'all' && focus.kind !== 'case' ? focus.kind : null;

  const handleTodaySelect = (it: TodayItem) => {
    const nextKind = it.id as Exclude<FocusFilter['kind'], 'all' | 'case'>;
    if (focus.kind === nextKind) {
      setFocus({ kind: 'all' });
    } else {
      setFocus({ kind: nextKind });
      if (it.lens) setLens(it.lens as ArcLens);
    }
    setSelectedId(null);
  };

  const selectedReturn = useMemo(
    () => (selectedId ? enriched.find((e) => e.item.id === selectedId) ?? null : null),
    [enriched, selectedId],
  );

  const breadcrumb = useMemo(() => {
    const crumbs: Array<{ label: string; onClick?: () => void }> = [
      { label: 'Return Arcs', onClick: () => { setFocus({ kind: 'all' }); setSelectedId(null); } },
    ];
    if (selectedReturn) {
      crumbs.push({ label: selectedReturn.item.rmaNo });
    } else if (focus.kind !== 'all') {
      const label = String(todayItems.find((t) => t.id === focus.kind)?.title ?? focus.kind);
      crumbs.push({ label });
    } else {
      crumbs.push({ label: 'All regions' });
    }
    return crumbs;
  }, [focus, selectedReturn, todayItems]);

  return (
    <DataState state={state} loadingRows={4}>
      {() => (
        <>
          <StagePage
            label="Return Arcs compass stage"
            view={view}
            breadcrumb={breadcrumb}
            title="The boomerang plane"
            meta={`${enriched.length} returns · net recovery ${counts.netRecovery >= 0 ? `+$${Math.round(counts.netRecovery).toLocaleString()}` : `−$${Math.abs(Math.round(counts.netRecovery)).toLocaleString()}`}`}
            topRight={
              <div className="flex items-center gap-2">
                <IconButton
                  label="Keyboard shortcuts (?)"
                  icon={<Keyboard size={16} />}
                  variant="subtle"
                  onClick={() => setHelpOpen(true)}
                />
                <ViewToggle
                  value={view}
                  onChange={setView}
                  stageLabel="Arcs"
                  listLabel="List"
                  glass={view === 'stage'}
                />
              </div>
            }
            lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} glass />}
            legend={<Legend title={LENSES.find((l) => l.value === lens)?.label ?? 'Key'} items={legendItems} collapsible />}
            bottomRight={
              <ViewAsSwitch
                options={[
                  { value: 'grader', label: 'Grader' },
                  { value: 'lead', label: 'Lead' },
                ]}
                value={role}
                onChange={(v) => setRole(v as ViewRole)}
                glass
              />
            }
            side={
              <TodayPanel
                bare
                items={todayItems}
                activeId={activeTodayId}
                onSelect={handleTodaySelect}
                empty="All returns within SLA and routed."
              />
            }
            sideCount={todayItems.length}
            stage={
              <div className="relative h-full w-full">
                <BoomerangStage
                  items={enriched}
                  lens={lens}
                  role={role}
                  focus={focus}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  now={state.data?.now ?? new Date()}
                />

                {selectedReturn && (
                  <div className="pointer-events-auto absolute left-4 top-20 z-20 w-[320px] max-w-[calc(100%-2rem)]">
                    <FloatingPanel
                      title={selectedReturn.item.rmaNo}
                      actions={
                        <IconButton
                          label="Close inspector"
                          icon={<X size={14} />}
                          size="sm"
                          onClick={() => setSelectedId(null)}
                        />
                      }
                      padding="md"
                    >
                      <div className="space-y-3" data-testid="arc-inspector">
                        <div>
                          <div className="text-sm font-semibold text-fg">{selectedReturn.item.productName}</div>
                          <div className="text-xs text-muted">
                            {ORIGIN_LABELS[selectedReturn.item.origin]} · {REASON_LABELS[selectedReturn.item.reason]} ·{' '}
                            {selectedReturn.item.units}u · ${selectedReturn.item.unitPrice.toFixed(2)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={selectedReturn.overdue48h ? 'bad' : 'info'}>
                            {STATUS_LABELS[selectedReturn.item.status]}
                          </Badge>
                          {selectedReturn.item.grade && (
                            <Badge tone="brand" variant="soft">
                              Grade {selectedReturn.item.grade}
                            </Badge>
                          )}
                          {selectedReturn.item.disposition && (
                            <Badge tone="neutral" variant="outline">
                              {DISPOSITION_LABELS[selectedReturn.item.disposition]}
                            </Badge>
                          )}
                          {selectedReturn.serial?.flagged && (
                            <Badge tone="warn" variant="soft">
                              Serial {selectedReturn.serial.ratePct}%
                            </Badge>
                          )}
                        </div>

                        {selectedReturn.ladder && (
                          <ValueLadder
                            ladder={selectedReturn.ladder}
                            selected={
                              selectedReturn.item.disposition && selectedReturn.item.disposition !== 'returnless'
                                ? selectedReturn.item.disposition
                                : null
                            }
                            compact
                          />
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {selectedReturn.item.status === 'received' && (
                            <LinkButton to={`/bench?id=${selectedReturn.item.id}`} size="sm" variant="primary">
                              Grade at bench
                            </LinkButton>
                          )}
                          {selectedReturn.item.status === 'graded' && (
                            <LinkButton to={`/fork?id=${selectedReturn.item.id}`} size="sm" variant="primary">
                              Route at fork
                            </LinkButton>
                          )}
                          {selectedReturn.needsLead && (
                            <LinkButton to="/write-offs" size="sm" variant="secondary">
                              Write-off book
                            </LinkButton>
                          )}
                          {selectedReturn.item.status === 'requested' && (
                            <LinkButton to="/dock" size="sm" variant="primary">
                              Receive at dock
                            </LinkButton>
                          )}
                        </div>
                      </div>
                    </FloatingPanel>
                  </div>
                )}
              </div>
            }
            list={<ArcList items={enriched} />}
          />

          <Dialog
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            title="Keyboard shortcuts"
            footer={<Button onClick={() => setHelpOpen(false)}>Close</Button>}
          >
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
              <dt><Kbd>1</Kbd>–<Kbd>5</Kbd></dt><dd className="text-muted">Switch active lens</dd>
              <dt><Kbd>V</Kbd></dt><dd className="text-muted">Cycle View as (Grader / Returns lead)</dd>
              <dt><Kbd>L</Kbd></dt><dd className="text-muted">Toggle Arcs stage and accessible List view</dd>
              <dt><Kbd>Esc</Kbd></dt><dd className="text-muted">Clear arc selection or Today focus</dd>
              <dt><Kbd>?</Kbd></dt><dd className="text-muted">Open or close this shortcuts sheet</dd>
            </dl>
          </Dialog>
        </>
      )}
    </DataState>
  );
}
