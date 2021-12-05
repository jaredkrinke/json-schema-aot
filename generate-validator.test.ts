import { assert } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import type { JSONSchema } from "./json-schema.d.ts";
import { generateValidator } from "./generate-validator.ts";
import { JSONSchemaSchema } from "./metaschema/metaschema.ts";

type JSONValue =
    | null
    | string
    | number
    | boolean
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
function compile(code: string): Function {
    return Function("json", code.replace(/export function validate\(json\) \{(.*)\}/s, "$1"));
}

function testSchema(test: {
    schema: JSONSchema;
    valid: JSONValue[];
    invalid: JSONValue[];
}) {
    const { schema, valid, invalid } = test;
    const code = generateValidator(schema);
    // console.log(code);
    const f = compile(code);
    
    for (const value of valid) {
        assertNoThrow(() => f(value), JSON.stringify(value));
    }

    for (const value of invalid) {
        assertThrows(() => f(value), JSON.stringify(value));
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

// TODO: Test error messages too
