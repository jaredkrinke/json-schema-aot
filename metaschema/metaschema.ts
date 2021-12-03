import type { JSONSchema } from "../json-schema.d.ts";

/** Schema for the subset of JSON Schema that this module supports. */
export const JSONSchemaSchema: JSONSchema = {
    title: "JSON Schema",
    description: "This interface represents all of the JSON Schema functionality that is supported by this module.",

    $defs: {
        "definitions": {
            title: "JSON Schema Definitions",
            type: "object",
            additionalProperties: { $ref: "#" },
        },
    },

    type: "object",
    properties: {
        // Metadata
        title: { type: "string" },
        description: { type: "string" },
        $schema: { type: "string" },
        $comment: { type: "string" },

        // References and metadata
        $ref: {
            type: "string",
            pattern: "^#(\/[$a-zA-Z0-9]+)*$",
        },
        
        $defs: { $ref: "#/$defs/definitions" },
        definitions: { $ref: "#/$defs/definitions" }, // Old name for $defs

        // Type information
        type: {
            type: "string",
            pattern: "^(string|number|boolean|object|array)$",
        },

        // String
        pattern: { type: "string" },

        // Object
        properties: {
            type: "object",
            additionalProperties: { $ref: "#" },
        },

        required: {
            type: "array",
            items: { type: "string" },
        },

        additionalProperties: {
            anyOf: [
                { type: "boolean"},
                { $ref: "#" },
            ],
        },

        // Array
        items: { $ref: "#" },

        // Union and intersection
        anyOf: {
            type: "array",
            items: { $ref: "#" },
        },

        allOf: {
            type: "array",
            items: { $ref: "#" },
        }
    },
    additionalProperties: false,
};
