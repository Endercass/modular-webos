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
    })
    .then(resultPrinter("openv_all")),
]);

console.log("Built all targets.");
