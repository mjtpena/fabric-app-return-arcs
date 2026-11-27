import { AppMarker } from './AppMarker.js';
import { DispositionPolicy } from './DispositionPolicy.js';
import { Person } from './Person.js';
import { ReturnCase } from './ReturnCase.js';
import { ReturnerStat } from './ReturnerStat.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  ReturnCase: ReturnCase;
  DispositionPolicy: DispositionPolicy;
  ReturnerStat: ReturnerStat;
};

export const schema = [Person, AppMarker, ReturnCase, DispositionPolicy, ReturnerStat];
