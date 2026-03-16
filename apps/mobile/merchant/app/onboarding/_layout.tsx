import { Stack } from "expo-router";
import { WizardProvider } from "@/hooks/use-wizard";

/**
 * Onboarding wizard group layout.
 * Wraps all wizard screens in the shared WizardProvider for draft state.
 */
export default function OnboardingLayout() {
  return (
    <WizardProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#151718" },
          headerTintColor: "#ECEDEE",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#151718" },
        }}
      >
        <Stack.Screen
          name="license-type"
          options={{ title: "Choose your tier", headerLeft: () => null }}
        />
        <Stack.Screen
          name="business-details"
          options={{ title: "Business details" }}
        />
        <Stack.Screen
          name="bank-account"
          options={{ title: "Payout account" }}
        />
        <Stack.Screen
          name="vehicle"
          options={{ title: "Your vehicle" }}
        />
        <Stack.Screen
          name="review"
          options={{ title: "Review & submit" }}
        />
      </Stack>
    </WizardProvider>
  );
}
