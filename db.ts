
import { Medicine } from "./types";

const DB_KEY = "pharma_base_db";
const SETTINGS_KEY = "pharma_base_settings";

export const getLocalDB = (): Medicine[] => {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return [];
  try {
    return JSON.parse(atob(data)); 
  } catch {
    return [];
  }
};

export const saveToLocalDB = (medicines: Medicine[]) => {
  const encrypted = btoa(JSON.stringify(medicines));
  localStorage.setItem(DB_KEY, encrypted);
};

export const getAppSettings = () => {
  const settings = localStorage.getItem(SETTINGS_KEY);
  return settings ? JSON.parse(settings) : { batchSize: 200 };
};

export const saveAppSettings = (settings: { batchSize: number }) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const exportDB = () => {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return;
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pharmabase_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
};

export const exportToCSV = (medicines: Medicine[]) => {
  let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Farsi support
  csvContent += "نام ژنریک,دسته بندی,نام شرکت,دوز,شکل,قیمت,وضعیت کمبود\n";

  medicines.forEach(med => {
    med.variants.forEach(v => {
      csvContent += `"${med.genericName}","${med.category}","${v.manufacturer}","${v.dosage}","${v.form}",${v.price},"${v.isShortage ? 'کمیاب' : 'موجود'}"\n`;
    });
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `pharma_report_${new Date().toISOString().split('T')[0]}.csv`);
  link.click();
};

export const importDB = (fileContent: string) => {
  try {
    JSON.parse(atob(fileContent));
    localStorage.setItem(DB_KEY, fileContent);
    return true;
  } catch {
    return false;
  }
};
