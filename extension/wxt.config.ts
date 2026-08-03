import { defineConfig, type WxtViteConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () =>
    ({
      plugins: [tailwindcss()],
      resolve: { dedupe: ["react", "react-dom"] },
      optimizeDeps: { include: ["react", "react-dom", "@tanstack/react-query"] },
    }) as WxtViteConfig,
  manifest: {
    name: "Obot",
    description: "Your AI assistant in the browser",
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArgHv+2aybIdBdAUnJMdAUP8sDMfqlXgaACcbawXkO+BeUMSYmCAFQYF7Bt59rY2s2jNKff7fkjZL+GLrc750F6peuVj0HY++TbOQettHQnyHt5MtE8bTdftU8KifDHkJAQqAilYGodN5Qok4wa5RZldXiyFx5XSW+aNIum+ww6SQt/EdtHoZ4txXBSUFs+/twKPNDeTVJzhrrzHaLITXq9s18HwZNTLLwl7746zLhZYYP8H41n5T1FnjS12FW2fTcnmFpSRyVs4KxFRF4b5NjP7HUs5Letbc0EFH6iMgPfy1qiQmA7EB0DVjLxGwpAGj/6rWw/RREwuEtzlFlyaWfwIDAQAB",
    oauth2: {
      client_id: "4924083673-9u1npacjm2egsp8ebsnsrd75gpn5qqlg.apps.googleusercontent.com",
      scopes: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    },
    permissions: ["storage", "sidePanel", "tabs", "identity", "scripting"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Open Obot", default_icon: { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" } },
    icons: { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  },
  webExt: { chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"] },
});
