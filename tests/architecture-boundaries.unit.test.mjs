import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "src");
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const sourceExtensionSet = new Set(sourceExtensions);

const requiredServerOnlyModules = [
  "lib/prisma.ts",
  "lib/authorization-grant-loader.ts",
  "lib/tenant-role-assignment-service.ts",
  "lib/tenant-deny-policy-service.ts",
  "lib/tenant-target-context.ts",
  "lib/scoped-access.ts",
  "lib/organization-members-reader.ts",
  "lib/tenant-authorization.ts",
  "lib/tenant-resource-reader.ts",
  "lib/verified-session-lock.ts",
  "lib/tenant-role-definition-service.ts",
];

const pureDomainModules = [
  "lib/authorization-policy-core.ts",
  "lib/tenant-target-context-core.ts",
  "lib/organization-members-reader-core.ts",
  "lib/tenant-scope-types.ts",
  "lib/http-validation.ts",
];

const expectedOrganizationRouteServices = new Map([
  [
    "app/api/organizations/[organizationId]/companies/[companyId]/plants/[plantId]/route.ts",
    "lib/tenant-resource-reader.ts",
  ],
  [
    "app/api/organizations/[organizationId]/companies/[companyId]/route.ts",
    "lib/tenant-resource-reader.ts",
  ],
  [
    "app/api/organizations/[organizationId]/deny-policies/[policyId]/route.ts",
    "lib/tenant-deny-policy-service.ts",
  ],
  [
    "app/api/organizations/[organizationId]/deny-policies/route.ts",
    "lib/tenant-deny-policy-service.ts",
  ],
  [
    "app/api/organizations/[organizationId]/members/route.ts",
    "lib/organization-members-reader.ts",
  ],
  [
    "app/api/organizations/[organizationId]/roles/assignments/route.ts",
    "lib/tenant-role-assignment-service.ts",
  ],
  [
    "app/api/organizations/[organizationId]/roles/[roleDefinitionId]/revisions/route.ts",
    "lib/tenant-role-definition-service.ts",
  ],
  [
    "app/api/organizations/[organizationId]/roles/route.ts",
    "lib/tenant-role-definition-service.ts",
  ],
]);

function sourceKind(filePath) {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

// These guards enforce runtime dependency boundaries. Type-only imports and exports are erased by TypeScript and are intentionally excluded.
function exportHasRuntimeBinding(node) {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true;
  return (
    node.exportClause.elements.length === 0 ||
    node.exportClause.elements.some((element) => !element.isTypeOnly)
  );
}

function parseModule(filePath, text) {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    sourceKind(filePath),
  );
  const imports = [];

  function addImport(moduleSpecifier, node, kind, runtime = true) {
    if (!moduleSpecifier || !ts.isStringLiteralLike(moduleSpecifier)) return;
    imports.push({
      specifier: moduleSpecifier.text,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      kind,
      runtime,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      const namedBindingsAreTypeOnly =
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly) &&
        node.importClause?.name === undefined;
      addImport(
        node.moduleSpecifier,
        node,
        "import",
        !node.importClause?.isTypeOnly && !namedBindingsAreTypeOnly,
      );
    } else if (ts.isExportDeclaration(node)) {
      addImport(node.moduleSpecifier, node, "export", exportHasRuntimeBinding(node));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addImport(node.moduleReference.expression, node, "import-equals", !node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addImport(node.argument.literal, node, "import-type", false);
    } else if (ts.isCallExpression(node)) {
      const firstArgument = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addImport(firstArgument, node, "dynamic-import");
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        addImport(firstArgument, node, "require");
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let clientEntry = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") {
      clientEntry = true;
      break;
    }
  }

  const hasServerOnlyMarker = imports.some(
    (entry) => entry.specifier === "server-only" && entry.kind === "import",
  ) && sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === "server-only" &&
      statement.importClause === undefined,
  );

  return { filePath, imports, clientEntry, hasServerOnlyMarker };
}

async function collectSourceFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      // Generated Prisma output is excluded by tsconfig and is not application source.
      if (relativePath === "generated") continue;
      files.push(...await collectSourceFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile() && sourceExtensionSet.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}

function createAliasMappings(tsconfig) {
  const compilerOptions = tsconfig.compilerOptions ?? {};
  const mappings = [];
  for (const [pattern, rawTargets] of Object.entries(compilerOptions.paths ?? {})) {
    mappings.push({
      pattern,
      targets: Array.isArray(rawTargets) ? rawTargets : [rawTargets],
      baseUrl: compilerOptions.baseUrl ?? ".",
    });
  }
  return mappings;
}

function matchAlias(pattern, specifier) {
  const wildcard = pattern.indexOf("*");
  if (wildcard === -1) return pattern === specifier ? "" : null;
  const prefix = pattern.slice(0, wildcard);
  const suffix = pattern.slice(wildcard + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

function sourceBases(importer, specifier, aliasMappings) {
  if (specifier.startsWith(".")) {
    return [path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier))];
  }

  const bases = [];
  for (const mapping of aliasMappings) {
    const wildcardValue = matchAlias(mapping.pattern, specifier);
    if (wildcardValue === null) continue;
    for (const target of mapping.targets) {
      const mappedTarget = target.includes("*") ? target.replace("*", wildcardValue) : target;
      const absoluteTarget = path.resolve(repositoryRoot, mapping.baseUrl, mappedTarget);
      const relativeTarget = path.relative(sourceRoot, absoluteTarget);
      bases.push(relativeTarget.split(path.sep).join("/"));
    }
  }
  return bases;
}

function sourceCandidates(base) {
  const normalized = path.posix.normalize(base);
  const extension = path.posix.extname(normalized);
  if (extension && !sourceExtensionSet.has(extension)) return [];

  if (extension) {
    const replacements = {
      ".js": [".ts", ".tsx"],
      ".jsx": [".tsx"],
      ".mjs": [".mts"],
      ".cjs": [".cts"],
    };
    const alternatives = (replacements[extension] ?? []).map((replacement) =>
      `${normalized.slice(0, -extension.length)}${replacement}`,
    );
    return [normalized, ...alternatives];
  }

  return [
    ...sourceExtensions.map((candidateExtension) => `${normalized}${candidateExtension}`),
    ...sourceExtensions.map((candidateExtension) => `${normalized}/index${candidateExtension}`),
  ];
}

function resolveSourceImport(importer, specifier, modules, aliasMappings) {
  const bases = sourceBases(importer, specifier, aliasMappings);
  if (bases.length === 0) return { local: false, target: null };

  const candidates = bases.flatMap(sourceCandidates);
  return {
    local: true,
    target: candidates.find((candidate) => modules.has(candidate)) ?? null,
    candidate: candidates[0] ?? null,
  };
}

function isForbiddenClientDependency(specifier, target) {
  return (
    specifier === "server-only" ||
    /^next\/(headers|server|cache|cookies)(?:\/|$)/.test(specifier) ||
    specifier === "better-auth" ||
    /^better-auth\/(?:adapters|next-js)(?:\/|$)/.test(specifier) ||
    /^@prisma\//.test(specifier) ||
    /^@better-auth\/prisma-adapter(?:\/|$)/.test(specifier) ||
    /^pg(?:\/|$)/.test(specifier) ||
    isBuiltin(specifier) ||
    /^@\/generated\/prisma(?:\/|$)/.test(specifier) ||
    (target !== null && target.startsWith("generated/prisma/"))
  );
}

function isForbiddenPureDependency(specifier, target) {
  return (
    /^next(?:\/|$)/.test(specifier) ||
    /^react(?:\/|$)/.test(specifier) ||
    /^react-dom(?:\/|$)/.test(specifier) ||
    /^@prisma\//.test(specifier) ||
    /^@better-auth\/prisma-adapter(?:\/|$)/.test(specifier) ||
    /^better-auth(?:\/|$)/.test(specifier) ||
    /^pg(?:\/|$)/.test(specifier) ||
    isBuiltin(specifier) ||
    specifier === "server-only" ||
    /^@\/generated\/prisma(?:\/|$)/.test(specifier) ||
    (target !== null && target.startsWith("generated/prisma/"))
  );
}

function inspectClientBoundaries(modules, entries, aliasMappings) {
  const violations = [];
  const seenViolations = new Set();
  const report = (violation) => {
    const key = JSON.stringify(violation);
    if (!seenViolations.has(key)) {
      seenViolations.add(key);
      violations.push(violation);
    }
  };

  for (const entry of entries) {
    const pending = [entry];
    const visited = new Set();
    while (pending.length > 0) {
      const filePath = pending.pop();
      if (visited.has(filePath)) continue;
      visited.add(filePath);
      const moduleInfo = modules.get(filePath);
      if (!moduleInfo) {
        report({ rule: "unresolved-client-module", entry, filePath });
        continue;
      }
      if (moduleInfo.hasServerOnlyMarker) {
        report({ rule: "client-reaches-server-only-module", entry, filePath });
        continue;
      }

      for (const imported of moduleInfo.imports) {
        if (!imported.runtime) continue;
        const resolution = resolveSourceImport(filePath, imported.specifier, modules, aliasMappings);
        if (isForbiddenClientDependency(imported.specifier, resolution.candidate ?? resolution.target)) {
          report({
            rule: "client-imports-server-dependency",
            entry,
            filePath,
            specifier: imported.specifier,
            line: imported.line,
          });
        }
        if (resolution.target) {
          if (modules.get(resolution.target)?.hasServerOnlyMarker) {
            report({
              rule: "client-reaches-server-only-module",
              entry,
              filePath: resolution.target,
              importedFrom: filePath,
              specifier: imported.specifier,
              line: imported.line,
            });
          } else {
            pending.push(resolution.target);
          }
        } else if (resolution.local && sourceCandidates(sourceBases(filePath, imported.specifier, aliasMappings)[0] ?? "").length > 0) {
          report({
            rule: "unresolved-client-import",
            entry,
            filePath,
            specifier: imported.specifier,
            line: imported.line,
          });
        }
      }
    }
  }

  return violations.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function inspectPureDomainDependencies(modules, entryPoints, aliasMappings) {
  const violations = [];
  const visited = new Set();

  for (const entry of entryPoints) {
    const pending = [entry];
    while (pending.length > 0) {
      const filePath = pending.pop();
      if (visited.has(filePath)) continue;
      visited.add(filePath);
      const moduleInfo = modules.get(filePath);
      if (!moduleInfo) {
        violations.push({ rule: "missing-pure-domain-module", entry, filePath });
        continue;
      }
      if (moduleInfo.hasServerOnlyMarker) {
        violations.push({ rule: "pure-domain-reaches-server-only-module", entry, filePath });
        continue;
      }

      for (const imported of moduleInfo.imports) {
        if (!imported.runtime) continue;
        const resolution = resolveSourceImport(filePath, imported.specifier, modules, aliasMappings);
        if (isForbiddenPureDependency(imported.specifier, resolution.candidate ?? resolution.target)) {
          violations.push({
            rule: "pure-domain-imports-framework-or-server-dependency",
            entry,
            filePath,
            specifier: imported.specifier,
            line: imported.line,
          });
        }
        if (resolution.target) {
          pending.push(resolution.target);
        } else if (resolution.local && sourceCandidates(sourceBases(filePath, imported.specifier, aliasMappings)[0] ?? "").length > 0) {
          violations.push({
            rule: "unresolved-pure-domain-import",
            entry,
            filePath,
            specifier: imported.specifier,
            line: imported.line,
          });
        }
      }
    }
  }

  return violations.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function isPersistenceDependency(specifier, target) {
  return (
    /^@prisma\//.test(specifier) ||
    /^@better-auth\/prisma-adapter(?:\/|$)/.test(specifier) ||
    /^pg(?:\/|$)/.test(specifier) ||
    /^@\/generated\/prisma(?:\/|$)/.test(specifier) ||
    (target !== null && (
      target.startsWith("generated/prisma/") ||
      [
        "lib/prisma.ts",
        "lib/scoped-access.ts",
        "lib/verified-session-lock.ts",
        "lib/tenant-target-context.ts",
      ].includes(target)
    ))
  );
}

function formatViolations(violations) {
  return violations.map((violation) => JSON.stringify(violation)).join("\n");
}

const tsconfig = JSON.parse(await readFile(path.join(repositoryRoot, "tsconfig.json"), "utf8"));
const aliasMappings = createAliasMappings(tsconfig);
const sourceFiles = await collectSourceFiles(sourceRoot);
const sourceModules = new Map();
for (const filePath of sourceFiles) {
  const text = await readFile(path.join(sourceRoot, ...filePath.split("/")), "utf8");
  sourceModules.set(filePath, parseModule(filePath, text));
}

const clientEntries = [...sourceModules.values()]
  .filter((moduleInfo) => moduleInfo.clientEntry)
  .map((moduleInfo) => moduleInfo.filePath)
  .sort();

const organizationRouteFiles = [...sourceModules.keys()]
  .filter((filePath) => filePath.startsWith("app/api/organizations/") && /\/route\.[cm]?[jt]sx?$/.test(filePath))
  .sort();

test("client component dependency graphs do not cross into server-only code", () => {
  assert.ok(clientEntries.length > 0, "expected at least one client component to inspect");
  const violations = inspectClientBoundaries(sourceModules, clientEntries, aliasMappings);
  assert.deepEqual(violations, [], formatViolations(violations));
});

test("privileged adapters and tenant services retain explicit server-only markers", () => {
  const missingMarkers = requiredServerOnlyModules.filter(
    (filePath) => !sourceModules.get(filePath)?.hasServerOnlyMarker,
  );
  assert.deepEqual(missingMarkers, [], `missing server-only marker: ${missingMarkers.join(", ")}`);
});

test("organization API routes import their expected protected service, not persistence adapters", () => {
  const expectedRouteFiles = [...expectedOrganizationRouteServices.keys()].sort();
  assert.deepEqual(
    organizationRouteFiles,
    expectedRouteFiles,
    "every organization API route must have an explicit expected service mapping",
  );
  const violations = [];

  for (const filePath of expectedRouteFiles) {
    const route = sourceModules.get(filePath);
    const expectedService = expectedOrganizationRouteServices.get(filePath);
    const importsExpectedService = route.imports.some((imported) =>
      imported.runtime &&
      resolveSourceImport(filePath, imported.specifier, sourceModules, aliasMappings).target === expectedService,
    );
    if (!importsExpectedService) {
      violations.push({
        rule: "api-route-missing-expected-service",
        filePath,
        expectedService,
      });
    }

    for (const imported of route.imports) {
      if (!imported.runtime) continue;
      const resolution = resolveSourceImport(filePath, imported.specifier, sourceModules, aliasMappings);
      if (isPersistenceDependency(imported.specifier, resolution.candidate ?? resolution.target)) {
        violations.push({
          rule: "api-route-imports-persistence-adapter",
          filePath,
          specifier: imported.specifier,
          line: imported.line,
        });
      }
    }
  }

  assert.deepEqual(violations, [], formatViolations(violations));
});

test("pure domain modules and their local dependencies stay framework- and server-independent", () => {
  const missingModules = pureDomainModules.filter((filePath) => !sourceModules.has(filePath));
  assert.deepEqual(missingModules, [], `missing pure-domain module: ${missingModules.join(", ")}`);
  const violations = inspectPureDomainDependencies(sourceModules, pureDomainModules, aliasMappings);
  assert.deepEqual(violations, [], formatViolations(violations));
});

test("type-only imports and exports are excluded while runtime re-exports remain dependencies", () => {
  const fixtureModules = new Map([
    [
      "components/client-entry.tsx",
      parseModule(
        "components/client-entry.tsx",
        [
          '"use client";',
          'import type { ImportedType } from "../lib/type-only.ts";',
          'import { type InlineImportedType } from "../lib/type-only.ts";',
          'type DynamicType = import("../lib/type-only.ts").ImportedType;',
          'export type { ExportedType } from "../lib/type-only.ts";',
          'export { type InlineExportedType } from "../lib/type-only.ts";',
          'export { runtimeValue } from "../lib/runtime-service.ts";',
          'export { type MixedType, runtimeValue as aliasedRuntimeValue } from "../lib/runtime-service.ts";',
        ].join("\n"),
      ),
    ],
    [
      "lib/type-only.ts",
      parseModule("lib/type-only.ts", 'import "server-only";\nexport type { ImportedType } from "./types.ts";'),
    ],
    [
      "lib/runtime-service.ts",
      parseModule("lib/runtime-service.ts", 'import "server-only";\nexport const runtimeValue = 1;'),
    ],
    ["lib/types.ts", parseModule("lib/types.ts", "export type ImportedType = string;")],
  ]);
  const entry = fixtureModules.get("components/client-entry.tsx");
  const typeOnlyEdges = entry.imports.filter((imported) => imported.specifier === "../lib/type-only.ts");
  const runtimeEdges = entry.imports.filter((imported) => imported.specifier === "../lib/runtime-service.ts");

  assert.equal(typeOnlyEdges.length, 5);
  assert.ok(typeOnlyEdges.every((imported) => !imported.runtime));
  assert.equal(runtimeEdges.length, 2);
  assert.ok(runtimeEdges.every((imported) => imported.runtime));

  const violations = inspectClientBoundaries(
    fixtureModules,
    ["components/client-entry.tsx"],
    aliasMappings,
  );
  assert.ok(
    violations.some(
      (violation) =>
        violation.rule === "client-reaches-server-only-module" &&
        violation.filePath === "lib/runtime-service.ts",
    ),
    `expected runtime re-exports to remain visible to the guard; got:\n${formatViolations(violations)}`,
  );
  assert.ok(
    !violations.some((violation) => violation.filePath === "lib/type-only.ts"),
    `type-only edges must not become runtime boundary violations; got:\n${formatViolations(violations)}`,
  );
});

test("client boundary guard detects a transitive server-only import in a negative fixture", () => {
  const fixtureModules = new Map([
    [
      "components/client-entry.tsx",
      parseModule("components/client-entry.tsx", '"use client";\nimport { value } from "../lib/bridge";\nvoid value;'),
    ],
    [
      "lib/bridge.ts",
      parseModule("lib/bridge.ts", 'export { value } from "./server-adapter.ts";'),
    ],
    [
      "lib/server-adapter.ts",
      parseModule("lib/server-adapter.ts", 'import "server-only";\nexport const value = 1;'),
    ],
  ]);

  const violations = inspectClientBoundaries(
    fixtureModules,
    ["components/client-entry.tsx"],
    aliasMappings,
  );
  assert.ok(
    violations.some(
      (violation) =>
        violation.rule === "client-reaches-server-only-module" &&
        violation.filePath === "lib/server-adapter.ts",
    ),
    `expected the transitive server-only fixture to be rejected; got:\n${formatViolations(violations)}`,
  );
});
