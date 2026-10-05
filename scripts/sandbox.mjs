/**
 * Starts the local sandbox and prints the addresses to open.
 *
 * Wraps `vite` rather than replacing it. Vite already binds every interface, so
 * the only thing missing was being told which LAN address to type into a phone,
 * which is the device the mobile layout actually needs checking on.
 */

import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const PORT = 8080;

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

const lan = lanAddress();
const line = (s) => console.log(s);

line("");
line("  Sandbox — every feature on, including the ones held back in production");
line("");
line(`  This machine     http://localhost:${PORT}`);
if (lan) {
  line(`  Phone or tablet  http://${lan}:${PORT}    (same wifi)`);
} else {
  line("  Phone or tablet  unavailable, no LAN address found");
}
line("");
line("  Report panels    /panel-preview?dev=true");
line("  Analysis screen  /panel-preview?dev=true&screen=analysis");
line("  Raw API response /api-debug?dev=true");
line("");
line("  Ctrl-C to stop.");
line("");

spawn("npx", ["vite", "--port", String(PORT)], { stdio: "inherit", shell: false });
