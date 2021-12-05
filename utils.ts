import type { JSONSchema } from "./json-schema.d.ts";

export class GenerationError extends Error {
    constructor(message: string) {
        super(message);
    }
}

const internalReferencePattern = /^#((\/[$a-zA-Z0-9]+)*)$/;

function evaluatePath(schema: JSONSchema, path: string[]): JSONSchema {
    if (path.length === 0) {
        return schema;
    } else {
        const element = path.shift()!; // Mutates the array
        return evaluatePath((schema as unknown as Record<string, JSONSchema>)[element], path);
    }
}

function convertReferenceToPath(matches: RegExpExecArray): string[] {
    // matches[1] is something like "/$defs/myDef"; remove first character and split on "/" to get the path
    return matches[1] ? matches[1].substring(1).split("/") : [];
}

function evaluateReference(schema: JSONSchema, reference: string, path: string[]): JSONSchema {
    try {
        return evaluatePath(schema, path.slice());
    } catch (error) {
        throw new GenerationError(`Failed to evaluate reference ${reference}: ${error}`);
    }
}

export interface References {
    [reference: string]: {
        name?: string;
        path: string[];
        schema: JSONSchema;
    };
}

type SchemaNodeVisitorCallback = (schema: JSONSchema, path: string[]) => void;

function visitSchemaNodesRecursive(callback: SchemaNodeVisitorCallback, schema: JSONSchema, path: string[]): void {
    callback(schema, path);
    switch (schema.type) {
        case "object":
            {
                if (schema.properties) {
                    for (const [propertyName, property] of Object.entries(schema.properties)) {
                        visitSchemaNodesRecursive(callback, property, path.concat(["properties", propertyName]));
                    }
                }
            }
            break;

        case "array":
            {
                const items = schema.items;
                if (!items) {
                    throw new GenerationError(`No items specified on array: ${path.join(".")}`);
                }

                visitSchemaNodesRecursive(callback, items, path.concat(["items"]));
            }
            break;
    }
}

export function visitSchemaNodes(schema: JSONSchema, callback: (schema: JSONSchema, path: string[]) => void): void {
    visitSchemaNodesRecursive(callback, schema, []);
}

export function accumulateReferences(root: JSONSchema): References {
    const references: References = {};
    visitSchemaNodes(root, (schema, path) => {
        const reference = schema.$ref;
        if (reference) {
            const matches = internalReferencePattern.exec(reference);
            if (!matches) {
                throw new GenerationError(`Unsupported reference in ${path.join(".")}: ${reference}`);
            }
            
            const referencePath = convertReferenceToPath(matches);
            references[reference] = {
                path: referencePath,
                schema: evaluateReference(root, reference, referencePath),
            }
        }
    });
    return references;
}

export function format(code: string, tabSize = 4): string {
    // Remove all indentation and split into lines
    const cleaned = code.replace(/^[ \t]+/mg, "");
    const lines = cleaned.split(/\r?\n/g);

    // Naive algorithm: increase indent for lines ending with "{"; decrease for lines starting with "}"
    let str = "";
    let depth = 0;
    const tab = " ".repeat(tabSize);
    for (const line of lines) {
        if (line.length > 0 && line[0] === "}") {
                depth = Math.max(0, depth - 1);
        }
        str += tab.repeat(depth) + line + "\n";
        if (line.length > 0 && line[line.length - 1] === "{") {
            ++depth;
        }
    }
    return str;
}
