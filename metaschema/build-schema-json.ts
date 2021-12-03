import { JSONSchemaSchema } from "./metaschema.ts";

await Deno.writeTextFile("json-schema.schema.json", JSON.stringify(JSONSchemaSchema, undefined, 4));
