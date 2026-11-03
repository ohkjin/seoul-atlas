import {SOURCES} from './sources';

// The studies the atlas carries. Each dataset (sources.ts) names the studies that use it, and a
// variable is tagged with its dataset's — so narrowing the atlas to a study is a lookup, and a
// later study or a public layer that UHUS does not use simply carries other tags. The card's
// wording is drafted from the Data page and RHSI's definition, for the lab to confirm.
export type Project = {id: string; name: string; line: string; about: string;
  question: string; index: string; data: string; period: string; by: string};
export const PROJECTS: Project[] = [{
  id: 'UHUS', name: 'Urban Heat / Urban Sales', line: 'How hot days change neighbourhood retail sales',
  about: 'How hot days change neighbourhood retail sales across Seoul in 2024 — which places lose sales in the heat, ' +
    'and what about them explains it.',
  question: 'Retail heat sensitivity per neighbourhood', index: 'RHSI, with a model’s SHAP explanation',
  data: 'KMA weather · card sales (restricted) · urban context', period: '2024, daily', by: 'UHUS analysis, Seoul AI Foundation data',
}];
export const projectsOf = (key: string) => SOURCES.find((s) => s.vars.includes(key))?.projects ?? [];
export const inProject = (key: string, project: string | null) => !project || projectsOf(key).includes(project);
