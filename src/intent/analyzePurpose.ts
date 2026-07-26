import type { PurposeSignals } from '../types';

const groups = {
  structural: ['bracket','holder','mount','adapter','load','structural','screw','tool','gear','hinge','clip','clamp','fäste','bärande'],
  fitCritical: ['fit','fitting','tolerance','bearing','shaft','hole','thread','snap','pressfit','dimension','passning'],
  flexible: ['flex','soft','flexible','gasket','damper','grip','rubber','mjuk'],
  weatherExposed: ['outdoor','outside','uv','rain','weather','sun','utomhus'],
  heatExposed: ['heat','warm','engine','car','oven','heater','temperature','värme']
} as const;

export function analyzePurpose(purpose: string): PurposeSignals {
  const text = purpose.toLocaleLowerCase('en-US');
  const hits = (words: readonly string[]) => words.filter(word => text.includes(word));
  const matched = Object.fromEntries(Object.entries(groups).map(([key, words]) => [key, hits(words)]));
  return {
    structural: matched.structural.length > 0,
    fitCritical: matched.fitCritical.length > 0,
    flexible: matched.flexible.length > 0,
    weatherExposed: matched.weatherExposed.length > 0,
    heatExposed: matched.heatExposed.length > 0,
    keywords: [...new Set(Object.values(matched).flat())]
  };
}
