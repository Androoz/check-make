import type { PrinterProfile } from '../types';

export const printerProfiles: PrinterProfile[] = [
  {id:'bambu-x1c',manufacturer:'Bambu Lab',model:'X1 Carbon',maxNozzleTempC:300,maxBedTempC:110,enclosed:true,hardenedNozzle:true,buildVolume:{x:256,y:256,z:256},notes:'Engineering materials and fiber-reinforced polymers supported.'},
  {id:'bambu-p1s',manufacturer:'Bambu Lab',model:'P1S',maxNozzleTempC:300,maxBedTempC:100,enclosed:true,hardenedNozzle:false,buildVolume:{x:256,y:256,z:256},notes:'Hardened hotend and extruder upgrade required for abrasive composites.'},
  {id:'bambu-a1',manufacturer:'Bambu Lab',model:'A1',maxNozzleTempC:300,maxBedTempC:100,enclosed:false,hardenedNozzle:false,buildVolume:{x:256,y:256,z:256},notes:'Open-frame printer; avoid enclosure-dependent materials.'},
  {id:'bambu-a1-mini',manufacturer:'Bambu Lab',model:'A1 mini',maxNozzleTempC:300,maxBedTempC:80,enclosed:false,hardenedNozzle:false,buildVolume:{x:180,y:180,z:180},notes:'Compact open-frame build volume.'},
  {id:'prusa-mk4s',manufacturer:'Prusa',model:'MK4S',maxNozzleTempC:290,maxBedTempC:120,enclosed:false,hardenedNozzle:false,buildVolume:{x:250,y:210,z:220},notes:'Open-frame; abrasive materials require a suitable nozzle.'},
  {id:'prusa-core-one',manufacturer:'Prusa',model:'CORE One',maxNozzleTempC:290,maxBedTempC:120,enclosed:true,hardenedNozzle:false,buildVolume:{x:250,y:220,z:270},notes:'Enclosed chamber; abrasive materials require a suitable nozzle.'},
  {id:'creality-k1c',manufacturer:'Creality',model:'K1C',maxNozzleTempC:300,maxBedTempC:100,enclosed:true,hardenedNozzle:true,buildVolume:{x:220,y:220,z:250},notes:'Enclosed and designed for common carbon-fiber composites.'},
  {id:'creality-ender3-v3',manufacturer:'Creality',model:'Ender-3 V3',maxNozzleTempC:300,maxBedTempC:110,enclosed:false,hardenedNozzle:false,buildVolume:{x:220,y:220,z:250},notes:'Open-frame; verify nozzle before abrasive materials.'},
  {id:'elegoo-neptune4pro',manufacturer:'ELEGOO',model:'Neptune 4 Pro',maxNozzleTempC:300,maxBedTempC:110,enclosed:false,hardenedNozzle:false,buildVolume:{x:225,y:225,z:265},notes:'Open-frame; enclosure and nozzle upgrades may be required.'},
  {id:'anycubic-kobra3',manufacturer:'Anycubic',model:'Kobra 3',maxNozzleTempC:300,maxBedTempC:110,enclosed:false,hardenedNozzle:false,buildVolume:{x:250,y:250,z:260},notes:'Open-frame; verify installed nozzle for composites.'}
];

export const getPrinter = (id: string) => printerProfiles.find(p=>p.id===id) ?? printerProfiles[0];
