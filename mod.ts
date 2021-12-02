/** This interface represents all of the JSON Schema functionality that is supported by this module. */
interface JsonSchemaNode {
    type: "string" | "number" | "boolean" | "object" | "array";

    description?: string;
    pattern?: string;

    ["$schema"]?: string;
    ["$ref"]?: string;

    ["$defs"]?: {
        [key: string]: JsonSchemaNode;
    }

    properties?: {
        [key: string]: JsonSchemaNode;
    }

    required?: string[];
}

// TODO: Needed?
type JsonValue =
    | string
    | number
    | boolean
    | JsonValue[]
    | {[key: string]: JsonValue}
;

function generateRecursive(node: JsonSchemaNode, path: string[]): string {
    const errorHeader = `Unexpected type at "${path}":`;
    let code = "";

    // Check the type of this node
    const nodeType = node.type;
    const typeTestCode = (nodeType === "array") ? "!Array.isArray(json)" : `typeof(json) !== "${nodeType}"`;
    code += `if (${typeTestCode}) {
        throw \`${errorHeader} expected ${nodeType}, but encountered \${typeof(json)}\`;
    }
    `;

    switch (nodeType) {
        case "string":
        case "number":
        case "boolean":
            // Only required type checking;
            break;

        case "object":
            // TODO: Check required and possible properties
            break;
        
        case "array":
            // TODO: Check item type
            break;
    }
    
    return code;
}

export function generateValidatorCode(schema: JsonSchemaNode): string {
    // TODO: Find references and create functions for them
    // TODO: Generate TypeScript type
    // TODO: Generate validator code recursively
    let code = `export function validate(json) {
        ${generateRecursive(schema, ["#"])}
    }`;

    return code;
}