import type {
  VerifyMapFeatureInput,
  VerifyMapFeatureResponse,
} from "@hakwa/types";
import { MapClient } from "../mapClient.ts";

export interface MapVerificationAction {
  verify(
    featureId: string,
    payload: VerifyMapFeatureInput,
  ): Promise<VerifyMapFeatureResponse>;
}

export function createMapVerificationAction(
  mapClient: MapClient,
): MapVerificationAction {
  return {
    verify(featureId: string, payload: VerifyMapFeatureInput) {
      return mapClient.verifyFeature(featureId, payload);
    },
  };
}
