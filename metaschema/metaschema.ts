import type { JSONSchema } from "../json-schema.ts";

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
        title: {
            description: "Note: this property is used to generate the name of the type used in TypeScript declarations.",
            type: "string",
        },

        description: {
            description: "Note: this property is added as JSDoc comments in TypeScript declarations.",
            type: "string",
        },

        $schema: { type: "string" },
        $comment: { type: "string" },

        // References and metadata
        $ref: {
            description: "Use this to refer to another point in this schema. Example format: `#/$defs/customSubschema`.",
            type: "string",
            pattern: /^#(\/[$a-zA-Z0-9]+)*$/.source,
        },
        
        $defs: {
            description: "By convention, subschema are defined here and referenced elsewhere.",
            $ref: "#/$defs/definitions",
        },
        
        definitions: {
            description: "This is the old name for `$defs` (allowed here for compatibility).",
            $ref: "#/$defs/definitions",
        }, // Old name for $defs

        // Type information
        type: {
            type: "string",
            pattern: "^(string|number|boolean|object|array)$",
        },

        // String
        pattern: {
            description: "Regular expression used for validating string types.",
            type: "string",
        },

        format: {
            description: "String indicating the format of a string type. The \"date\" and \"date-time\" formats have special handling: when validating, Date objects are tolerated; when parsing, the string is converted to a Date object.",
            type: "string",
        },

        // Object
        properties: {
            description: "Defines properties allowed on objects.",
            type: "object",
            additionalProperties: { $ref: "#" },
        },

        required: {
            description: "Indicates which properties from `properties` are required on objects.",
            type: "array",
            items: { type: "string" },
        },

        additionalProperties: {
            description: "By default, extra properties (beyond what's specified in `properties`) of any type are allowed. Set to false to disallow extra properties. Set to a specific type to type check extra properties.",
            anyOf: [
                { type: "boolean"},
                { $ref: "#" },
            ],
        },

        // Array
        items: {
            description: "Defines the schema for array elements.",
            $ref: "#",
        },

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
