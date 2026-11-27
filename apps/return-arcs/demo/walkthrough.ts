import type { DemoScript } from '@x10/shared/demo';

const LEAD = 'demo-lead-alex';
const GRADER = 'demo-grader-sam';

export const script: DemoScript = {
  title: 'Return Arcs: post-holiday returns grading, recovery value routing, and repeat-returner signals',
  persona: LEAD,
  scenes: [
    {
      id: 'hook',
      say: [
        'Cyber Monday returns arrive all through December and January, and without grading every box goes straight back to shelf or costs more to handle than it is worth.',
        'Return Arcs draws the whole reverse-logistics flow as boomerang arcs flying in from four regions to a central dock and fanning out to six disposition bays.',
      ],
      async run(h) {
        await h.goto('/', LEAD);
        await h.pause(3500);
      },
    },
    {
      id: 'lenses',
      say: [
        'Arc thickness shows unit volume, dash speed tracks age, and arc height out of the dock is net recovery value.',
        'Switch to the recovery lens and scrap arcs sag visibly below the zero-dollar baseline so value loss stands out immediately.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Recovery/ }));
        await h.pause(3000);
      },
    },
    {
      id: 'today',
      say: [
        'Today ranks what needs attention right now: nine returns past the forty-eight-hour grading target, four write-offs and high refunds waiting for the lead, and five returnless candidates.',
        'Selecting the overdue cohort dims everything else and highlights the withering dashes still sitting at the dock.',
      ],
      async run(h) {
        await h.spotlight(h.page.getByRole('complementary', { name: 'Today' }), 2200);
        await h.click(h.page.getByRole('button', { name: /Ungraded past 48h target/ }));
        await h.pause(3000);
      },
    },
    {
      id: 'view-as',
      say: [
        'Switching View As to Grader brings ungraded dock arrivals forward; Returns Lead dims them to spotlight pending write-offs and refunds over five hundred dollars.',
      ],
      async run(h) {
        await h.page.keyboard.press('Escape');
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Grader' }));
        await h.pause(2800);
      },
    },
    {
      id: 'dock-returnless',
      say: [
        'At the Dock, entering a twelve-dollar mug with seven dollars of handling triggers Rule Three immediately and offers a returnless refund.',
        'The same form checks the holiday return window: November twenty-eighth orders stay in window through January thirty-first, while December twenty-eighth orders past thirty days are marked late.',
      ],
      async run(h) {
        await h.goto('/dock', GRADER);
        await h.select(h.page.getByLabel('Category'), 'Home');
        await h.fill(h.page.getByLabel('Unit price ($)'), '12');
        await h.spotlight(h.page.getByTestId('returnless-offer'), 2800);
      },
    },
    {
      id: 'bench-serial',
      say: [
        'On the Grading bench, a customer with five returns out of ten orders surfaces a fifty-percent repeat-returner banner for awareness without ever auto-denying.',
      ],
      async run(h) {
        await h.goto('/bench', GRADER);
        await h.spotlight(h.page.getByTestId('serial-returner-banner'), 2800);
      },
    },
    {
      id: 'fork-ladder',
      say: [
        'At the Fork, the recovery ladder computes every bay side by side. For a Grade C return, Restock is locked out with the exact rule explanation.',
      ],
      async run(h) {
        await h.goto('/fork', GRADER);
        await h.spotlight(h.page.getByTestId('ladder-row-restock'), 3000);
      },
    },
    {
      id: 'write-offs',
      say: [
        'Finally, in the Write-off book, a six-hundred-twenty-dollar projector refund stays pending until the Returns lead approves and releases it.',
      ],
      async run(h) {
        await h.goto('/write-offs', LEAD);
        await h.spotlight(h.page.getByTestId('writeoff-row-RMA-1001'), 2500);
        await h.click(h.page.getByTestId('approve-btn-RMA-1001'));
        await h.click(h.page.getByRole('button', { name: 'Approve and release' }));
        await h.pause(2500);
      },
    },
    {
      id: 'close',
      say: ['Return Arcs: every return graded on time, routed to its highest recovery value, and governed by clear rules.'],
      async run(h) {
        await h.goto('/', LEAD);
        await h.pause(3500);
      },
    },
  ],
};
