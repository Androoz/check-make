import type { PrinterProfile } from '../types';

export const printerProfiles: PrinterProfile[] = [
  {id:'bambu-x1c',manufacturer:'Bambu Lab',familyId:'bambu-x1',family:'X1',variant:'Carbon',model:'X1 Carbon',maxNozzleTempC:300,maxBedTempC:110,enclosed:true,hardenedNozzle:true,buildVolume:{x:256,y:256,z:256},notes:'Engineering materials and fiber-reinforced polymers supported.'},
  {id:'bambu-p1s',manufacturer:'Bambu Lab',familyId:'bambu-p1',family:'P1',variant:'P1S',model:'P1S',maxNozzleTempC:300,maxBedTempC:100,enclosed:true,hardenedNozzle:false,buildVolume:{x:256,y:256,z:256},notes:'Hardened hotend and extruder upgrade required for abrasive composites.'},
  {id:'bambu-a1',manufacturer:'Bambu Lab',familyId:'bambu-a1',family:'A1',variant:'A1',model:'A1',maxNozzleTempC:300,maxBedTempC:100,enclosed:false,hardenedNozzle:false,buildVolume:{x:256,y:256,z:256},notes:'Open-frame printer; avoid enclosure-dependent materials.'},
  {id:'bambu-a1-mini',manufacturer:'Bambu Lab',familyId:'bambu-a1',family:'A1',variant:'mini',model:'A1 mini',maxNozzleTempC:300,maxBedTempC:80,enclosed:false,hardenedNozzle:false,buildVolume:{x:180,y:180,z:180},notes:'Compact open-frame build volume.'},
  {id:'prusa-mk4s',manufacturer:'Prusa',familyId:'prusa-mk4',family:'MK4',variant:'MK4S',model:'MK4S',maxNozzleTempC:290,maxBedTempC:120,enclosed:false,hardenedNozzle:false,buildVolume:{x:250,y:210,z:220},notes:'Open-frame; abrasive materials require a suitable nozzle.'},
  {id:'prusa-core-one',manufacturer:'Prusa',familyId:'prusa-core-one',family:'CORE One',variant:'CORE One',model:'CORE One',maxNozzleTempC:290,maxBedTempC:120,enclosed:true,hardenedNozzle:false,buildVolume:{x:250,y:220,z:270},notes:'Enclosed chamber; abrasive materials require a suitable nozzle.'},
  {id:'creality-k1c',manufacturer:'Creality',familyId:'creality-k1',family:'K1',variant:'K1C',model:'K1C',maxNozzleTempC:300,maxBedTempC:100,enclosed:true,hardenedNozzle:true,buildVolume:{x:220,y:220,z:250},notes:'Enclosed and designed for common carbon-fiber composites.'},
  {id:'creality-ender3-v3',manufacturer:'Creality',familyId:'creality-ender3-v3',family:'Ender-3 V3',variant:'V3',model:'Ender-3 V3',maxNozzleTempC:300,maxBedTempC:110,enclosed:false,hardenedNozzle:false,buildVolume:{x:220,y:220,z:250},notes:'Open-frame; verify nozzle before abrasive materials.'},
  {id:'creality-ender3-v3-se',manufacturer:'Creality',familyId:'creality-ender3-v3',family:'Ender-3 V3',variant:'SE',model:'Ender-3 V3 SE',maxNozzleTempC:260,maxBedTempC:100,enclosed:false,hardenedNozzle:false,buildVolume:{x:220,y:220,z:250},notes:'Open-frame; official material support is PLA, PETG, and TPU (95A).'},
  {id:'creality-ender3-v3-ke',manufacturer:'Creality',familyId:'creality-ender3-v3',family:'Ender-3 V3',variant:'KE',model:'Ender-3 V3 KE',maxNozzleTempC:300,maxBedTempC:100,enclosed:false,hardenedNozzle:false,buildVolume:{x:220,y:220,z:240},notes:'Open-frame; supports PLA, PETG, ABS, ASA, and TPU (95A).'},
  {id:'elegoo-neptune4pro',manufacturer:'ELEGOO',familyId:'elegoo-neptune4',family:'Neptune 4',variant:'Pro',model:'Neptune 4 Pro',maxNozzleTempC:300,maxBedTempC:110,enclosed:false,hardenedNozzle:false,buildVolume:{x:225,y:225,z:265},notes:'Open-frame; enclosure and nozzle upgrades may be required.'},
  {id:'anycubic-kobra3',manufacturer:'Anycubic',familyId:'anycubic-kobra3',family:'Kobra 3',variant:'Kobra 3',model:'Kobra 3',maxNozzleTempC:300,maxBedTempC:110,enclosed:false,hardenedNozzle:false,buildVolume:{x:250,y:250,z:260},notes:'Open-frame; verify installed nozzle for composites.'}
];

// Used only while a project has no target printer. Its deliberately broad
// capabilities prevent an arbitrary real printer from constraining the plan;
// compatibility is checked once the user selects an actual profile.
export const printerAgnosticProfile: PrinterProfile = {
  id: 'unselected', manufacturer: 'Unspecified', familyId: 'unselected', family: 'Unspecified',
  variant: 'Unspecified', model: 'No printer selected', maxNozzleTempC: 500, maxBedTempC: 200,
  enclosed: true, hardenedNozzle: true, buildVolume: { x: 10000, y: 10000, z: 10000 },
  notes: 'Internal printer-agnostic planning profile. It is never an export target.',
};

export interface PrinterFamilyGroup {
  id: string;
  manufacturer: string;
  family: string;
  profiles: PrinterProfile[];
}

export const printerFamilies: PrinterFamilyGroup[] = printerProfiles.reduce<PrinterFamilyGroup[]>((groups, profile) => {
  const existing = groups.find(group => group.id === profile.familyId);
  if (existing) existing.profiles.push(profile);
  else groups.push({id: profile.familyId, manufacturer: profile.manufacturer, family: profile.family, profiles: [profile]});
  return groups;
}, []);

export const getPrinter = (id: string) => printerProfiles.find(p=>p.id===id) ?? printerProfiles[0];
