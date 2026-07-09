export const deploymentConfig = {
  // Use "node-server" for EC2/Node. Use "cloudflare-module" for Cloudflare Workers.
  nitroPreset: "node-server",
  devAllowedHosts: ["d2brdeqy144bwg.cloudfront.net"],
} as const;
