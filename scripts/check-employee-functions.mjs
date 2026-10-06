import ts from "typescript";
import path from "node:path";

const declarationPath = path.resolve(".employee-validation/edge-runtime.d.ts");
const declaration = `declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
declare module "https://esm.sh/@supabase/supabase-js@2.112.3" { export const createClient: typeof import("@supabase/supabase-js").createClient; }`;
const options = {
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
};
const host = ts.createCompilerHost(options);
const originalGetSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (file, languageVersion, ...rest) =>
  path.resolve(file) === declarationPath
    ? ts.createSourceFile(file, declaration, languageVersion, true)
    : originalGetSourceFile(file, languageVersion, ...rest);
const program = ts.createProgram(
  [
    declarationPath,
    ...["employee-login", "manage-employee-account", "invite-employee"].map(
      (name) => `supabase/functions/${name}/index.ts`,
    ),
  ],
  options,
  host,
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: host.getCurrentDirectory,
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    "Employee Edge Functions TypeScript check passed (installed Supabase SDK and Deno runtime declarations).",
  );
