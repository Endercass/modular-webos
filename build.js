import esbuild from "esbuild";

const apis = [
  "party.openv.compositor",
  "party.openv.fs",
  "party.openv.identity",
  "party.openv.ipc",
  "party.openv.net",
  "party.openv.processes",
  "party.openv.resolve",
  "party.openv.server",
  "party.openv.service",
  "party.openv.surface",
];

function resultPrinter(name) {
  return () => {
    console.log(`Built ${name}`);
  };
}

const ivmplugin = {
  name: "replace-isolated-vm",

  setup(build) {
    build.onResolve({ filter: /^isolated-vm$/ }, (args) => {
      return { path: args.path, namespace: "ivm-ns" };
    });
    
    build.onLoad({ filter: /.*/, namespace: "ivm-ns" }, () => {
      return {
        // contents: `module.exports = require('./isolated_vm').ivm;`,
        contents: `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export default require('./isolated_vm.node').ivm;`,
        loader: "js",
      };
    });
  }
};

console.log("Building...");
await Promise.all([
  // openv
  esbuild
    .build({
      entryPoints: ["./packages/openv/mod.ts"],
      minify: true,
      bundle: true,
      format: "esm",
      outfile: "./dist/openv.bundle.js",
    })
    .then(resultPrinter("openv")),
  // openv_web
  esbuild
    .build({
      entryPoints: ["./packages/openv_web/mod.ts"],
      minify: true,
      bundle: true,
      format: "esm",
      outfile: "./dist/openv_web.bundle.js",
    })
    .then(resultPrinter("openv_web")),
  // openv_node
  esbuild
    .build({
      entryPoints: ["./packages/openv_node/mod.ts"],
      minify: true,
      bundle: true,
      format: "esm",
      outfile: "./dist/openv_node.bundle.js",
      external: ["./isolated_vm", "node:module", "node:fs/promises"],
      plugins: [
        ivmplugin,
      ],
    })
    .then(resultPrinter("openv_node")),
  // all apis
  ...apis.map((api) =>
    esbuild
      .build({
        entryPoints: [`./packages/api/${api.replace(/\./g, "/")}/mod.ts`],
        minify: true,
        bundle: true,
        format: "esm",
        outfile: `./dist/${api}.bundle.js`,
      })
      .then(resultPrinter(api)),
  ),
  // everything (developer build)
  esbuild
    .build({
      entryPoints: ["./packages/mod.ts"],
      minify: true,
      bundle: true,
      format: "esm",
      outfile: "./dist/openv_all.bundle.js",
      external: ["./isolated_vm", "node:module", "node:fs/promises"],
      plugins: [
        ivmplugin,
      ],
    })
    .then(resultPrinter("openv_all")),
]);

import { copyFile } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
await copyFile(
  __dirname + "/node_modules/isolated-vm/out/isolated_vm.node",
  __dirname + "/dist/isolated_vm.node"
);

console.log("Built all targets.");
