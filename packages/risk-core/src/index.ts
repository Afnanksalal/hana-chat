import type { RiskAction } from "@hana/contracts";
import type { PhoneLineType } from "@hana/identity-core";

export interface RiskSignals {
  phone: {
    lineType: PhoneLineType;
    otpRequestsLastHour: number;
    failedOtpAttemptsLastHour: number;
    accountsOnPhone: number;
    devicesOnPhone: number;
    simSwapRisk?: "unknown" | "low" | "medium" | "high";
  };
  device: {
    accountsOnDevice: number;
    phonesOnDevice: number;
    isEmulator: boolean;
    isRootedOrJailbroken: boolean;
    automationSuspected: boolean;
  };
  network: {
    accountsOnIpLastDay: number;
    otpRequestsOnIpLastHour: number;
    isDatacenter: boolean;
    isVpnOrProxy: boolean;
    countryMismatch: boolean;
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

  let phoneRisk = 0;
  if (signals.phone.lineType === "non_fixed_voip" || signals.phone.lineType === "toll_free") {
    phoneRisk += 90;
    reasons.push("blocked_line_type");
  } else if (signals.phone.lineType === "fixed_voip" || signals.phone.lineType === "unknown") {
    phoneRisk += 45;
    reasons.push("risky_line_type");
  }
  phoneRisk += Math.min(30, signals.phone.otpRequestsLastHour * 4);
  phoneRisk += Math.min(25, signals.phone.failedOtpAttemptsLastHour * 5);
  phoneRisk += Math.min(40, Math.max(0, signals.phone.accountsOnPhone - 1) * 20);
  phoneRisk += Math.min(25, Math.max(0, signals.phone.devicesOnPhone - 3) * 5);
  if (signals.phone.simSwapRisk === "high") {
    phoneRisk += 30;
    reasons.push("high_sim_swap_risk");
  }

  let deviceRisk = 0;
  deviceRisk += Math.min(60, Math.max(0, signals.device.accountsOnDevice - 1) * 15);
  deviceRisk += Math.min(60, Math.max(0, signals.device.phonesOnDevice - 1) * 15);
  deviceRisk += riskFromBoolean(signals.device.isEmulator, 25);
  deviceRisk += riskFromBoolean(signals.device.isRootedOrJailbroken, 15);
  deviceRisk += riskFromBoolean(signals.device.automationSuspected, 40);

  let networkRisk = 0;
  networkRisk += Math.min(50, signals.network.accountsOnIpLastDay * 3);
  networkRisk += Math.min(40, signals.network.otpRequestsOnIpLastHour * 2);
  networkRisk += riskFromBoolean(signals.network.isDatacenter, 25);
  networkRisk += riskFromBoolean(signals.network.isVpnOrProxy, 15);
  networkRisk += riskFromBoolean(signals.network.countryMismatch, 20);

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
    0.25 * phoneRisk +
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
