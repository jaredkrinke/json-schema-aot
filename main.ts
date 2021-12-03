import { processFlags } from "https://deno.land/x/flags_usage@1.0.1/mod.ts";
import { readAll, writeAll } from "https://deno.land/std@0.115.1/streams/conversion.ts";
import { generateValidatorCode, generateTypeScriptDefinitions, JSONSchema } from "./mod.ts";

const flags = processFlags(Deno.args, {
    description: {
        in: "Read JSON Schema from file (default: stdin)",
        js: "Generate JavaScript validation code (this is the default)",
        dts: "Generate TypeScript declaration file (.d.ts)",
    },
    argument: {
        in: "file",
    },
    alias: {
        js: ["j"],
        dts: ["d"],
    },
    boolean: [
        "js",
        "dts",
    ],
    string: [
        "in",
    ],
});

const { ["in"]: inputFile, dts } = flags;
let { js } = flags;

// Default to only generating a validator
if (!js && !dts) {
    js = true;
}

let schemaText: string;
if (inputFile) {
    schemaText = await Deno.readTextFile(inputFile);
} else {
    schemaText = (new TextDecoder()).decode(await readAll(Deno.stdin));
}

// TODO: Validate the schema itself (against what is supported by this tool)
const schema = JSON.parse(schemaText) as JSONSchema;
const textEncoder = new TextEncoder();
if (js) {
    writeAll(Deno.stdout, textEncoder.encode(generateValidatorCode(schema)));
}
if (dts) {
    writeAll(Deno.stdout, textEncoder.encode(generateTypeScriptDefinitions(schema)));
}
