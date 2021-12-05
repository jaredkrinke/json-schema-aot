import type { JSONSchema } from "./json-schema.d.ts";
import {
    accumulateReferences,
    format,
    GenerationError,
    References,
} from "./utils.ts";

function createVariablePrefix(path: string[]): string {
    // camelCase to avoid Deno static analysis complaints
    let first = true;
    let prefix = "";
    for (const element of path) {
        if (first) {
            first = false;
            prefix = element;
        } else {
            prefix += element[0]!.toUpperCase() + element.substring(1);
        }
    }
    return prefix;
}

// Relevant properties: type, properties, required, additionalProperties, items
function generateRecursive(references: References, schema: JSONSchema, valuePath: string[], contextPath: string[]): string {
    const valuePathString = valuePath.join(".");
    const errorHeader = `JSON validation error at ${contextPath.length > 0 ? `"${contextPath.join(".")}"` : "root"}:`;
    if (schema.$ref) {
        // Reference
        return `validate${references[schema.$ref].name!}(${valuePathString});`;
    } else if (schema.anyOf) {
        // Union
        const subschemaContextPath = contextPath.concat(["anyOf"]);
        const count = schema.anyOf.length;
        const prefix = createVariablePrefix(valuePath);
        return `const ${prefix}Errors = [];
            ${schema.anyOf
                .map(s => generateRecursive(references, s, valuePath, subschemaContextPath))
                .map(c => `try {
                    ${c}
                } catch (error) {
                    ${prefix}Errors.push(error);
                }`).join("\n")}
            if (${prefix}Errors.length === ${count}) {
                throw \`${errorHeader} failed to match any of the specified types: \${${prefix}Errors.join("\\n\\n")}\`;
            }`;
    } else if (schema.allOf) {
        // Intersection
        const subschemaContextPath = contextPath.concat(["allOf"]);
        return `{
            ${schema.allOf.map(s => generateRecursive(references, s, valuePath, subschemaContextPath)).join("\n")}
        }
        `;
    }

    switch (schema.type) {
        case "string":
        case "number":
        case "boolean": {
            let code = `if (typeof(${valuePathString}) !== "${schema.type}") {
                throw \`${errorHeader} expected ${schema.type}, but encountered \${typeof(${valuePathString})}\`;
            }`;

            if (schema.type === "string" && schema.pattern) {
                code += `if (!(/${schema.pattern}/.test(${valuePathString}))) {
                    throw \`${errorHeader} string did not match pattern /${schema.pattern}/: \${${valuePathString}}\`;
                }`;
            }

            return code;
        }

        case "object": {
            const requiredProperties = new Set<string>();
            if (schema.required) {
                for (const propertyName of schema.required) {
                    requiredProperties.add(propertyName);
                }
            }

            // Check type
            let code = `if (typeof(${valuePathString}) !== "object") {
                throw \`${errorHeader} expected object, but encountered \${typeof(${valuePathString})}\`;
            } else if (Array.isArray(${valuePathString})) {
                throw \`${errorHeader} expected object, but encountered an array\`;
            }
            
            `;

            const prefix = createVariablePrefix(valuePath);
            if (schema.required) {
                code += `let ${prefix}RequiredPropertyCount = 0;\n`;
            }

            code += `for (const [${prefix}Key, ${prefix}Value] of Object.entries(${valuePathString})) {
                switch (${prefix}Key) {
                    ${Object.entries(schema.properties ?? {})
                        .map(([propertyName, property]) => `case "${propertyName}": {
                            ${generateRecursive(references, property, [`${prefix}Value`], contextPath.concat([propertyName]))}${
                            (schema.required && requiredProperties.has(propertyName)) ? `++${prefix}RequiredPropertyCount;`: ""}
                            break;
                        }
                        `).join("\n")}
                    ${(() => {
                        if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
                            return "";
                        } else if (schema.additionalProperties === false) {
                            return `default: {
                                        throw \`${errorHeader} encountered unexpected property: \${${prefix}Key}\`;
                            }`;
                        } else {
                            return `default: {
                                ${generateRecursive(references, schema.additionalProperties, [`${prefix}Value`], contextPath.concat("additionalProperties"))}
                                break;
                            }
                            `;
                        }
                    })()}
                }
            }`;

            if (schema.required) {
                code += `
                if (${prefix}RequiredPropertyCount !== ${schema.required.length}) {
                    throw \`${errorHeader} missing at least one required property from the list: [${schema.required.join(", ")}]\`;
                }
                `;
            }

            return code;
        }

        case "array": {
            if (!schema.items) {
                throw new GenerationError(`No item definition for array: ${contextPath.join(".")}`);
            }

            const prefix = createVariablePrefix(valuePath);
            return `if (typeof(${valuePathString}) !== "object" || !Array.isArray(${valuePathString})) {
                throw \`${errorHeader} expected array, but encountered \${typeof(${valuePathString})}\`;
            }

            for (const ${prefix}Element of ${valuePathString}) {
                ${generateRecursive(references, schema.items, [`${prefix}Element`], contextPath.concat("items"))}
            }
            `;
        }

        default:
            throw new GenerationError(`No type specified on ${contextPath.join(".")}`);
    }
}

// TODO: Currently the same as the TypeScript; move to utils.ts?
function createNameFromTitle(title: string): string {
    return title.replace(/\s+/g, "");
}


/** Generate JavaScript code for validating the given (valid and supported) JSON Schema. This should be done during development and the resulting code should be checked into source control.
 * 
 * Note: This function should only be called with known safe JSON Schema input (i.e. schema you created yourself). This function has not been analyzed from a security perspective.
 */
 export function generateValidator(schema: JSONSchema): string {
    // Allow $schema as a string at the root on objects, even if not specified
    let root: JSONSchema;
    if (schema.type === "object") {
        const { properties, ...rest } = schema;
        const { ...propertiesRest } = properties;
        root = {
            properties: {
                $schema: { type: "string" },
                ...propertiesRest,
            },
            ...rest,
        };
    } else {
        root = schema;
    }

    let code = "// Do not edit by hand. This file was generated by json-schema-aot.\n\n"

    // Find all references
    let untitledReferenceCount = 0;
    const references = accumulateReferences(root);

    // Create names for all the referenced subschemas
    for (const reference of Object.values(references)) {
        const title = reference.schema.title;
        const name = title ? createNameFromTitle(title) : `$ref${++untitledReferenceCount}`;
        reference.name = name;
    }

    // Generate helpers for all referenced subschemas
    for (const { name, path, schema: subschema } of Object.values(references)) {
        code += `function validate${name}(json) {
            ${generateRecursive(references, subschema, ["json"], path)}
        }

        `;
    }

    const rootReference = references["#"];
    code += `export function validate(json) {
        ${rootReference
            ? `validate${rootReference.name}(json);
                `
            : generateRecursive(references, root, ["json"], [])}
    }

    `;

    return format(code);
}
