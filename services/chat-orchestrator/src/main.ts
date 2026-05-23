import { loadConfig } from "@hana/config";
import { bootstrapNestService } from "@hana/nest-core";
import { AppModule } from "./modules/app.module";

const config = loadConfig();

void bootstrapNestService({
  module: AppModule,
  serviceName: "chat-orchestrator",
  port: config.CHAT_ORCHESTRATOR_PORT,
});
