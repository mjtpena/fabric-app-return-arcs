import { Callout, PageHeader, Section, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import {
  DAMAGE_FEE_PCT,
  GRADING_SLA_HOURS,
  LEAD_REFUND_OVER,
  RETURNLESS_RATIO,
  SERIAL_MIN_BRACKETED_SIZES,
  SERIAL_MIN_RETURNS,
  SERIAL_RATE,
  STANDARD_WINDOW_DAYS,
} from '../domain/config';

export function AboutPage() {
  return (
    <div className="space-y-6 max-w-[920px]">
      <PageHeader
        title="About Return Arcs"
        subtitle="Post-Cyber-Week returns grading, recovery value routing, and repeat-returner signals."
      />

      <Section title="The problem">
        <p className="text-sm text-muted leading-relaxed">
          Returns from Cyber Monday arrive from the first week of December through the end of January. Without grading
          and recovery maths, every item goes straight back to shelf regardless of condition, low-value items cost more
          to ship and handle than they are worth, and repeat returners go unnoticed at the dock.
        </p>
      </Section>

      <Section title="Rules & thresholds">
        <TableWrap label="Policy thresholds from config.ts">
          <Table>
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Threshold</Th>
                <Th>Behaviour</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td className="font-medium">1. Return window</Td>
                <Td className="font-mono text-xs">{STANDARD_WINDOW_DAYS} days · Nov 1–Dec 24 → Jan 31</Td>
                <Td muted>Outside window sets reason to late and requires a Returns lead exception.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">2. Value ladder</Td>
                <Td className="font-mono text-xs">Restock Grade A only</Td>
                <Td muted>Computes net recovery across 6 bays; Grades C and D can never restock.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">3. Returnless refund</Td>
                <Td className="font-mono text-xs">Cost &gt; {Math.round(RETURNLESS_RATIO * 100)}% of price</Td>
                <Td muted>Offers refund without shipping back when handling + return shipping exceeds half the unit price.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">4. Serial returners</Td>
                <Td className="font-mono text-xs">≥{Math.round(SERIAL_RATE * 100)}% (min {SERIAL_MIN_RETURNS}) or ≥{SERIAL_MIN_BRACKETED_SIZES} sizes</Td>
                <Td muted>Surfaces a banner on the Grading bench for awareness; never auto-denies.</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">5. Refunds & SLA</Td>
                <Td className="font-mono text-xs">−{DAMAGE_FEE_PCT}% C/D non-defective · Lead &gt;${LEAD_REFUND_OVER} · {GRADING_SLA_HOURS}h SLA</Td>
                <Td muted>Refunds over ${LEAD_REFUND_OVER} and scrap/donate write-offs stay pending until the Returns lead approves.</Td>
              </Tr>
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Callout tone="neutral" title="Operational support notice">
        Return Arcs supports reverse-logistics grading and disposition workflows; it is not legal, tax, or consumer-protection advice.
      </Callout>
    </div>
  );
}
