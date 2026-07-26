import type { ModelIntelligence } from './modelIntelligence';

function articleFor(value: string) {
  return /^[aeiou]/i.test(value) ? 'an' : 'a';
}

export function describeObjectUnderstanding(intelligence: ModelIntelligence) {
  const hypothesis = intelligence.objectHypothesis;
  if (!hypothesis) return intelligence.likelyPurpose;
  const identity = hypothesis.identity.value;
  const purpose = hypothesis.purpose.value;
  const purposeKnown = purpose !== 'Not established';
  let firstSentence = purposeKnown
    ? `Check Make understands this as ${articleFor(identity)} ${identity} that ${purpose.replace(/\.$/, '')}.`
    : `Check Make currently understands this as ${articleFor(identity)} ${identity}, but its exact function still needs your review.`;
  const parentSystem = intelligence.semanticInterpretation?.parentSystem;
  if (parentSystem && parentSystem.certainty !== 'unknown' && parentSystem.value !== 'not established') {
    firstSentence = `${firstSentence} The description places it within ${articleFor(parentSystem.value)} ${parentSystem.value}, so Check Make has also considered how that complete product is normally used.`;
  }
  const environment = intelligence.requirements.environment;
  if (environment.value === 'outdoor') {
    return `${firstSentence} Because it will be used outdoors, the print plan will account for weather, sunlight, moisture, and temperature exposure.`;
  }
  const priority = intelligence.requirements.priority;
  if (priority.value === 'strength') return `${firstSentence} The plan will prioritize strength and long-term durability.`;
  if (priority.value === 'accuracy') return `${firstSentence} The plan will prioritize dimensional stability and reliable fit.`;
  if (priority.value === 'finish') return `${firstSentence} The plan will prioritize the visible surface and finish.`;
  return firstSentence;
}
