import type { JSONSchema } from "./json-schema.d.ts";
import { GenerationError, References, accumulateReferences, convertReferenceToPath, internalReferencePattern } from "./utils.ts";

// Relevant properties: type, properties, required, additionalProperties, items
function generateRecursive2(references: References, schema: JSONSchema, valuePath: string[], contextPath: string[]): string {
    const valuePathString = `json${valuePath.map(e => `.${e}`).join("")}`;
    const errorHeader = `JSON validation error at ${contextPath.length > 0 ? `"${contextPath.join(".")}"` : "root"}:`;
    if (schema.$ref) {
        // Reference
        return `validate${references[schema.$ref].name!}(${valuePathString});
        `;
    } else if (schema.anyOf) {
        // Union
        const subschemaContextPath = contextPath.concat(["anyOf"]);
        const count = schema.anyOf.length;
        return `{
            let errors = [];
            ${schema.anyOf
                .map(s => generateRecursive2(references, s, valuePath, subschemaContextPath))
                .map(c => `try {
                    ${c}
                } catch (error) {
                    errors.push(error);
                }`).join("\n")}
            if (errors.length === ${count}) {
                throw \`${errorHeader} failed to match any of the specified types: \${errors.join("\\n\\n")}\`;
            }
        }
        `;
    } else if (schema.allOf) {
        // Intersection
        const subschemaContextPath = contextPath.concat(["allOf"]);
        return `{
            let errors = [];
            ${schema.allOf
                .map(s => generateRecursive2(references, s, valuePath, subschemaContextPath))
                .map(c => `try {
                    ${c}
                } catch (error) {
                    errors.push(error);
                }`).join("\n")}
            if (errors.length > 0) {
                throw \`${errorHeader} failed to match all of the specified types: \${errors.join("\\n\\n")}\`;
            }
        }
        `;
    }

    switch (schema.type) {
        case "string":
        case "number":
        case "boolean":
            {
                let code = `if (typeof(${valuePathString}) !== "${schema.type}") {
                    throw \`${errorHeader} expected ${schema.type}, but encountered \${typeof(${valuePathString})}\`;
                }
                `;

                if (schema.type === "string" && schema.pattern) {
                    code += `if (!(/${schema.pattern}/.test(${valuePathString}))) {
                        throw \`${errorHeader} string did not match pattern /${schema.pattern}/: \${${valuePathString}}\`;
                    }
                    `;
                }

                return code;
            }

        case "object":
            {
                const requiredProperties = new Set<string>();
                if (schema.required) {
                    for (const propertyName of schema.required) {
                        requiredProperties.add(propertyName);
                    }
                }

                // Check type
                let code = `if (typeof(${valuePathString}) !== "object") {
                    throw \`${errorHeader} expected object, but encountered \${typeof(${valuePathString})}\`;
                }
                
                if (Array.isArray(${valuePathString})) {
                    throw \`${errorHeader} expected object, but encountered an array\`;
                }
                
                `;

                if (schema.required) {
                    code += "let requiredPropertyCount = 0;\n";
                }

                code += `for (const key of Object.keys(${valuePathString})) {
                    switch (key) {
                        ${Object.entries(schema.properties ?? {})
                            .map(([propertyName, property]) => `case "${propertyName}": {
                                ${generateRecursive2(references, property, valuePath.concat([propertyName]), contextPath.concat([propertyName]))}
                                ${(schema.required && requiredProperties.has(propertyName)) ? "++requiredPropertyCount;": ""}
                                break;
                            }
                            `).join("\n")}
                        ${(() => {
                            if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
                                return "";
                            } else if (schema.additionalProperties === false) {
                                return `default:
                                            throw \`${errorHeader} encountered unexpected property: \${key}\`;
                                    `;
                            } else {
                                return generateRecursive2(references, schema.additionalProperties, valuePath, contextPath.concat("additionalProperties"));
                            }
                        })()}
                    }
                }`

                if (schema.required) {
                    code += `if (requiredPropertyCount !== ${schema.required.length}) {
                        throw \`${errorHeader} missing at least one required property from the list: [${schema.required.join(", ")}]\`;
                    }
                    `;
                }

                return code;
            }

        case "array":
            throw new GenerationError("Not implemented yet!");

        default:
            throw new GenerationError(`No type specified on ${contextPath.join(".")}`);
    }
}

// TODO: Currently the same as the TypeScript; move to utils.ts?
function createNameFromTitle(title: string): string {
    return title.replace(/\s+/g, "");
}


/** Generate JavaScript code for validating the given JSON Schema. This should be done during development and the resulting code should be (programmatically) formatted and then checked into source control.
 * 
 * Note: This function should only be called with known safe JSON Schema input (i.e. schema you created yourself). This function has not been analyzed from a security perspective.
 */
 export function generateValidatorCode(schema: JSONSchema): string {
    let code = "// Do not edit by hand. This file was generated by json-schema-aot.\n\n"

    // Find all references
    let untitledReferenceCount = 0;
    const references = accumulateReferences(schema);

    // Create names for all the referenced subschemas
    for (const reference of Object.values(references)) {
        const title = reference.schema.title;
        const name = title ? createNameFromTitle(title) : `$ref${++untitledReferenceCount}`;
        reference.name = name;
    }

    // Generate helpers for all referenced subschemas
    for (const [ name, { path, schema: subschema } ] of Object.entries(references)) {
        code += `function validate${name}(json) {
            ${generateRecursive2(references, subschema, [], path)}
        }
        `;
    }

    const rootReference = references["#"];
    code += `export function validate(json) {
        ${rootReference
            ? `validate${rootReference.name}(json);
                `
            : generateRecursive2(references, schema, [], [])}
    }
    `;

    return code;
}
