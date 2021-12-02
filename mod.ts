/** Schema for the subset of JSON Schema that this module supports. */
export const JSONSchemaSchema: JSONSchemaNode = {
    type: "object",
    properties: {
        description: { type: "string" },
        type: {
            type: "string",
            pattern: "string|number|boolean|object|array",
        },

        // References and metadata
        $schema: { type: "string" },
        $ref: { type: "string" },
        $defs: { $ref: "#" },

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

        additionalProperties: { $ref: "#" }, // TODO: Also needs to support false!

        // Array
        items: { $ref: "#" },
    },
    additionalProperties: false,
};

/** This interface represents all of the JSON Schema functionality that is supported by this module. */
export interface JSONSchemaNode {
    type?: "string" | "number" | "boolean" | "object" | "array";

    description?: string;
    pattern?: string;

    ["$schema"]?: string;
    ["$ref"]?: string;

    ["$defs"]?: {
        [key: string]: JSONSchemaNode;
    }

    properties?: {
        [key: string]: JSONSchemaNode;
    }

    additionalProperties?: boolean | JSONSchemaNode;

    items?: JSONSchemaNode;

    required?: string[];
}

export class GenerationError extends Error {
    constructor(message: string) {
        super(message);
    }
}


function evaluatePath(schema: JSONSchemaNode, path: string[]) {
    if (path.length === 0) {
        return schema;
    } else {
        return (schema as unknown as Record<string, JSONSchemaNode>)[path.shift()!]
    }
}

const internalReferencePattern = /#((\/[$a-zA-Z0-9]+)*)/;
function convertReferenceToPath(matches: RegExpExecArray): string[] {
    return matches[1] ? matches[1].substring(1).split("/") : [];
}

function convertPathToReference(path: string[]): string {
    return `#${path.map(e => `/${e}`).join("")}`;
}

function evaluateReference(schema: JSONSchemaNode, reference: string, path: string[]) {
    try {
        return evaluatePath(schema, path.slice());
    } catch (error) {
        throw new GenerationError(`Failed to evaluate reference ${reference}: ${error}`);
    }
}

interface References {
    [reference: string]: {
        path: string[];
        schema: JSONSchemaNode;
    };
}

function accumulateReferences(references: References, root: JSONSchemaNode, schema: JSONSchemaNode, path: string[]): void {
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

function convertPathToValidatorFunctioName(path: string[]): string {
    return `validate_${path.join("_")}`;
}

function generateRecursive(references: References, node: JSONSchemaNode, valuePath: string[], contextPath: string[]): string {
    const valuePathCode = `json${valuePath.map(e => `.${e}`).join("")}`;
    // Check to see if this fragment was referenced; if so, code has already been generated in a helper and it only needs to be called
    const matchingReference = references[convertPathToReference(contextPath)];
    if (matchingReference) {
        return `${convertPathToValidatorFunctioName(contextPath)}(${valuePathCode});`
    }

    // Check the type of this node
    // TODO: Type can be undefined, esp. in the case of references!
    let code = "";
    const errorHeader = `JSON validation error at ${contextPath.length > 0 ? `"${contextPath.join(".")}"` : "root"}:`;
    const nodeType = node.type;

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
export function generateValidatorCode(schema: JSONSchemaNode): string {
    let code = "// Do not edit by hand. This file was generated by json-schema-aot.\n\n"

    // Find references and create a validator for each one (to handle recursion)
    const references: References = {};
    accumulateReferences(references, schema, schema, []);
    // console.log(references);

    for (const [key, { path, schema }] of Object.entries(references)) {
        const functionName = convertPathToValidatorFunctioName(path);
        // Exclude this reference during code generation
        const { [key]: _key, ...rest } = references;

        code += `function ${functionName}(json) {
            ${generateRecursive({...rest}, schema, [], path)}
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
export function generateSchema(schema: JSONSchemaNode): string {
    return JSON.stringify(schema, undefined, 4);
}

// TODO: Generate TypeScript code from schema
