import { parse } from "@babel/parser";
import type { NodePath } from "@babel/traverse";
import { createRequire } from "node:module";
import path from "node:path";
import { parse as parseHtml, type DefaultTreeAdapterMap } from "parse5";
import type { TechnologyCodeUsage } from "../../../shared/project-technologies";
import type { TechnologyEvidenceContext, TechnologyUsageDetector } from "./contracts";

const traverse = createRequire(import.meta.url)("@babel/traverse")
  .default as typeof import("@babel/traverse").default;
type Origin = { module: string } | { global: string };
type SourceCall = Origin & { line: number; column: number; expression: string };
const callsCache = new Map<string, SourceCall[]>();
const browserGlobals: Record<string, readonly string[]> = {
  gsap: ["gsap"],
  three_js: ["THREE"],
  paper_js: ["paper"],
  rough_js: ["rough"],
  chroma_js: ["chroma"],
  motion: ["Motion"],
  pica: ["pica"],
  pixi_js: ["PIXI"],
};

/** Resolve lexical bindings rather than matching library names in strings or comments. */
function origin(
  expression: NodePath<NodePath["node"] | null | undefined> | NodePath[],
  seen = new Set<object>(),
): Origin | undefined {
  if (Array.isArray(expression) || !expression.node || seen.has(expression.node)) return;
  seen.add(expression.node);
  if (expression.isMemberExpression() || expression.isOptionalMemberExpression()) {
    const object = expression.get("object");
    const property = expression.get("property");
    if (Array.isArray(object) || Array.isArray(property)) return;
    if (expression.node.computed && !property.isStringLiteral()) return;
    const name = property.isIdentifier()
      ? property.node.name
      : property.isStringLiteral()
        ? property.node.value
        : undefined;
    if (
      object.isIdentifier() &&
      ["window", "globalThis"].includes(object.node.name) &&
      !object.scope.getBinding(object.node.name)
    )
      return name ? { global: name } : undefined;
    return origin(object, seen);
  }
  if (expression.isIdentifier()) {
    const binding = expression.scope.getBinding(expression.node.name);
    if (!binding) return { global: expression.node.name };
    if (!binding.constant) return;
    const declaration = binding.path;
    if (
      declaration.isImportSpecifier() ||
      declaration.isImportDefaultSpecifier() ||
      declaration.isImportNamespaceSpecifier()
    ) {
      const parent = declaration.parentPath;
      if (parent?.isImportDeclaration()) return { module: parent.node.source.value };
    }
    if (declaration.isVariableDeclarator()) return origin(declaration.get("init"), seen);
    return;
  }
  if (
    expression.isCallExpression() ||
    expression.isNewExpression() ||
    expression.isOptionalCallExpression()
  )
    return origin(expression.get("callee"), seen);
  if (expression.isLogicalExpression() || expression.isConditionalExpression()) {
    const first = origin(
      expression.get(expression.isLogicalExpression() ? "left" : "consequent") as NodePath,
      new Set(seen),
    );
    const second = origin(
      expression.get(expression.isLogicalExpression() ? "right" : "alternate") as NodePath,
      new Set(seen),
    );
    return first && JSON.stringify(first) === JSON.stringify(second) ? first : undefined;
  }
}

function javascriptCalls(source: string, lineOffset = 0, columnOffset = 0): SourceCall[] {
  const calls: SourceCall[] = [];
  try {
    const ast = parse(source, { sourceType: "unambiguous", allowAwaitOutsideFunction: true });
    const visit = (node: NodePath) => {
      if (!(node.isCallExpression() || node.isOptionalCallExpression() || node.isNewExpression()))
        return;
      const callee = node.get("callee");
      if (Array.isArray(callee) || !callee.node) return;
      const resolved = origin(callee);
      if (!resolved || !node.node.loc) return;
      calls.push({
        ...resolved,
        line: node.node.loc.start.line + lineOffset,
        column:
          node.node.loc.start.column + (node.node.loc.start.line === 1 ? columnOffset : 0) + 1,
        expression: source.slice(callee.node.start ?? 0, callee.node.end ?? 0).slice(0, 120),
      });
    };
    traverse(ast, { CallExpression: visit, OptionalCallExpression: visit, NewExpression: visit });
  } catch {
    // Unsupported or malformed source is unknown, never a text-match fallback.
  }
  return calls;
}

function sourceCalls(file: string, hash: string, source: string): SourceCall[] {
  const key = `${path.extname(file)}:${hash}`;
  const cached = callsCache.get(key);
  if (cached) return cached;
  let calls: SourceCall[] = [];
  if (/\.m?js$/i.test(file)) calls = javascriptCalls(source);
  else if (/\.html?$/i.test(file)) {
    const visit = (node: DefaultTreeAdapterMap["node"]) => {
      if (
        "tagName" in node &&
        node.tagName === "script" &&
        !node.attrs.some((item) => item.name === "src")
      ) {
        const type = node.attrs.find((item) => item.name === "type")?.value;
        if (!type || /^(module|(?:text|application)\/(?:java|ecma)script)$/i.test(type)) {
          const text = node.childNodes
            .map((child) => ("value" in child ? child.value : ""))
            .join("");
          const location = node.sourceCodeLocation?.startTag;
          calls.push(
            ...javascriptCalls(text, (location?.endLine ?? 1) - 1, (location?.endCol ?? 1) - 1),
          );
        }
      }
      if ("childNodes" in node) node.childNodes.forEach(visit);
    };
    visit(parseHtml(source, { sourceCodeLocationInfo: true }));
  }
  if (callsCache.size >= 32) callsCache.delete(callsCache.keys().next().value!);
  callsCache.set(key, calls);
  return calls;
}

/** Static authored-code evidence. A call in source is not proof that its branch executed. */
export async function technologyCodeUsage(
  context: TechnologyEvidenceContext,
): Promise<TechnologyCodeUsage[]> {
  if (!context.observation || !(await context.observationUnchanged())) return [];
  const usage: TechnologyCodeUsage[] = [];
  for (const [file, hash] of Object.entries(context.observation.resources).slice(0, 200)) {
    if (
      !/\.(?:html?|m?js)$/i.test(file) ||
      /(?:^|\/)(?:vendor|node_modules|technology-[^/]+)(?:\/|$)/.test(file) ||
      context.moduleFiles?.includes(file)
    )
      continue;
    try {
      const source = await context.readFile(file);
      if (source.length > 2_000_000) continue;
      for (const call of sourceCalls(file, hash, source)) {
        let matches = false;
        if ("module" in call) {
          if (/^\.{1,2}\//.test(call.module)) {
            const imported = path.posix.normalize(
              path.posix.join(path.posix.dirname(file), call.module.split(/[?#]/)[0]),
            );
            matches = Boolean(context.moduleFiles?.includes(imported));
          }
        } else {
          matches =
            context.browserLoaded && Boolean(browserGlobals[context.id]?.includes(call.global));
        }
        if (matches)
          usage.push({ file, line: call.line, column: call.column, expression: call.expression });
        if (usage.length >= 8) return usage;
      }
    } catch {
      // Missing or out-of-bound authored files remain unknown.
    }
  }
  return usage;
}

export class SourceCodeUsageEvidenceDetector implements TechnologyUsageDetector {
  async detect(context: TechnologyEvidenceContext) {
    return context.codeUsage?.length ? ["Code API usage found"] : [];
  }
}
