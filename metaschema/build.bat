deno run --allow-write=json-schema.schema.json build-schema-json.ts
type json-schema.schema.json |deno run ../main.ts - -t > json-schema.ts
