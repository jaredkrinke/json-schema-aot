import {
    JSONSchema,
    validate as validateSchemaInternal,
} from "./json-schema.ts";
import {
    generateJavaScriptParser as generateJavaScriptParserFromValidSchema,
    generateTypeScriptParser as generateTypeScriptParserFromValidSchema,
} from "./generate-parser.ts";
import { generateDeclarationsInternal } from "./generate-declarations.ts";

// deno-lint-ignore no-explicit-any
function validateSchema(schema: any): JSONSchema {
    try {
        validateSchemaInternal(schema);
    } catch (error) {
        console.error(`Error: invalid or unsupported schema; generation failed. See exception information below for details:`);
        throw error;
    }

    return schema as JSONSchema;
}

const header = "// Do not edit by hand. This file was generated by json-schema-aot.\n\n";

/** Generate JavaScript code for validating and parsing the given JSON Schema. This should be done during development and the resulting code should be checked into source control.
 * 
 * Note: This function should only be called with known safe JSON Schema input (i.e. schema you created yourself). This function has not been analyzed from a security perspective.
 */
// deno-lint-ignore no-explicit-any
export function generateJavaScriptParser(schema: any): string {
    const validatedSchema = validateSchema(schema);
    return header + generateJavaScriptParserFromValidSchema(validatedSchema);
}

/** Generate TypeScript declaration file (.d.ts) for titled types in the given JSON Schema. */
// deno-lint-ignore no-explicit-any
export function generateDeclarations(schema: any): string {
    const validatedSchema = validateSchema(schema);
    return header + generateDeclarationsInternal(validatedSchema).code;
}

/** Generate TypeScript declarations and code for validating and parsing the given JSON Schema. This should be done during development and the resulting code should be checked into source control.
 * 
 * Note: This function should only be called with known safe JSON Schema input (i.e. schema you created yourself). This function has not been analyzed from a security perspective.
 */
// deno-lint-ignore no-explicit-any
export function generateTypeScriptDeclarationsAndParser(schema: any): string {
    const validatedSchema = validateSchema(schema);
    const { code: declarations, name } = generateDeclarationsInternal(validatedSchema);
    return header + declarations + generateTypeScriptParserFromValidSchema(validatedSchema, name);
}
