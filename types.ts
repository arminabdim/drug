
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
}

export enum ViewType {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  CATEGORIES = 'CATEGORIES',
  SHORTAGES = 'SHORTAGES',
  ADD_NEW = 'ADD_NEW',
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
