import os from "node:os";

export function listLanIpv4(networkInterfaces = os.networkInterfaces()) {
  const addresses = Object.values(networkInterfaces)
    .flatMap((entries) => entries ?? [])
    .filter(
      (entry) =>
        (entry.family === "IPv4" || entry.family === 4) && !entry.internal,
    )
    .map((entry) => entry.address);

  return [...new Set(addresses)];
}
