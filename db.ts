
import { Medicine } from "./types";

const DB_KEY = "pharma_base_db_v2"; // تغییر ورژن برای جلوگیری از تداخل با داده‌های قدیمی
const SETTINGS_KEY = "pharma_base_settings";

// متد کمکی برای کدگذاری ایمن متن‌های فارسی در Base64
const b64EncodeUnicode = (str: string) => {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
};

const b64DecodeUnicode = (str: string) => {
  return decodeURIComponent(atob(str).split('').map((c) => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
};

export const getLocalDB = (): Medicine[] => {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return [];
  try {
    const decoded = b64DecodeUnicode(data);
    return JSON.parse(decoded);
  } catch (e) {
    console.error("خطا در بارگذاری دیتابیس:", e);
    return [];
  }
};

export const saveToLocalDB = (medicines: Medicine[]) => {
  try {
    const jsonStr = JSON.stringify(medicines);
    const encoded = b64EncodeUnicode(jsonStr);
    localStorage.setItem(DB_KEY, encoded);
    return true;
  } catch (e) {
    console.error("خطا در ذخیره‌سازی دیتابیس (احتمال پر شدن حافظه مرورگر):", e);
    return false;
  }
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
  const blob = new Blob([data], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PharmaBase_Backup_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.pharma`;
  a.click();
};

export const exportToCSV = (medicines: Medicine[]) => {
  let csvContent = "\uFEFF"; // BOM for UTF-8 Support in Excel
  csvContent += "نام ژنریک,دسته درمانی,تولیدکننده,دوز,شکل مصرف,قیمت (ریال),وضعیت بازار,تاریخ بروزرسانی\n";

  medicines.forEach(med => {
    med.variants.forEach(v => {
      csvContent += `"${med.genericName}","${med.category}","${v.manufacturer}","${v.dosage}","${v.form}",${v.price},"${v.isShortage ? 'کمیاب' : 'موجود'}","${new Date(med.lastUpdated).toLocaleDateString('fa-IR')}"\n`;
    });
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `گزارش_جامع_دارویی_${new Date().getTime()}.csv`);
  link.click();
};

export const importDB = (fileContent: string) => {
  try {
    const decoded = b64DecodeUnicode(fileContent);
    JSON.parse(decoded);
    localStorage.setItem(DB_KEY, fileContent);
    return true;
  } catch {
    return false;
  }
};
