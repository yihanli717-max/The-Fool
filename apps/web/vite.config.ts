import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Expose the dev server to the host's LAN/Tailscale interfaces.
  server: { host: true, port: 5173 },
});
