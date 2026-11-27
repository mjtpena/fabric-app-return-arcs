/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

export const personas: Persona[] = [
  { sub: 'demo-lead-alex', name: 'Alex Rivera', email: 'alex@example.com', isAdmin: true, role: 'Returns lead' },
  { sub: 'demo-grader-sam', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Grader' },
  { sub: 'demo-viewer-jordan', name: 'Jordan Lee', email: 'jordan@example.com', isAdmin: false, role: 'Viewer' },
];

export const config: AppConfig<Schema> = {
  appId: 'return-arcs',
  title: 'Return Arcs',
  tagline: 'Returns grading, recovery value routing & repeat-returner signals',
  accent: 'orange',
  logoPaths: [
    'M4 11C4 6.5 8 4 12 4C16 4 19.5 6.5 20 11',
    'M20 11L17.5 9.5M20 11L21 8.2',
    'M12 11C10 15.5 7 18.5 4.5 19.5',
    'M12 11C14 15.5 17 18.5 19.5 19.5',
    'M12 11V19.5',
  ],
  defs,
  personas,
  seed,
  nav: [
    { to: '/', label: 'Arcs', end: true },
    { to: '/dock', label: 'Dock' },
    { to: '/bench', label: 'Grading bench' },
    { to: '/fork', label: 'Fork' },
    { to: '/write-offs', label: 'Write-off book' },
    { to: '/flyers', label: 'Repeat flyers' },
    { to: '/about', label: 'About' },
  ],
};
