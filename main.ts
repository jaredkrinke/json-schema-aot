import { generateValidatorCode, JSONSchemaNode, JSONSchemaSchema } from "./mod.ts";

// TODO: Validate the schema itself (against what is supported by this tool)
const fileName = Deno.args[0];
const schemaText = await Deno.readTextFile(fileName);
const schema = JSON.parse(schemaText) as JSONSchemaNode;

console.log(generateValidatorCode(schema));
