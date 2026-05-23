import { describe, expect, it } from "vitest";
import { calculateRiskScore, freeDailyMessageLimitForRisk, type RiskSignals } from "./index";

function lowRiskSignals(): RiskSignals {
  return {
    phone: {
      lineType: "mobile",
      otpRequestsLastHour: 1,
      failedOtpAttemptsLastHour: 0,
      accountsOnPhone: 1,
      devicesOnPhone: 1,
      simSwapRisk: "low",
    },
    device: {
      accountsOnDevice: 1,
      phonesOnDevice: 1,
      isEmulator: false,
      isRootedOrJailbroken: false,
      automationSuspected: false,
    },
    network: {
      accountsOnIpLastDay: 1,
      otpRequestsOnIpLastHour: 1,
      isDatacenter: false,
      isVpnOrProxy: false,
      countryMismatch: false,
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
  it("allows normal phone/device/network signup traffic", () => {
    const result = calculateRiskScore(lowRiskSignals());

    expect(result.action).toBe("allow");
    expect(result.score).toBeLessThan(30);
  });

  it("blocks obvious disposable phone abuse", () => {
    const signals = lowRiskSignals();
    signals.phone.lineType = "non_fixed_voip";
    signals.device.accountsOnDevice = 8;
    signals.device.phonesOnDevice = 8;
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
