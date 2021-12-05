import { parseFlags, logUsage, FlagProcessingOptions } from "https://deno.land/x/flags_usage@1.1.0/mod.ts";
import { readAll, writeAll } from "https://deno.land/std@0.115.1/streams/conversion.ts";
import { generateValidator, generateDeclarations } from "./mod.ts";

const flagInfo: FlagProcessingOptions = {
    preamble: `
Usage: json_schema_aot <schema file> [options]

Note: specify "-" to read the schema file from stdin.`,
    description: {
        js: "Generate JavaScript validator and write to <file> (default: stdout)",
        dts: "Generate TypeScript declarations and write to <file> (default: stdout)",
    },
    argument: {
        js: "file",
        dts: "file",
    },
    alias: {
        js: ["j"],
    },
};

const flags = parseFlags(Deno.args, flagInfo);
let exit = flags.help;
if (flags._.length !== 1) {
    console.log("Error: a single schema file (or \"-\") must be specified.");
    exit = true;
}
if (!flags.js && !flags.dts) {
    console.log("Error: no output specified.");
    exit = true;
}
if (exit) {
    logUsage(flagInfo);
    Deno.exit(-1);
}

// Read and parse the schema
const inputFile = "" + flags._[0];
let schemaText: string;
if (inputFile === "-") {
    schemaText = (new TextDecoder()).decode(await readAll(Deno.stdin));
} else {
    schemaText = await Deno.readTextFile(inputFile);
}

const schema = JSON.parse(schemaText);

// Output
const textEncoder = new TextEncoder();
for (const { flag, generate } of [
    { flag: "js", generate: generateValidator },
    { flag: "dts", generate: generateDeclarations },
]) {
    const flagValue = flags[flag];
    if (flagValue) {
        const output = generate(schema);
        if (flagValue === true) {
            writeAll(Deno.stdout, textEncoder.encode(output));
        } else {
            await Deno.writeTextFile(flagValue, output);
        }
    }
}
