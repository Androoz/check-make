import type { BriefInference, ChecklistField, Questionnaire } from '../types';

type Candidate<K extends ChecklistField> = { field: K; value: Questionnaire[K]; confidence: number; terms: string[] };
const has=(text:string,terms:string[])=>terms.filter(term=>text.includes(term));

export function inferBrief(purpose:string,properties:string):BriefInference {
  const text=`${purpose} ${properties}`.toLocaleLowerCase('en-US');
  const choose=<K extends ChecklistField>(fallback:Candidate<K>,candidates:Candidate<K>[])=>{
    const matches=candidates.map(candidate=>({...candidate,evidence:has(text,candidate.terms)})).filter(candidate=>candidate.evidence.length).sort((a,b)=>b.confidence-a.confidence);
    const winner=matches[0];return winner?{value:winner.value,confidence:winner.confidence,evidence:winner.evidence}:{value:fallback.value,confidence:fallback.confidence,evidence:[]};
  };
  return {
    environment:choose({field:'environment',value:'indoor',confidence:.55,terms:[]},[{field:'environment',value:'outdoor',confidence:.93,terms:['outdoor','outside','weather','rain','sunlight','uv','garden','marine']}]),
    load:choose({field:'load',value:'static',confidence:.55,terms:[]},[{field:'load',value:'cyclic',confidence:.9,terms:['repeated','cyclic','moving','hinge','gear','vibration','flexes','opens and closes']},{field:'load',value:'none',confidence:.82,terms:['decorative','display only','ornament','no load']},{field:'load',value:'static',confidence:.78,terms:['holds','supports','mounted','bracket','shelf','constant load']}]),
    impact:choose({field:'impact',value:'none',confidence:.5,terms:[]},[{field:'impact',value:'high',confidence:.93,terms:['heavy impact','hard impacts','hammer','sports','struck','drop resistant','high impact']},{field:'impact',value:'medium',confidence:.82,terms:['impact','knock','bump','dropped','tough','durable']}]),
    heat:choose({field:'heat',value:'normal',confidence:.55,terms:[]},[{field:'heat',value:'hot',confidence:.92,terms:['engine bay','oven','over 70','high heat','hot car','exhaust']},{field:'heat',value:'warm',confidence:.84,terms:['warm','heat resistant','sun-heated','45–70','45-70']}]),
    priority:choose({field:'priority',value:'strength',confidence:.58,terms:[]},[{field:'priority',value:'flexibility',confidence:.95,terms:['flexible','soft','rubber','gasket','bendable']},{field:'priority',value:'accuracy',confidence:.92,terms:['accurate fit','tolerance','press fit','snap fit','dimensionally accurate','bearing','thread']},{field:'priority',value:'finish',confidence:.9,terms:['smooth','surface finish','visible face','cosmetic','display quality']},{field:'priority',value:'speed',confidence:.88,terms:['quick prototype','fast print','draft','print time']},{field:'priority',value:'strength',confidence:.82,terms:['strong','strength','structural','load-bearing','load bearing','bracket']}]),
    supportsAllowed:choose({field:'supportsAllowed',value:true,confidence:.6,terms:[]},[{field:'supportsAllowed',value:false,confidence:.96,terms:['no supports','support-free','without supports','avoid support']}])
  };
}

export function applyInference(answers:Questionnaire,inference:BriefInference,manual:Set<ChecklistField>):Questionnaire {
  const next={...answers};const writable=next as unknown as Record<ChecklistField,unknown>;
  (Object.keys(inference) as ChecklistField[]).forEach(field=>{if(!manual.has(field))writable[field]=inference[field].value});return next;
}
