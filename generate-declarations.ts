import type { JSONSchema } from "./json-schema.d.ts";
import {
    GenerationError,
    References,
    accumulateReferences,
    visitSchemaNodes,
    pascalCase,
    format,
} from "./utils.ts";

function accumulateTitles(root: JSONSchema): References {
    const titles: References = {};
    visitSchemaNodes(root, (schema, path) => {
        const title = schema.title;
        if (title) {
            titles[title] = {
                name: pascalCase(title),
                path,
                schema,
            };
        }
    });
    return titles;
}

const stringUnionPatternPattern = /^\^\(([a-zA-Z0-9$]+(\|[a-zA-Z0-9$]+)*)\)\$$/;
function generateRecursive(references: References, schema: JSONSchema, contextPath: string[]): string {
    if (schema.$ref) {
        // Reference
        return references[schema.$ref].name!;
    } else if (schema.anyOf) {
        // Union
        const subschemaContextPath = contextPath.concat(["anyOf"]);
        return schema.anyOf.map((s: JSONSchema) => generateRecursive(references, s, subschemaContextPath)).join(" | ");
    } else if (schema.allOf) {
        // Intersection
        const subschemaContextPath = contextPath.concat(["allOf"]);
        return schema.allOf.map((s: JSONSchema) => generateRecursive(references, s, subschemaContextPath)).join(" & ");
    }

    switch (schema.type) {
        case "number":
        case "boolean":
            return schema.type;

        case "string":
            {
                // Check to see if tha pattern indicates a union of string literals
                const pattern = schema.pattern;
                if (pattern) {
                    const matches = stringUnionPatternPattern.exec(pattern);
                    if (matches) {
                        return matches[1].split("|").map(s => `"${s}"`).join(" | ");
                    }
                }

                return schema.type;
            }

        case "object":
            {
                let code = "{\n";
                const requiredProperties = new Set<string>();
                if (schema.required) {
                    for (const propertyName of schema.required) {
                        requiredProperties.add(propertyName);
                    }
                }
                if (schema.properties) {
                    for (const [propertyName, property] of Object.entries(schema.properties)) {
                        if (property.description) {
                            code += `/** ${property.description} */\n`;
                        }
                        code += `    ${propertyName}${requiredProperties.has(propertyName) ? "": "?"}: ${generateRecursive(references, property, contextPath.concat(["properties", propertyName]))};\n`;
                    }
                }
                if (schema.additionalProperties) {
                    code += `    [key: string]: ${schema.additionalProperties === true ? "any" : generateRecursive(references, schema.additionalProperties, contextPath.concat(["additionalProperties"]))};\n`;
                }
                code += "}";
                return code;
            }

        case "array":
            return `${generateRecursive(references, schema.items!, contextPath.concat(["items"]))}[]`;

        default:
            throw new GenerationError(`No type specified for ${contextPath.join(".")}`);
    }
}

export function generateDeclarationsInternal(schema: JSONSchema) {
    let code = "";

    // Create a list of types to generate (all references, plus unreferenced titled subschemas)
    const typesToGenerate: {
        [name: string]: {
            path: string[],
            schema: JSONSchema,
        },
    } = {};

    // Find all references
    const references = accumulateReferences(schema);

    // Create names for all the referenced subschemas
    for (const reference of Object.values(references)) {
        const title = reference.schema.title;

        // Use the title, if provided, or use the property's name, otherwise generate a name
        const name = title
            ? pascalCase(title)
            : ((reference.path.length > 0)
                ? pascalCase(reference.path[reference.path.length - 1])
                : "UntitledType");
        
        reference.name = name;
        typesToGenerate[name] = reference;
    }

    // Find all titled types
    const titles = accumulateTitles(schema);

    // Add unreferenced ones to the list of types to generate
    for (const reference of Object.values(titles)) {
        const name = reference.name!;
        if (!typesToGenerate[name]) {
            typesToGenerate[name] = reference;
        }
    }

    // Also add the root, if needed (even if it doesn't have a title)
    if (!schema.title && !Object.values(references).map(r => r.schema).includes(schema)) {
        typesToGenerate["UntitledSchema"] = {
            path: [],
            schema,
        };
    }

    // Generate interfaces for all referenced subschemas
    for (const [ name, { path, schema: subschema } ] of Object.entries(typesToGenerate)) {
        if (subschema.description) {
            code += `/** ${subschema.description} */\n`;
        }

        switch (subschema.type) {
            case "string":
            case "number":
            case "boolean":
            case "array":
                code += `export type ${name} = ${generateRecursive(references, subschema, path)};\n\n`;
                break;
            
            case "object":
                code += `export interface ${name} ${generateRecursive(references, subschema, path)}\n\n`;
                break;
        }
    }

    // Note root type name
    let rootTypeName: string;
    for (const [name, { path }] of Object.entries(typesToGenerate)) {
        if (path.length === 0) {
            rootTypeName = name;
        }
    }

    return {
        code: format(code),
        name: rootTypeName!,
    };
}

/** Generate TypeScript declaration file (.d.ts) for titled types in the (valid and supported) schema. */
export function generateDeclarations(schema: JSONSchema): string {
    return generateDeclarationsInternal(schema).code;
}
