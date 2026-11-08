interface SimplificationRule {
  name: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  testBefore: string;
  testAfter: string;
}

export const SIMPLIFICATION_RULES: SimplificationRule[] = [
  {
    name: "Optional Chaining",
    description: "Replace manual null checks with optional chaining (?.).",
    pattern: /(\w+)\s*&&\s*\1\.(\w+)/g,
    replacement: "$1?.$2",
    testBefore: "user && user.name",
    testAfter: "user?.name",
  },
  {
    name: "Template Literals",
    description: "Replace string concatenation with template literals.",
    pattern: /(['"])([^'"]*)\1\s*\+\s*(\w+)\s*\+\s*(['"])([^'"]*)\4/g,
    replacement: "`$2${$3}$5`",
    testBefore: "'Hello ' + name + '!'",
    testAfter: "`Hello ${name}!`",
  },
  {
    name: "Object Property Shorthand",
    description: "Use shorthand when property name matches variable name.",
    pattern: /\{\s*(\w+):\s*\1\s*\}/g,
    replacement: "{ $1 }",
    testBefore: "{ name: name }",
    testAfter: "{ name }",
  },
  {
    name: "Array.includes",
    description: "Replace indexOf !== -1 with includes().",
    pattern: /(\w+(?:\.\w+)*)\.indexOf\(([^)]+)\)\s*!==?\s*-1/g,
    replacement: "$1.includes($2)",
    testBefore: "arr.indexOf(x) !== -1",
    testAfter: "arr.includes(x)",
  },
  {
    name: "Array.includes (negative)",
    description: "Replace indexOf === -1 with !includes().",
    pattern: /(\w+(?:\.\w+)*)\.indexOf\(([^)]+)\)\s*===?\s*-1/g,
    replacement: "!$1.includes($2)",
    testBefore: "arr.indexOf(x) === -1",
    testAfter: "!arr.includes(x)",
  },
  {
    name: "Exponentiation Operator",
    description: "Replace Math.pow with ** operator.",
    pattern: /Math\.pow\(([^,]+),\s*([^)]+)\)/g,
    replacement: "($1 ** $2)",
    testBefore: "Math.pow(2, 3)",
    testAfter: "(2 ** 3)",
  },
  {
    name: "Object.keys().length",
    description: "Clarify empty object check.",
    pattern: /Object\.keys\((\w+)\)\.length\s*===?\s*0/g,
    replacement: "Object.keys($1).length === 0 /* isEmpty */",
    testBefore: "Object.keys(obj).length === 0",
    testAfter: "Object.keys(obj).length === 0 /* isEmpty */",
  },
  {
    name: "Arrow Function Implicit Return",
    description: "Simplify single-expression arrow functions.",
    pattern: /=>\s*\{\s*return\s+([^;{}]+);\s*\}/g,
    replacement: "=> $1",
    testBefore: "() => { return x + 1; }",
    testAfter: "() => x + 1",
  },
  {
    name: "Destructuring Assignment",
    description: "Use destructuring for multiple property access.",
    pattern: /const\s+(\w+)\s*=\s*(\w+)\.(\w+);\s*const\s+(\w+)\s*=\s*\2\.(\w+);/g,
    replacement: "const { $3: $1, $5: $4 } = $2;",
    testBefore: "const name = user.name; const age = user.age;",
    testAfter: "const { name, age } = user;",
  },
  {
    name: "String.startsWith",
    description: "Replace indexOf === 0 with startsWith().",
    pattern: /(\w+(?:\.\w+)*)\.indexOf\(([^)]+)\)\s*===?\s*0/g,
    replacement: "$1.startsWith($2)",
    testBefore: "str.indexOf('prefix') === 0",
    testAfter: "str.startsWith('prefix')",
  },
  {
    name: "Boolean Conversion",
    description: "Simplify double negation to Boolean().",
    pattern: /!!\s*(\w+(?:\.\w+)*)/g,
    replacement: "Boolean($1)",
    testBefore: "!!value",
    testAfter: "Boolean(value)",
  },
];

export interface Simplification {
  file: string;
  line: number;
  rule: string;
  before: string;
  after: string;
}

export function applySimplifications(
  content: string,
  filePath: string,
): { newContent: string; simplifications: Simplification[] } {
  let newContent = content;
  const simplifications: Simplification[] = [];
  const lines = content.split("\n");

  for (const rule of SIMPLIFICATION_RULES) {
    const matches = content.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags));

    for (const match of matches) {
      if (match.index == null) continue;

      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;
      const line = lines[lineNumber - 1] ?? "";
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      const before = match[0];
      const after = typeof rule.replacement === "function"
        ? rule.replacement(match[0], ...(match.slice(1) as string[]))
        : match[0].replace(rule.pattern, rule.replacement);

      if (before !== after) {
        simplifications.push({
          file: filePath,
          line: lineNumber,
          rule: rule.name,
          before: before.trim(),
          after: after.trim(),
        });
      }
    }

    if (typeof rule.replacement === "string") {
      newContent = newContent.replace(rule.pattern, rule.replacement);
    }
  }

  return { newContent, simplifications };
}
