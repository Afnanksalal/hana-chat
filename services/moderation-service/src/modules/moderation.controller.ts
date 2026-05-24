import {
  classifyModelOutputSafety,
  classifyTextSafety,
  type SafetyContext,
} from "@hana/safety-core";
import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/moderation")
export class ModerationController {
  @Post("/classify")
  public classify(@Body() body: { text: string; context: SafetyContext }) {
    return classifyTextSafety(body.text, body.context);
  }

  @Post("/classify-output")
  public classifyOutput(@Body() body: { text: string }) {
    return classifyModelOutputSafety(body.text);
  }
}
