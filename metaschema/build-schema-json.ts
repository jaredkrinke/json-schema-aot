import { JSONSchemaSchema } from "./metaschema.ts";
import { generateValidator, generateDeclarations } from "../mod.ts";

await Promise.all([
    { file: "json-schema.schema.json", generate: () => JSON.stringify(JSONSchemaSchema, undefined, 4) },
    { file: "json-schema.validate.js", generate: () => generateValidator(JSONSchemaSchema) },
    { file: "json-schema.d.ts", generate: () => generateDeclarations(JSONSchemaSchema) },
].map(({ file, generate }) => Deno.writeTextFile(file, generate())));
