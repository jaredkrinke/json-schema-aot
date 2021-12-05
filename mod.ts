import type { JSONSchema } from "./json-schema.d.ts";
import { generateValidator as generateValidatorFromValidSchema } from "./generate-validator.ts";
import { generateDeclarations as generateDeclarationsFromValidSchema } from "./generate-declarations.ts";
import { validate as validateSchemaInternal } from "./json-schema.validate.js";

// deno-lint-ignore no-explicit-any
function validateSchema(schema: any): JSONSchema {
    validateSchemaInternal(schema);
    return schema as JSONSchema;
}

/** Generate JavaScript code for validating the given JSON Schema. This should be done during development and the resulting code should be checked into source control.
 * 
 * Note: This function should only be called with known safe JSON Schema input (i.e. schema you created yourself). This function has not been analyzed from a security perspective.
 */
// deno-lint-ignore no-explicit-any
export function generateValidator(schema: any): string {
    const validatedSchema = validateSchema(schema)
    return generateValidatorFromValidSchema(validatedSchema);
}

/** Generate TypeScript declaration file (.d.ts) for titled types in the given JSON Schema. */
// deno-lint-ignore no-explicit-any
export function generateDeclarations(schema: any): string {
    const validatedSchema = validateSchema(schema)
    return generateDeclarationsFromValidSchema(validatedSchema);
}
