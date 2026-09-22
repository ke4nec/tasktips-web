import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function precachePlugin(): Plugin {
  let output = "";
  return {
    name: "tasktips-precache",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter((item) => item.isFile() && item.name !== "sw.js" && !item.name.endsWith(".map"))
        .map((item) => resolve(item.parentPath, item.name).slice(output.length + 1))
        .sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(await readFile(resolve(output, file)));
      const template = await readFile(resolve(output, "sw.js"), "utf8");
      hash.update(template);
      const worker = template
        .replace("__CACHE_VERSION__", `tasktips-web-${hash.digest("hex").slice(0, 16)}`)
        .replace('["__PRECACHE_MANIFEST__"]', JSON.stringify(files.map((file) => `/app/${file}`)));
      await writeFile(resolve(output, "sw.js"), worker);
    },
  };
}
