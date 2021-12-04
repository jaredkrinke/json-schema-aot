// Do not edit by hand. This file was generated by json-schema-aot.

function validateJSONSchemaDefinitions(json) {
    if (typeof (json) !== "object") {
        throw `JSON validation error at "$defs.definitions": expected object, but encountered ${typeof (json)}`;
    } else if (Array.isArray(json)) {
        throw `JSON validation error at "$defs.definitions": expected object, but encountered an array`;
    }

    for (const [jsonKey, jsonValue] of Object.entries(json)) {
        switch (jsonKey) {
            default: {
                validateJSONSchema(jsonValue);
                break;
            }
        }
    }
}

function validateJSONSchema(json) {
    if (typeof (json) !== "object") {
        throw `JSON validation error at root: expected object, but encountered ${typeof (json)}`;
    } else if (Array.isArray(json)) {
        throw `JSON validation error at root: expected object, but encountered an array`;
    }

    for (const [jsonKey, jsonValue] of Object.entries(json)) {
        switch (jsonKey) {
            case "title": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "title": expected string, but encountered ${typeof (jsonValue)}`;
                }
                break;
            }

            case "description": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "description": expected string, but encountered ${typeof (jsonValue)}`;
                }
                break;
            }

            case "$schema": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "$schema": expected string, but encountered ${typeof (jsonValue)}`;
                }
                break;
            }

            case "$comment": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "$comment": expected string, but encountered ${typeof (jsonValue)}`;
                }
                break;
            }

            case "$ref": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "$ref": expected string, but encountered ${typeof (jsonValue)}`;
                }
                if (!(/^#(\/[$a-zA-Z0-9]+)*$/.test(jsonValue))) {
                    throw `JSON validation error at "$ref": string did not match pattern /^#(\/[$a-zA-Z0-9]+)*$/: ${jsonValue}`;
                }
                break;
            }

            case "$defs": {
                validateJSONSchemaDefinitions(jsonValue);
                break;
            }

            case "definitions": {
                validateJSONSchemaDefinitions(jsonValue);
                break;
            }

            case "type": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "type": expected string, but encountered ${typeof (jsonValue)}`;
                }
                if (
                    !(/^(string|number|boolean|object|array)$/.test(jsonValue))
                ) {
                    throw `JSON validation error at "type": string did not match pattern /^(string|number|boolean|object|array)$/: ${jsonValue}`;
                }
                break;
            }

            case "pattern": {
                if (typeof (jsonValue) !== "string") {
                    throw `JSON validation error at "pattern": expected string, but encountered ${typeof (jsonValue)}`;
                }
                break;
            }

            case "properties": {
                if (typeof (jsonValue) !== "object") {
                    throw `JSON validation error at "properties": expected object, but encountered ${typeof (jsonValue)}`;
                } else if (Array.isArray(jsonValue)) {
                    throw `JSON validation error at "properties": expected object, but encountered an array`;
                }

                for (
                    const [jsonValueKey, jsonValueValue] of Object.entries(
                        jsonValue,
                    )
                ) {
                    switch (jsonValueKey) {
                        default: {
                            validateJSONSchema(jsonValueValue);
                            break;
                        }
                    }
                }
                break;
            }

            case "required": {
                if (
                    typeof (jsonValue) !== "object" || !Array.isArray(jsonValue)
                ) {
                    throw `JSON validation error at "required": expected array, but encountered ${typeof (jsonValue)}`;
                }

                for (const jsonValueElement of jsonValue) {
                    if (typeof (jsonValueElement) !== "string") {
                        throw `JSON validation error at "required.items": expected string, but encountered ${typeof (jsonValueElement)}`;
                    }
                }

                break;
            }

            case "additionalProperties": {
                {
                    const jsonValueErrors = [];
                    try {
                        if (typeof (jsonValue) !== "boolean") {
                            throw `JSON validation error at "additionalProperties.anyOf": expected boolean, but encountered ${typeof (jsonValue)}`;
                        }
                    } catch (error) {
                        jsonValueErrors.push(error);
                    }
                    try {
                        validateJSONSchema(jsonValue);
                    } catch (error) {
                        jsonValueErrors.push(error);
                    }
                    if (jsonValueErrors.length === 2) {
                        throw `JSON validation error at "additionalProperties": failed to match any of the specified types: ${
                            jsonValueErrors.join("\n\n")
                        }`;
                    }
                }

                break;
            }

            case "items": {
                validateJSONSchema(jsonValue);
                break;
            }

            case "anyOf": {
                if (
                    typeof (jsonValue) !== "object" || !Array.isArray(jsonValue)
                ) {
                    throw `JSON validation error at "anyOf": expected array, but encountered ${typeof (jsonValue)}`;
                }

                for (const jsonValueElement of jsonValue) {
                    validateJSONSchema(jsonValueElement);
                }

                break;
            }

            case "allOf": {
                if (
                    typeof (jsonValue) !== "object" || !Array.isArray(jsonValue)
                ) {
                    throw `JSON validation error at "allOf": expected array, but encountered ${typeof (jsonValue)}`;
                }

                for (const jsonValueElement of jsonValue) {
                    validateJSONSchema(jsonValueElement);
                }

                break;
            }

            default:
                throw `JSON validation error at root: encountered unexpected property: ${jsonKey}`;
        }
    }
}

export function validate(json) {
    validateJSONSchema(json);
}