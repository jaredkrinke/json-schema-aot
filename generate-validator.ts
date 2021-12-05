import type { JSONSchema } from "./json-schema.d.ts";
import {
    accumulateReferences,
    capitalize,
    format,
    pascalCase,
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
            prefix += capitalize(element);
        }
    }
    return prefix;
}

// String formats that are parsed into Date objects
const dateFormats = new Set<string>([
    "date",
    "date-time",
]);

// Relevant properties: type, properties, required, additionalProperties, items
function generateRecursive(references: References, schema: JSONSchema, valuePath: string[], contextPath: string[]): string {
    const valuePathString = valuePath.join(".");
    const errorHeader = `JSON validation error at ${contextPath.length > 0 ? `"${contextPath.join(".")}"` : "root"}:`;
    if (schema.$ref) {
        // Reference
        return `return parse${references[schema.$ref].name!}(${valuePathString});\n`;
    } else if (schema.anyOf) {
        // Union
        const subschemaContextPath = contextPath.concat(["anyOf"]);
        const prefix = createVariablePrefix(valuePath);
        return `const ${prefix}Errors = [];
            ${schema.anyOf
                .map(s => generateRecursive(references, s, valuePath, subschemaContextPath))
                .map(c => `try {
                    ${c};
                } catch (error) {
                    ${prefix}Errors.push(error);
                }`).join("\n")}
                throw \`${errorHeader} failed to match any of the specified types: \${${prefix}Errors.join("\\n\\n")}\`;\n`;
    } else if (schema.allOf) {
        // Intersection
        // Just merge the schema
        let subschema: JSONSchema = {};
        for (const item of schema.allOf) {
            const { ...rest } = item;
            subschema = { ...subschema, ...rest };
        }
        return generateRecursive(references, subschema, valuePath, contextPath.concat(["allOf"]));
    }

    switch (schema.type) {
        case "number":
        case "boolean": {
            return `if (typeof(${valuePathString}) !== "${schema.type}") {
                throw \`${errorHeader} expected ${schema.type}, but encountered \${typeof(${valuePathString})}\`;
            }
            
            return ${valuePathString};\n`;
        }

        case "string": {
            const format = schema.format;
            if (format && dateFormats.has(format)) {
                // Date string; allow Date to support parsed values
                return `if (typeof(${valuePathString}) !== "string" && !(${valuePathString} instanceof Date)) {
                    throw \`${errorHeader} expected string or Date, but encountered \${typeof(${valuePathString})}\`;
                }
                
                return new Date(${valuePathString});\n`;
            }

            // Generic string
            let code = `if (typeof(${valuePathString}) !== "string") {
                throw \`${errorHeader} expected string, but encountered \${typeof(${valuePathString})}\`;
            }`;

            if (schema.type === "string" && schema.pattern) {
                code += `if (!(/${schema.pattern}/.test(${valuePathString}))) {
                    throw \`${errorHeader} string did not match pattern /${schema.pattern}/: \${${valuePathString}}\`;
                }`;
            }

            code += `\nreturn ${valuePathString};\n`;

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

            code += `const ${prefix}ResultObject = {};
                for (const [${prefix}Key, ${prefix}Value] of Object.entries(${valuePathString})) {
                ${prefix}ResultObject[${prefix}Key] = (() => {
                    switch (${prefix}Key) {
                        ${Object.entries(schema.properties ?? {})
                            .map(([propertyName, property]) => `case "${propertyName}": {
                                ${(schema.required && requiredProperties.has(propertyName)) ? `\n++${prefix}RequiredPropertyCount;`: ""}
                                ${generateRecursive(references, property, [`${prefix}Value`], contextPath.concat([propertyName]))}
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
                                }
                                `;
                            }
                        })()}
                    }
                })();
            }`;

            if (schema.required) {
                code += `
                if (${prefix}RequiredPropertyCount !== ${schema.required.length}) {
                    throw \`${errorHeader} missing at least one required property from the list: [${schema.required.join(", ")}]\`;
                }
                `;
            }

            code += `return ${prefix}ResultObject;\n`;

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

            return ${valuePathString}.map(${prefix}Element => {
                ${generateRecursive(references, schema.items, [`${prefix}Element`], contextPath.concat("items"))}
            })
            `;
        }

        default:
            throw new GenerationError(`No type specified on ${contextPath.join(".")}`);
    }
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

        // Use the title, if provided, or use the property's name, otherwise generate a name
        const name = title
            ? pascalCase(title)
            : ((reference.path.length > 0)
                ? pascalCase(reference.path[reference.path.length - 1])
                : `UntitledReference${++untitledReferenceCount}`);
        
        reference.name = name;
    }

    // Generate helpers for all referenced subschemas
    for (const { name, path, schema: subschema } of Object.values(references)) {
        code += `function parse${name}(json) {
            ${generateRecursive(references, subschema, ["json"], path)}
        }

        `;
    }

    // Validator
    const rootReference = references["#"];
    code += `export function parse(json) {
        ${rootReference
            ? `return parse${rootReference.name}(json);
                `
            : generateRecursive(references, root, ["json"], [])}
    }

    `;

    // Parser
    code += `export function validate(json) {
        parse(json);
    }\n`;

    return format(code);
}
