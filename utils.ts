import type { JSONSchema } from "./json-schema.d.ts";

export class GenerationError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export const internalReferencePattern = /^#((\/[$a-zA-Z0-9]+)*)$/;

function evaluatePath(schema: JSONSchema, path: string[]): JSONSchema {
    if (path.length === 0) {
        return schema;
    } else {
        const element = path.shift()!; // Mutates the array
        return evaluatePath((schema as unknown as Record<string, JSONSchema>)[element], path);
    }
}

export function convertReferenceToPath(matches: RegExpExecArray): string[] {
    return matches[1] ? matches[1].substring(1).split("/") : [];
}

function evaluateReference(schema: JSONSchema, reference: string, path: string[]) {
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

export function accumulateReferences(references: References, root: JSONSchema, schema: JSONSchema, path: string[]): void {
    // Traverse properties and items, noting references
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

    switch (schema.type) {
        case "object":
            {
                if (schema.properties) {
                    for (const [propertyName, property] of Object.entries(schema.properties)) {
                        accumulateReferences(references, root, property, path.concat(["properties", propertyName]));
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

                accumulateReferences(references, root, items, path.concat(["items"]));
            }
            break;
    }
}