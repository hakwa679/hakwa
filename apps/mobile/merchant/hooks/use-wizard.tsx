/**
 * Wizard context — shared state across all onboarding screens.
 * Draft data is persisted to AsyncStorage so the wizard survives app restarts.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "onboarding_draft_v1";

export interface BusinessDraft {
  name?: string;
  tin?: string;
  businessRegistrationNumber?: string;
  nationalId?: string;
  phone?: string;
}

export interface BankDraft {
  accountNumber?: string;
  accountHolderName?: string;
  bankName?: string;
  bankCode?: string;
  swiftCode?: string;
}

export interface VehicleDraft {
  make?: string;
  model?: string;
  year?: string;
  registrationPlate?: string;
  seatingCapacity?: string;
  color?: string;
}

export interface WizardDraft {
  licenseType?: "licensed" | "unlicensed";
  business: BusinessDraft;
  bank: BankDraft;
  vehicle: VehicleDraft;
}

interface WizardContextValue {
  draft: WizardDraft;
  setLicenseType: (t: "licensed" | "unlicensed") => void;
  setBusiness: (d: BusinessDraft) => void;
  setBank: (d: BankDraft) => void;
  setVehicle: (d: VehicleDraft) => void;
  clearDraft: () => void;
  isLoaded: boolean;
}

const DEFAULT_DRAFT: WizardDraft = {
  business: {},
  bank: {},
  vehicle: {},
};

const WizardContext = createContext<WizardContextValue>({
  draft: DEFAULT_DRAFT,
  setLicenseType: () => {},
  setBusiness: () => {},
  setBank: () => {},
  setVehicle: () => {},
  clearDraft: () => {},
  isLoaded: false,
});

export function WizardProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<WizardDraft>(DEFAULT_DRAFT);
  const [isLoaded, setIsLoaded] = useState(false);

  // Restore draft from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as WizardDraft;
          setDraft(parsed);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  function persist(next: WizardDraft) {
    setDraft(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function setLicenseType(t: "licensed" | "unlicensed") {
    persist({ ...draft, licenseType: t });
  }

  function setBusiness(d: BusinessDraft) {
    persist({ ...draft, business: { ...draft.business, ...d } });
  }

  function setBank(d: BankDraft) {
    persist({ ...draft, bank: { ...draft.bank, ...d } });
  }

  function setVehicle(d: VehicleDraft) {
    persist({ ...draft, vehicle: { ...draft.vehicle, ...d } });
  }

  function clearDraft() {
    setDraft(DEFAULT_DRAFT);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }

  return (
    <WizardContext.Provider
      value={{
        draft,
        setLicenseType,
        setBusiness,
        setBank,
        setVehicle,
        clearDraft,
        isLoaded,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  return useContext(WizardContext);
}
