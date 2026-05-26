import { describe, expect, it } from "vitest";
import { calculateRiskScore, freeDailyMessageLimitForRisk, type RiskSignals } from "./index";

function lowRiskSignals(): RiskSignals {
  return {
    identity: {
      credentialType: "email",
      verificationRequestsLastHour: 1,
      failedVerificationAttemptsLastHour: 0,
      accountsOnCredential: 1,
      devicesOnCredential: 1,
      highRiskCredential: false,
    },
    device: {
      accountsOnDevice: 1,
      credentialsOnDevice: 1,
      isEmulator: false,
      isRootedOrJailbroken: false,
      automationSuspected: false,
    },
    network: {
      accountsOnIpLastDay: 1,
      verificationRequestsOnIpLastHour: 1,
      isDatacenter: false,
      isVpnOrProxy: false,
    },
    behavior: {
      freeQuotaExhaustionsLastWeek: 0,
      duplicatePromptRate: 0,
      reportRate: 0,
    },
    payment: {
      accountsOnPaymentMethod: 1,
      chargebackCount: 0,
    },
    graph: {
      suspiciousClusterSize: 1,
      referralClusterRisk: 0,
    },
  };
}

describe("risk core", () => {
  it("allows normal email/device/network signup traffic", () => {
    const result = calculateRiskScore(lowRiskSignals());

    expect(result.action).toBe("allow");
    expect(result.score).toBeLessThan(30);
  });

  it("raises risk for credential and device abuse", () => {
    const signals = lowRiskSignals();
    signals.identity.highRiskCredential = true;
    signals.identity.failedVerificationAttemptsLastHour = 8;
    signals.device.accountsOnDevice = 8;
    signals.device.credentialsOnDevice = 8;
    signals.network.isDatacenter = true;

    const result = calculateRiskScore(signals);

    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(["step_up", "manual_review", "block"]).toContain(result.action);
  });

  it("reduces free quota as risk rises", () => {
    expect(freeDailyMessageLimitForRisk(10)).toBe(30);
    expect(freeDailyMessageLimitForRisk(35)).toBe(15);
    expect(freeDailyMessageLimitForRisk(55)).toBe(5);
    expect(freeDailyMessageLimitForRisk(75)).toBe(0);
  });
});
