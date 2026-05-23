import { loadConfig } from "@hana/config";
import { bootstrapNestService } from "@hana/nest-core";
import { AppModule } from "./modules/app.module";

const config = loadConfig();

void bootstrapNestService({
  module: AppModule,
  serviceName: "creator-service",
  port: config.CREATOR_SERVICE_PORT,
});
