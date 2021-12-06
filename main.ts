import { parseFlags, logUsage, FlagProcessingOptions } from "https://deno.land/x/flags_usage@1.1.0/mod.ts";
import { readAll, writeAll } from "https://deno.land/std@0.115.1/streams/conversion.ts";
import {
    generateDeclarations,
    generateJavaScriptParser,
    generateTypeScriptDeclarationsAndParser,
} from "./mod.ts";

const flagInfo: FlagProcessingOptions = {
    preamble: `
Usage: json_schema_aot <schema file> [options]

Note: specify "-" to read the schema file from stdin.`,
    description: {
        javascript: "Generate JavaScript parser and write to <file> (default: stdout)",
        typescript: "Generate TypeScript declarations and parser and write to <file> (default: stdout)",
        declarations: "Generate TypeScript declarations and write to <file> (default: stdout)",
    },
    argument: {
        javascript: "file",
        typescript: "file",
        declarations: "file",
    },
    alias: {
        javascript: ["j", "js"],
        typescript: ["t", "ts"],
        declarations: ["d", "dts"],
    },
};

const flags = parseFlags(Deno.args, flagInfo);
let exit = flags.help;
if (flags._.length !== 1) {
    console.log("Error: a single schema file (or \"-\") must be specified.");
    exit = true;
}
if (!flags.javascript && !flags.typescript && !flags.declarations) {
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
    { flag: "javascript", generate: generateJavaScriptParser },
    { flag: "typescript", generate: generateTypeScriptDeclarationsAndParser },
    { flag: "declarations", generate: generateDeclarations },
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
