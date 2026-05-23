import { E164PhoneNumberSchema } from "@hana/contracts";
import { loadConfig } from "@hana/config";
import { hashPhoneNumber, normalizePhoneNumber, shouldAllowLineType } from "@hana/identity-core";
import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";

const NormalizePhoneSchema = z.object({
  phoneNumber: z.string().min(4).max(32),
  defaultCountry: z.string().length(2).optional(),
});

const HashPhoneSchema = z.object({
  phoneNumber: E164PhoneNumberSchema,
});

@Controller("/internal/identity/phone")
export class PhoneController {
  private readonly config = loadConfig();

  @Post("/normalize")
  public normalize(@Body() body: unknown) {
    const input = NormalizePhoneSchema.parse(body);
    const phoneNumber = normalizePhoneNumber(input.phoneNumber, input.defaultCountry as never);

    return {
      phoneNumber,
    };
  }

  @Post("/risk-precheck")
  public riskPrecheck(@Body() body: unknown) {
    const input = HashPhoneSchema.parse(body);
    const phoneHash = hashPhoneNumber(input.phoneNumber, this.config.PHONE_HASH_SECRET);

    return {
      phoneHash,
      lineTypeDecision: shouldAllowLineType("unknown"),
    };
  }
}
