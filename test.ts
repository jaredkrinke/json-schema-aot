import { assert } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { generateValidatorCode, JSONSchemaNode } from "./mod.ts";

type JSONValue =
    | null
    | string
    | number
    | boolean
    | JSONValue[]
    | { [key: string]: JSONValue }
;

function assertThrows(f: () => void): void {
    let threw = false;
    try {
        f();
    } catch (_e) {
        threw = true;
    }

    assert(threw);
}

// TODO: Use Deno compiler API once it's stable
// deno-lint-ignore ban-types
function compile(code: string): Function {
    return Function("json", code.replace(/export function validate\(json\) \{(.*)\}/s, "$1"));
}

function testSchema(test: {
    schema: JSONSchemaNode;
    valid: JSONValue[];
    invalid: JSONValue[];
}) {
    const { schema, valid, invalid } = test;
    const code = generateValidatorCode(schema);
    // console.log(code);
    const f = compile(code);
    
    for (const value of valid) {
        f(value);
    }

    for (const value of invalid) {
        assertThrows(() => f(value));
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
