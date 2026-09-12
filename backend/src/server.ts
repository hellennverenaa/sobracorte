import { loadServerConfig } from "./config/dotenv";
import { createApp } from './app';

const config = loadServerConfig();
const app = createApp(config);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Servidor SobraCorte disponível na porta ${config.port}.`);
});
