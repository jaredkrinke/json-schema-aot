import {
    assert,
    // assertEquals,
    // assertThrows,
} from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { generateValidatorCode } from "./mod.ts";

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

Deno.test({
    name: "Just a string",
    fn: () => {
        const code = generateValidatorCode({ type: "string" });
        console.log(code);
        const f = compile(code);
        
        // Valid
        f("test");
        f("");

        // Invalid
        assertThrows(() => f(1));
        assertThrows(() => f(null));
        assertThrows(() => f(["test"]));
        assertThrows(() => f({ test: 1}));
        assertThrows(() => f(false));
    }
});
