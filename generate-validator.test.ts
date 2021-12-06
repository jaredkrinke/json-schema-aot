import { assert, assertEquals } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import type { JSONSchema } from "./json-schema.d.ts";
import { generateJavaScriptParser } from "./generate-validator.ts";
import { JSONSchemaSchema } from "./metaschema/metaschema.ts";

type JSONValue =
    | null
    | string
    | number
    | boolean
    | Date // Not part of JSON; only used here for parsed values
    | JSONValue[]
    | { [key: string]: JSONValue }
;

function assertNoThrow(f: () => void, name: string): void {
    try {
        f();
    } catch (e) {
        throw new Error(`Error on ${name}: ${e}`);
    }
}

function assertThrows(f: () => void, name: string): void {
    let threw = false;
    try {
        f();
    } catch (_e) {
        threw = true;
    }

    assert(threw, `Error on ${name}: should have thrown, but didn't`);
}

// TODO: Use Deno compiler API once it's stable
// deno-lint-ignore ban-types
function compileValidate(code: string): Function {
    return Function("json", code.replaceAll("export", "") + "\n\nvalidate(json);");
}

// deno-lint-ignore ban-types
function compileParse(code: string): Function {
    return Function("json", code.replaceAll("export", "") + "\n\nreturn parse(json);");
}

type TestInputExtended = { input: JSONValue, parse: (input: JSONValue) => JSONValue };
function isTestInputExtended(o: JSONValue | TestInputExtended): o is TestInputExtended {
    return !!o && typeof(o) === "object" && Object.hasOwn(o, "input") && Object.hasOwn(o, "parse");
}

function testSchema(test: {
    schema: JSONSchema;
    valid: (JSONValue | TestInputExtended)[];
    parsed?: JSONValue[];
    invalid: JSONValue[];
}) {
    const { schema, valid, invalid } = test;
    const code = generateJavaScriptParser(schema);
    // console.log(code);
    const validate = compileValidate(code);
    const parse = compileParse(code);

    for (const value of valid) {
        const input = isTestInputExtended(value) ? value.input : value;
        assertNoThrow(() => validate(input), JSON.stringify(input));

        const parsed = parse(input);
        if (isTestInputExtended(value)) {
            assertEquals(parsed, value.parse(input), "Parsed value should match expected result");
        } else {
            assertEquals(parsed, input, "Parsed value should be the same as the input");
        }
    }

    for (const value of invalid) {
        assertThrows(() => validate(value), JSON.stringify(value));
    }
}

Deno.test({
    name: "Just a string",
    fn: () => testSchema({
        schema: { type: "string" },
        valid: [
            "test",
            "",
        ],
        invalid: [
            1,
            null,
            ["test"],
            { test: 1 },
            false,
        ],
    }),
});

Deno.test({
    name: "Just a boolean",
    fn: () => testSchema({
        schema: { type: "boolean" },
        valid: [
            true,
            false,
        ],
        invalid: [
            1,
            null,
            ["test"],
            { test: 1 },
            "hi",
        ],
    }),
});

Deno.test({
    name: "Just a number",
    fn: () => testSchema({
        schema: { type: "number" },
        valid: [
            0,
            1,
            1.1,
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            "hi",
            false,
        ],
    }),
});

Deno.test({
    name: "Non-nested object",
    fn: () => testSchema({
        schema: {
            type: "object",
            properties: {
                str: { type: "string" },
                num: { type: "number" },
                bool: { type: "boolean" },
            },
            required: [
                "bool",
            ],
        },
        valid: [
            { bool: true },
            { bool: true, str: "hi" },
            { bool: true, str: "hi", num: 0 },
            { bool: true, num: 0 },
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            "hi",
            false,
            {},
            { str: "hi", num: 0 },
            { bool: true, str: 0 },
            { bool: "true", str: "str" },
            { bool: true, num: "0" },
        ],
    }),
});

Deno.test({
    name: "Ignore $schema if not specified",
    fn: () => testSchema({
        schema: {
            type: "object",
            properties: {
                str: { type: "string" },
            },
            additionalProperties: false,
            required: [ "str" ],
        },
        valid: [
            { str: "hi" },
            { $schema: "yep", str: "hi" },
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            "hi",
            false,
            {},
            { str: "hi", num: 0 },
        ],
    }),
});
Deno.test({
    name: "Validate $schema if specified",
    fn: () => testSchema({
        schema: {
            type: "object",
            properties: {
                $schema: { type: "string", pattern: "^this exactly$" },
                str: { type: "string" },
            },
            additionalProperties: false,
            required: [ "$schema", "str" ],
        },
        valid: [
            { $schema: "this exactly", str: "hi" },
        ],
        invalid: [
            { $schema: "not exactly", str: "hi" },
            { str: "hi" },
            null,
            ["test"],
            { test: 1 },
            "hi",
            false,
            {},
            { str: "hi", num: 0 },
        ],
    }),
});

Deno.test({
    name: "Nested objects",
    fn: () => testSchema({
        schema: {
            type: "object",
            properties: {
                o: { type: "object", properties: { str: { type: "string" } } }
            },
            required: [
                "o",
            ],
        },
        valid: [
            { o: { str: "hi" } },
            { o: {} },
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            "hi",
            false,
            {},
            { o: [] },
            { o: { str: 0 } },
        ],
    }),
});

Deno.test({
    name: "Validate supported schema against itself",
    fn: () => testSchema({
        schema: JSONSchemaSchema,
        valid: [
            JSONSchemaSchema as JSONValue,
        ],
        invalid: [
            // Add an extra, unexpected property
            // deno-lint-ignore no-explicit-any
            ((s: any) => ({ other: "ha", ...s}))(JSON.parse(JSON.stringify(JSONSchemaSchema))),
        ],
    }),
});

Deno.test({
    name: "Date format",
    fn: () => testSchema({
        schema: { type: "string", format: "date" },
        valid: [
            { input: "2021-12-05", parse: (o: JSONValue) => new Date(o as string) },
            { input: (new Date()).toISOString(), parse: (o: JSONValue) => new Date(o as string) },
            new Date(),
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            false,
            {},
        ],
    }),
});

Deno.test({
    name: "Date-time format",
    fn: () => testSchema({
        schema: { type: "string", format: "date-time" },
        valid: [
            { input: "2021-12-05", parse: (o: JSONValue) => new Date(o as string) },
            { input: (new Date()).toISOString(), parse: (o: JSONValue) => new Date(o as string) },
            new Date(),
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            false,
            {},
        ],
    }),
});

Deno.test({
    name: "Nested date format",
    fn: () => testSchema({
        schema: {
            type: "object",
            properties: {
                "date": {
                    type: "string",
                    format: "date",
                },
            },
            required: [ "date" ],
        },
        valid: [
            { input: { date: "2021-12-05" }, parse: (o: JSONValue) => ({ date: new Date((o as { date: string }).date) }) },
            { input: { date: (new Date()).toISOString() }, parse: (o: JSONValue) => ({ date: new Date((o as { date: string }).date) }) },
            { date: new Date() },
        ],
        invalid: [
            null,
            ["test"],
            { test: 1 },
            false,
            {},
            "2021-12-05",
            (new Date()).toISOString(),
            new Date(),
        ],
    }),
});

// TODO: Test error messages too
