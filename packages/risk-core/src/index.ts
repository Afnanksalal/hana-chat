import type { RiskAction } from "@hana/contracts";

export interface RiskSignals {
  identity: {
    credentialType: "email";
    verificationRequestsLastHour: number;
    failedVerificationAttemptsLastHour: number;
    accountsOnCredential: number;
    devicesOnCredential: number;
    highRiskCredential: boolean;
  };
  device: {
    accountsOnDevice: number;
    credentialsOnDevice: number;
    isEmulator: boolean;
    isRootedOrJailbroken: boolean;
    automationSuspected: boolean;
  };
  network: {
    accountsOnIpLastDay: number;
    verificationRequestsOnIpLastHour: number;
    isDatacenter: boolean;
    isVpnOrProxy: boolean;
  };
  behavior: {
    freeQuotaExhaustionsLastWeek: number;
    duplicatePromptRate: number;
    reportRate: number;
  };
  payment: {
    accountsOnPaymentMethod: number;
    chargebackCount: number;
  };
  graph: {
    suspiciousClusterSize: number;
    referralClusterRisk: number;
  };
}

export interface RiskScoreResult {
  score: number;
  action: RiskAction;
  reasons: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskFromBoolean(value: boolean, weight: number): number {
  return value ? weight : 0;
}

export function calculateRiskScore(signals: RiskSignals): RiskScoreResult {
  const reasons: string[] = [];

  let identityRisk = 0;
  if (signals.identity.highRiskCredential) {
    identityRisk += 45;
    reasons.push("high_risk_credential");
  }
  identityRisk += Math.min(30, signals.identity.verificationRequestsLastHour * 4);
  identityRisk += Math.min(25, signals.identity.failedVerificationAttemptsLastHour * 5);
  identityRisk += Math.min(40, Math.max(0, signals.identity.accountsOnCredential - 1) * 20);
  identityRisk += Math.min(25, Math.max(0, signals.identity.devicesOnCredential - 3) * 5);
  if (signals.identity.accountsOnCredential > 1) {
    reasons.push("credential_reused_across_accounts");
  }

  let deviceRisk = 0;
  deviceRisk += Math.min(60, Math.max(0, signals.device.accountsOnDevice - 1) * 15);
  deviceRisk += Math.min(60, Math.max(0, signals.device.credentialsOnDevice - 1) * 15);
  deviceRisk += riskFromBoolean(signals.device.isEmulator, 25);
  deviceRisk += riskFromBoolean(signals.device.isRootedOrJailbroken, 15);
  deviceRisk += riskFromBoolean(signals.device.automationSuspected, 40);

  let networkRisk = 0;
  networkRisk += Math.min(50, signals.network.accountsOnIpLastDay * 3);
  networkRisk += Math.min(40, signals.network.verificationRequestsOnIpLastHour * 2);
  networkRisk += riskFromBoolean(signals.network.isDatacenter, 25);
  networkRisk += riskFromBoolean(signals.network.isVpnOrProxy, 15);

  let behaviorRisk = 0;
  behaviorRisk += Math.min(40, signals.behavior.freeQuotaExhaustionsLastWeek * 8);
  behaviorRisk += Math.min(30, signals.behavior.duplicatePromptRate * 30);
  behaviorRisk += Math.min(30, signals.behavior.reportRate * 30);

  let paymentRisk = 0;
  paymentRisk += Math.min(50, Math.max(0, signals.payment.accountsOnPaymentMethod - 1) * 10);
  paymentRisk += Math.min(50, signals.payment.chargebackCount * 25);

  let graphRisk = 0;
  graphRisk += Math.min(70, Math.max(0, signals.graph.suspiciousClusterSize - 2) * 8);
  graphRisk += Math.min(40, signals.graph.referralClusterRisk);

  const score = clampScore(
    0.25 * identityRisk +
      0.25 * deviceRisk +
      0.15 * networkRisk +
      0.15 * behaviorRisk +
      0.1 * paymentRisk +
      0.1 * graphRisk,
  );

  return {
    score,
    action: actionForRiskScore(score),
    reasons,
  };
}

export function actionForRiskScore(score: number): RiskAction {
  if (score >= 90) {
    return "block";
  }
  if (score >= 70) {
    return "manual_review";
  }
  if (score >= 50) {
    return "step_up";
  }
  if (score >= 30) {
    return "allow_with_limits";
  }

  return "allow";
}

export function freeDailyMessageLimitForRisk(score: number, defaultLimit = 30): number {
  if (score >= 70) {
    return 0;
  }
  if (score >= 50) {
    return 5;
  }
  if (score >= 30) {
    return 15;
  }

  return defaultLimit;
}
