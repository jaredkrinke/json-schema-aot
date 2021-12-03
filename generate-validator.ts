import type { JSONSchema } from "./json-schema.d.ts";
import { GenerationError, References, accumulateReferences, convertReferenceToPath, internalReferencePattern } from "./utils.ts";

function convertPathToReference(path: string[]): string {
    return `#${path.map(e => `/${e}`).join("")}`;
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
    const references = accumulateReferences(schema);

    for (const { path, schema } of Object.values(references)) {
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
