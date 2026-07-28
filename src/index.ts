import closeWithGrace from "close-with-grace";
import { env } from "./config/env";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const app = buildServer();

  closeWithGrace({ delay: 5000 }, async ({ err }) => {
    if (err) app.log.error({ err }, "Shutting down due to an unhandled error");
    else app.log.info("Shutting down gracefully");
    await app.close();
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

void main();
