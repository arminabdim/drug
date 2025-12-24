
export interface MedicineVariant {
  manufacturer: string;
  dosage: string;
  form: string;
  price: number;
  isShortage: boolean;
}

export interface Medicine {
  id: string;
  genericName: string;
  variants: MedicineVariant[];
  category: string;
  lastUpdated: string;
  indications?: string; // موارد مصرف
}

export enum ViewType {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  SHORTAGES = 'SHORTAGES',
  STRATEGY = 'STRATEGY',
  SETTINGS = 'SETTINGS'
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ShortageInsight {
  text: string;
  sources: GroundingSource[];
}
