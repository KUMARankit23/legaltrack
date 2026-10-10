/**
 * Adapter Dispatcher - Routes cases to appropriate court adapter
 * Supports all Indian courts: High Courts (Phase 3), Districts (Phase 4), Tribunals (Phase 5)
 */

import { ICourtSourceAdapter } from "./adapter.interface";
import { DelhiHCAdapter } from "./courts/delhiHCAdapter";
import { BombayHCAdapter } from "./courts/bombayHCAdapter";
import { MadrasHCAdapter } from "./courts/madrasHCAdapter";
import { KolkataHCAdapter } from "./courts/kolkataHCAdapter";
import { ChennaiHCAdapter } from "./courts/chennaiHCAdapter";
import { PunjabHCAdapter } from "./courts/punjabHCAdapter";
import { GujaratHCAdapter } from "./courts/gujaratHCAdapter";
import { RajasthanHCAdapter } from "./courts/rajasthanHCAdapter";
import { KeralaHCAdapter } from "./courts/keralaHCAdapter";
import { MaharashtraHCAdapter } from "./courts/maharashtraHCAdapter";
import { AllahabadHCAdapter } from "./courts/allahabadHCAdapter";
import { JharkhandHCAdapter } from "./courts/jharkhandHCAdapter";
import { OrissaHCAdapter } from "./courts/orissaHCAdapter";
import { TelanganaHCAdapter } from "./courts/telanganaHCAdapter";
import { GuwahatiHCAdapter } from "./courts/guwahatiHCAdapter";
import { UttarakhandHCAdapter } from "./courts/uttarakhandHCAdapter";
import { JKHCAdapter } from "./courts/jkHCAdapter";
import { HimachalHCAdapter } from "./courts/himachalHCAdapter";
import { ChhattisgarHCAdapter } from "./courts/chhattisgarHCAdapter";
import { BiharHCAdapter } from "./courts/biharHCAdapter";
import { MPHCAdapter } from "./courts/mpHCAdapter";
import { EcourtsDistrictAdapter } from "./ecourts/ecourtsDistrictAdapter";
import { ITATAdapter } from "./tribunals/itatAdapter";
import { NCLTAdapter } from "./tribunals/ncltAdapter";
import { NCDRAdapter } from "./tribunals/ncdrAdapter";
import { NCLATAdapter } from "./tribunals/nclatiAdapter";
import { DRTAdapter } from "./tribunals/drtAdapter";
import { CATAdapter } from "./tribunals/catAdapter";
import { NGTAdapter } from "./tribunals/ngtAdapter";

// Initialize adapters
const adapters = new Map<string, ICourtSourceAdapter>();

/**
 * Initialize all available adapters
 * Phase 2: Delhi HC (complete)
 * Phase 3: All 24 High Courts (complete)
 * Phase 4: District courts via eCourts (complete)
 * Phase 5: Tribunals - ITAT, NCLT, NCLAT, NCDRC, DRT, CAT, NGT (complete)
 */
export function initializeAdapters(): void {
  // Phase 2: Delhi HC
  adapters.set("delhi_hc", new DelhiHCAdapter());
  
  // Phase 3: All High Courts
  adapters.set("bombay_hc", new BombayHCAdapter());
  adapters.set("madras_hc", new MadrasHCAdapter());
  adapters.set("kolkata_hc", new KolkataHCAdapter());
  adapters.set("chennai_hc", new ChennaiHCAdapter());
  adapters.set("punjab_hc", new PunjabHCAdapter());
  adapters.set("gujarat_hc", new GujaratHCAdapter());
  adapters.set("rajasthan_hc", new RajasthanHCAdapter());
  adapters.set("kerala_hc", new KeralaHCAdapter());
  adapters.set("maharashtra_hc", new MaharashtraHCAdapter());
  adapters.set("allahabad_hc", new AllahabadHCAdapter());
  adapters.set("jharkhand_hc", new JharkhandHCAdapter());
  adapters.set("orissa_hc", new OrissaHCAdapter());
  adapters.set("telangana_hc", new TelanganaHCAdapter());
  adapters.set("guwahati_hc", new GuwahatiHCAdapter());
  adapters.set("uttarakhand_hc", new UttarakhandHCAdapter());
  adapters.set("jk_hc", new JKHCAdapter());
  adapters.set("himachal_hc", new HimachalHCAdapter());
  adapters.set("chhattisgarh_hc", new ChhattisgarHCAdapter());
  adapters.set("bihar_hc", new BiharHCAdapter());
  adapters.set("mp_hc", new MPHCAdapter());
  
  // Phase 4: District courts
  adapters.set("district", new EcourtsDistrictAdapter());
  
  // Phase 5: Tribunals
  adapters.set("itat", new ITATAdapter());
  adapters.set("nclt", new NCLTAdapter());
  adapters.set("nclat", new NCLATAdapter());
  adapters.set("ncdrc", new NCDRAdapter());
  adapters.set("drt", new DRTAdapter());
  adapters.set("cat", new CATAdapter());
  adapters.set("ngt", new NGTAdapter());
}

/**
 * Select adapter for a given court
 * @param courtId - Court identifier (e.g., "delhi_hc", "mumbai_hc")
 * @returns Adapter instance or null if not found
 */
export function selectAdapter(courtId: string): ICourtSourceAdapter | null {
  // Lazy init
  if (adapters.size === 0) {
    initializeAdapters();
  }
  
  return adapters.get(courtId) || null;
}

/**
 * Get all available adapters
 */
export function getAvailableAdapters(): Map<string, ICourtSourceAdapter> {
  if (adapters.size === 0) {
    initializeAdapters();
  }
  return adapters;
}
