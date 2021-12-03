import type { JSONSchema } from "./json-schema.d.ts";
import { GenerationError, References, accumulateReferences, visitSchemaNodes } from "./utils.ts";

function createTypeScriptNameFromTitle(title: string): string {
    return title.replace(/\s+/g, "");
}

function accumulateTitles(root: JSONSchema): References {
    const titles: References = {};
    visitSchemaNodes(root, (schema, path) => {
        const title = schema.title;
        if (title) {
            titles[title] = {
                name: createTypeScriptNameFromTitle(title),
                path,
                schema
            };
        }
    });
    return titles;
}

// TODO: Bubble descriptions up...
const stringUnionPatternPattern = /^\^\(([a-zA-Z0-9$]+(\|[a-zA-Z0-9$]+)*)\)\$$/;
function generateTypeScriptDeclarationsRecursive(references: References, schema: JSONSchema, contextPath: string[]): string {
    if (schema.$ref) {
        // Reference
        return references[schema.$ref].name!;
    } else if (schema.anyOf) {
        // Union
        const subschemaContextPath = contextPath.concat(["anyOf"]);
        return schema.anyOf.map((s: JSONSchema) => generateTypeScriptDeclarationsRecursive(references, s, subschemaContextPath)).join(" | ");
    } else if (schema.allOf) {
        // Intersection
        const subschemaContextPath = contextPath.concat(["allOf"]);
        return schema.allOf.map((s: JSONSchema) => generateTypeScriptDeclarationsRecursive(references, s, subschemaContextPath)).join(" & ");
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
                        code += `    ${propertyName}${requiredProperties.has(propertyName) ? "": "?"}: ${generateTypeScriptDeclarationsRecursive(references, property, contextPath.concat(["properties", propertyName]))},\n`;
                    }
                }
                if (schema.additionalProperties) {
                    code += `    [key: string]: ${schema.additionalProperties === true ? "any" : generateTypeScriptDeclarationsRecursive(references, schema.additionalProperties, contextPath.concat(["additionalProperties"]))},`;
                }
                code += "}\n";
                return code;
            }

        case "array":
            return `${generateTypeScriptDeclarationsRecursive(references, schema.items!, contextPath.concat(["items"]))}[]`;

        default:
            throw new GenerationError(`No type specified for ${contextPath.join(".")}`);
    }
}

/** Generate TypeScript declaration file (.d.ts) for titled types. */
export function generateTypeScriptDeclarations(schema: JSONSchema): string {
    let code = "// Do not edit by hand. This file was generated by json-schema-aot.\n\n"

    // Create a list of types to generate (all references, plus unreferenced titled subschemas)
    const typesToGenerate: {
        [name: string]: {
            path: string[],
            schema: JSONSchema,
        },
    } = {};

    // Find all references
    let untitledTypeCount = 0;
    const references = accumulateReferences(schema);

    // Create names for all the referenced subschemas
    for (const reference of Object.values(references)) {
        const title = reference.schema.title;
        const name = title ? createTypeScriptNameFromTitle(title) : `UntitledType${++untitledTypeCount}`;
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
                code += `export type ${name} = ${generateTypeScriptDeclarationsRecursive(references, subschema, path)};`;
                break;
            
            case "object":
                code += `export interface ${name} ${generateTypeScriptDeclarationsRecursive(references, subschema, path)}
                
                `;
                break;
        }
    }

    return code;
}
