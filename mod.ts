import type { JSONSchema } from "./json-schema.d.ts";
export type { JSONSchema };

/** Schema for the subset of JSON Schema that this module supports. */
export const JSONSchemaSchema: JSONSchema = {
    title: "JSON Schema",
    description: "This interface represents all of the JSON Schema functionality that is supported by this module.",

    $defs: {
        "definitions": {
            title: "JSON Schema Definitions",
            type: "object",
            additionalProperties: { $ref: "#" },
        },
    },

    type: "object",
    properties: {
        // Metadata
        title: { type: "string" },
        description: { type: "string" },
        $schema: { type: "string" },
        $comment: { type: "string" },

        // References and metadata
        $ref: {
            type: "string",
            pattern: "^#(\/[$a-zA-Z0-9]+)*$",
        },
        
        $defs: { $ref: "#/$defs/definitions" },
        definitions: { $ref: "#/$defs/definitions" }, // Old name for $defs

        // Type information
        type: {
            type: "string",
            pattern: "^(string|number|boolean|object|array)$",
        },

        // String
        pattern: { type: "string" },

        // Object
        properties: {
            type: "object",
            additionalProperties: { $ref: "#" },
        },

        required: {
            type: "array",
            items: { type: "string" },
        },

        additionalProperties: {
            anyOf: [
                { type: "boolean"},
                { $ref: "#" },
            ],
        },

        // Array
        items: { $ref: "#" },

        // Union and intersection
        anyOf: {
            type: "array",
            items: { $ref: "#" },
        },

        allOf: {
            type: "array",
            items: { $ref: "#" },
        }
    },
    additionalProperties: false,
};

export class GenerationError extends Error {
    constructor(message: string) {
        super(message);
    }
}


function evaluatePath(schema: JSONSchema, path: string[]): JSONSchema {
    if (path.length === 0) {
        return schema;
    } else {
        const element = path.shift()!; // Mutates the array
        return evaluatePath((schema as unknown as Record<string, JSONSchema>)[element], path);
    }
}

const internalReferencePattern = /^#((\/[$a-zA-Z0-9]+)*)$/;
function convertReferenceToPath(matches: RegExpExecArray): string[] {
    return matches[1] ? matches[1].substring(1).split("/") : [];
}

function convertPathToReference(path: string[]): string {
    return `#${path.map(e => `/${e}`).join("")}`;
}

function evaluateReference(schema: JSONSchema, reference: string, path: string[]) {
    try {
        return evaluatePath(schema, path.slice());
    } catch (error) {
        throw new GenerationError(`Failed to evaluate reference ${reference}: ${error}`);
    }
}

interface References {
    [reference: string]: {
        name?: string;
        path: string[];
        schema: JSONSchema;
    };
}

function accumulateReferences(references: References, root: JSONSchema, schema: JSONSchema, path: string[]): void {
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

function convertPathToValidatorFunctionName(path: string[]): string {
    return `validate_${path.join("_")}`;
}

const typePattern = /^(string|number|boolean|object|array)$/;
function generateRecursive(references: References, node: JSONSchema, valuePath: string[], contextPath: string[], skipHelperCheck?: boolean): string {
    const valuePathCode = `json${valuePath.map(e => `.${e}`).join("")}`;

    // Check to see if this fragment was referenced; if so, code has already been generated in a helper and it only needs to be called
    // Note: this check can be forcefully skipped, namely when generating the helpers themselves
    if (skipHelperCheck !== true) {
        const matchingReference = references[convertPathToReference(contextPath)];
        if (matchingReference) {
            return `${convertPathToValidatorFunctionName(contextPath)}(${valuePathCode});`;
        }
    }

    // Check to see if this node is itself a reference; if so, code has already been generated in a helper and it only needs to be called
    if (node.$ref) {
        return `${convertPathToValidatorFunctionName(convertReferenceToPath(internalReferencePattern.exec(node.$ref)!))}(${valuePathCode});`
    }

    // Check the type of this node
    let code = "";
    const errorHeader = `JSON validation error at ${contextPath.length > 0 ? `"${contextPath.join(".")}"` : "root"}:`;
    const nodeType = node.type;
    if (nodeType === undefined || !typePattern.test(nodeType)) {
        throw new GenerationError(`Unknown type at ${contextPath.join(".")}: ${nodeType}`);
    }

    let typeTestCode;
    switch (nodeType) {
        case "string":
        case "number":
        case "boolean":
            typeTestCode = `typeof(${valuePathCode}) !== "${nodeType}"`;
            break;
        
        case "array":
            typeTestCode = `!Array.isArray(${valuePathCode})`;
            break;
        
        case "object":
            typeTestCode = `typeof(${valuePathCode}) !== "${nodeType}" || Array.isArray(${valuePathCode})`;
            break;
    }
    
    // TODO: Could be confusing if got an array (typeof === "object") instead of an object!
    code += `if (${typeTestCode}) {
        throw \`${errorHeader} expected ${nodeType}, but encountered \${typeof(${valuePathCode})}\`;
    }
    `;

    switch (nodeType) {
        case "string": // TODO: Pattern (and maybe format) checking!
        case "number":
        case "boolean":
            // Type checking has already been done; nothing else is needed
            break;

        case "object":
            {
                // Check for required properties
                // TODO: Could just count
                if (node.required) {
                    for (const propertyName of node.required) {
                        if (!node.properties || node.properties[propertyName] === undefined) {
                            throw new GenerationError(`Required property ${propertyName} isn't defined`);
                        }

                        code += `if (${valuePathCode}.${propertyName} === undefined) {
                            throw \`${errorHeader} missing required property: ${propertyName}\`;
                        }
                        `;
                    }
                }

                // Check properties
                if (node.properties) {
                    for (const [propertyName, property] of Object.entries(node.properties)) {
                        code += `if (${valuePathCode}.${propertyName} !== undefined) {
                            ${generateRecursive(references, property, valuePath.concat([propertyName]), contextPath.concat([propertyName]))}
                        }
                        `;
                    }
                }

                // Confirm no additional properties
                // TODO: Only if additionalProperties = false!
                // code += `for (const propertyName of Object.keys(${valuePathCode})) {
                //     switch (propertyName) {
                //         ${Object.keys(node.properties).map(p => `case \"${p}\":`).join("\n")}
                //             break;
                        
                //         default:
                //             throw \`${errorHeader} encountered unexpected property: \${propertyName}\`;
                //     }
                // }
                // `;
            }
            break;
        
        case "array":
            // TODO: Check item type
            break;
    }
    
    return code;
}
/** Generate JavaScript code for validating the given JSON Schema. This should be done during development and the resulting code should be (programmatically) formatted and then checked into source control.
 * 
 * Note: This function should only be called with known safe JSON Schema input (i.e. schema you created yourself). This function has not been analyzed from a security perspective.
 */
export function generateValidatorCode(schema: JSONSchema): string {
    let code = "// Do not edit by hand. This file was generated by json-schema-aot.\n\n"

    // Find references and create a validator for each one (to handle recursion)
    const references: References = {};
    accumulateReferences(references, schema, schema, []);

    for (const [key, { path, schema }] of Object.entries(references)) {
        const functionName = convertPathToValidatorFunctionName(path);
        code += `function ${functionName}(json) {
            ${generateRecursive(references, schema, [], path, true)}
        }
        
        `;
    }

    code += `export function validate(json) {
        ${generateRecursive(references, schema, [], [])}
    }`;

    return code;
}

/** Convenience function for converting a schema object into a JSON schema file.
 * 
 * This can be handy for generating schema programmatically or just to avoid having to put quotes around property names and worry about trailing commas. */
export function generateSchema(schema: JSONSchema): string {
    return JSON.stringify(schema, undefined, 4);
}

function createTypeScriptNameFromTitle(title: string): string {
    return title.replace(/\s+/g, "");
}

function accumulateTitles(titles: References, schema: JSONSchema, path: string[]) {
    const title = schema.title;
    if (title) {
        titles[title] = {
            name: createTypeScriptNameFromTitle(title),
            path,
            schema
        };
    }

    switch (schema.type) {
        case "object":
            {
                const properties = schema.properties;
                if (properties) {
                    for (const [propertyName, property] of Object.entries(properties)) {
                        accumulateTitles(titles, property, path.concat(["properties", propertyName]));
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

                accumulateTitles(titles, items, path.concat(["items"]));
            }
        break;
    }
}

// TODO: Bubble descriptions up...
// TODO: They're called *declaration* files
const stringUnionPatternPattern = /^\^\(([a-zA-Z0-9$]+(\|[a-zA-Z0-9$]+)*)\)\$$/;
function generateTypeScriptDefinitionsRecursive(references: References, schema: JSONSchema, contextPath: string[], forceDefinition?: boolean): string {
    if (schema.$ref) {
        // Reference
        return references[schema.$ref].name!;
    } else if (schema.anyOf) {
        // Union
        const subschemaContextPath = contextPath.concat(["anyOf"]);
        return schema.anyOf!.map(s => generateTypeScriptDefinitionsRecursive(references, s, subschemaContextPath)).join(" | ");
    } else if (schema.allOf) {
        // Intersection
        const subschemaContextPath = contextPath.concat(["allOf"]);
        return schema.allOf!.map(s => generateTypeScriptDefinitionsRecursive(references, s, subschemaContextPath)).join(" & ");
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
                        code += `    ${propertyName}${requiredProperties.has(propertyName) ? "": "?"}: ${generateTypeScriptDefinitionsRecursive(references, property, contextPath.concat(["properties", propertyName]))},\n`;
                    }
                }
                if (schema.additionalProperties) {
                    code += `    [key: string]: ${schema.additionalProperties === true ? "any" : generateTypeScriptDefinitionsRecursive(references, schema.additionalProperties, contextPath.concat(["additionalProperties"]))},`;
                }
                code += "}\n";
                return code;
            }

        case "array":
            return `${generateTypeScriptDefinitionsRecursive(references, schema.items!, contextPath.concat(["items"]))}[]`;

        default:
            throw new GenerationError(`No type specified for ${contextPath.join(".")}`);
    }
}

/** Generate TypeScript definition (.d.ts) for titled types. */
export function generateTypeScriptDefinitions(schema: JSONSchema): string {
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
    const references: References = {};
    accumulateReferences(references, schema, schema, []);

    // Create names for all the referenced subschemas
    for (const reference of Object.values(references)) {
        const title = reference.schema.title;
        const name = title ? createTypeScriptNameFromTitle(title) : `UntitledType${++untitledTypeCount}`;
        reference.name = name;
        typesToGenerate[name] = reference;
    }

    // Find all titled types
    const titles: References = {};
    accumulateTitles(titles, schema, []);

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
                code += `export type ${name} = ${generateTypeScriptDefinitionsRecursive(references, subschema, path)};`;
                break;
            
            case "object":
                code += `export interface ${name} ${generateTypeScriptDefinitionsRecursive(references, subschema, path)}
                
                `;
                break;
        }
    }

    return code;
}
