// Company branding persisted to localStorage.
import { useSyncExternalStore } from "react";

const LOGO_KEY = "mp_tourism_logo";
const NAME_KEY = "mp_tourism_company_name";
const TAG_KEY = "mp_tourism_company_tagline";
const PHONE_KEY = "mp_tourism_company_phone";
const EMAIL_KEY = "mp_tourism_company_email";

export interface Branding {
  logo: string | null; // base64 data URL
  companyName: string;
  tagline: string;
  phone: string;
  email: string;
}

const DEFAULTS: Branding = {
  logo: null,
  companyName: "MP Tourism Operations Hub",
  tagline: "Operations Hub",
  phone: "",
  email: "",
};

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

function isBrowser() { return typeof window !== "undefined"; }

export function getBranding(): Branding {
  if (!isBrowser()) return DEFAULTS;
  return {
    logo: localStorage.getItem(LOGO_KEY),
    companyName: localStorage.getItem(NAME_KEY) || DEFAULTS.companyName,
    tagline: localStorage.getItem(TAG_KEY) || DEFAULTS.tagline,
    phone: localStorage.getItem(PHONE_KEY) || "",
    email: localStorage.getItem(EMAIL_KEY) || "",
  };
}

export function setBranding(b: Partial<Branding>) {
  if (!isBrowser()) return;
  if (b.logo !== undefined) {
    if (b.logo) localStorage.setItem(LOGO_KEY, b.logo);
    else localStorage.removeItem(LOGO_KEY);
  }
  if (b.companyName !== undefined) localStorage.setItem(NAME_KEY, b.companyName);
  if (b.tagline !== undefined) localStorage.setItem(TAG_KEY, b.tagline);
  if (b.phone !== undefined) localStorage.setItem(PHONE_KEY, b.phone);
  if (b.email !== undefined) localStorage.setItem(EMAIL_KEY, b.email);
  emit();
}

export function useBranding(): Branding {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getBranding,
    () => DEFAULTS,
  );
}
