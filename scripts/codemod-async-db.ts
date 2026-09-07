/**
 * One-shot codemod: the data layer became async (node-postgres is async-only).
 *
 * 1. `await` every call to the db primitives (all/get/run/tx) and to any function
 *    that transitively becomes async.
 * 2. Mark the enclosing function `async` and propagate through the call graph until
 *    a fixed point is reached.
 *
 * Uses the TypeScript AST (ts-morph) rather than regex so that call sites inside
 * template literals, nested calls and JSX are handled correctly.
 */
import { Project, SyntaxKind, Node, type SourceFile, type FunctionLikeDeclaration } from "ts-morph";

const DB_PRIMITIVES = new Set(["all", "get", "run", "tx", "withRlsUser"]);

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
project.addSourceFilesAtPaths(["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"]);

/** Fully-qualified key for a function-like node, used to track "is now async". */
function keyOf(fn: Node): string {
  const sf = fn.getSourceFile().getFilePath();
  return `${sf}#${fn.getStart()}`;
}

function enclosingFunction(node: Node): FunctionLikeDeclaration | undefined {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    if (
      Node.isFunctionDeclaration(cur) ||
      Node.isMethodDeclaration(cur) ||
      Node.isArrowFunction(cur) ||
      Node.isFunctionExpression(cur)
    ) {
      return cur as FunctionLikeDeclaration;
    }
    cur = cur.getParent();
  }
  return undefined;
}

/** Names of local functions that are (or have become) async and so need awaiting. */
const asyncNames = new Set<string>(DB_PRIMITIVES);

function collectAsyncExports(sf: SourceFile) {
  for (const fn of sf.getFunctions()) {
    if (fn.isAsync()) {
      const n = fn.getName();
      if (n) asyncNames.add(n);
    }
  }
}

let changed = true;
let pass = 0;

while (changed && pass < 12) {
  changed = false;
  pass++;

  for (const sf of project.getSourceFiles()) collectAsyncExports(sf);

  for (const sf of project.getSourceFiles()) {
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const expr = call.getExpression();
      let name: string | undefined;
      if (Node.isIdentifier(expr)) name = expr.getText();
      else if (Node.isPropertyAccessExpression(expr)) name = expr.getName();
      if (!name || !asyncNames.has(name)) continue;

      // Skip if the call is a property of an object we know is not our db module
      // (e.g. `res.get(...)`, `map.get(...)`, `params.get(...)`).
      if (Node.isPropertyAccessExpression(expr)) {
        const objText = expr.getExpression().getText();
        const safeObjects = ["searchParams", "params", "headers", "map", "byType", "usage", "cookies", "store", "req", "request", "url", "localStorage", "window", "document", "fd", "formData"];
        if (safeObjects.some((o) => objText.toLowerCase().includes(o.toLowerCase()))) continue;
        // Only allow property access when it looks like our imported namespace.
        if (!/^(db|database)$/i.test(objText)) continue;
      }

      // Already awaited?
      const parent = call.getParent();
      if (Node.isAwaitExpression(parent)) continue;
      // `void runWorker(...)` and `.then(...)` chains are intentional fire-and-forget.
      if (Node.isVoidExpression(parent)) continue;
      if (Node.isPropertyAccessExpression(parent) && ["then", "catch", "finally"].includes(parent.getName())) continue;

      const fn = enclosingFunction(call);
      if (!fn) continue;

      call.replaceWithText(`await ${call.getText()}`);
      changed = true;

      if (!fn.isAsync()) {
        fn.setIsAsync(true);
        const fnName = Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn) ? fn.getName() : undefined;
        if (fnName) asyncNames.add(fnName);
        // Variable-assigned arrow functions: register their variable name too.
        const varDecl = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
        if (varDecl) asyncNames.add(varDecl.getName());
      }
    }
  }
}

project.saveSync();
console.log(`Codemod terminé en ${pass} passes.`);
console.log(`Fonctions asynchrones connues : ${asyncNames.size}`);
