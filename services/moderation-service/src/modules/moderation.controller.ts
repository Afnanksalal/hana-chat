import { classifyTextSafety, type SafetyContext } from "@hana/safety-core";
import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/moderation")
export class ModerationController {
  @Post("/classify")
  public classify(@Body() body: { text: string; context: SafetyContext }) {
    return classifyTextSafety(body.text, body.context);
  }
}
